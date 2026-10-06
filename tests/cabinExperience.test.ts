import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { seatProducts } from "../src/config/cabinProducts";
import { aircraftById, aircraftModels } from "../src/data/aircraft";
import { CABIN_CLASSES, totalPassengerSeats } from "../src/lib/cabin";
import { cabinComfort, cabinFareMultiplier, configuredCabinLayout, configuredCargoLimit, configuredPurchasePrice,
  defaultCabinConfiguration, moveCabinBoundary, normalizeCabinConfiguration, setCabinSpace, setSeatProduct, validateCabinConfiguration } from "../src/lib/cabinConfiguration";
import { normalizeCabinTemplates } from "../src/lib/cabinTemplates";
import { createCompactSaveState, restoreGameStateFromCloudSave } from "../src/lib/cloudSave";
import { estimateExpectedFlightProfit, estimateScheduleFinancials } from "../src/lib/economy";
import { advanceFleetOperations } from "../src/lib/fleetOperations";
import { referenceWindowDemand } from "../src/lib/marketDemand";
import { forecastOperations } from "../src/lib/operationForecast";
import { flightExperienceScores, normalizePassengerExperience, passengerExperienceSummary, reputationAttractiveness } from "../src/lib/passengerExperience";
import { DAY_MS } from "../src/lib/time";
import { normalizeGame, useGameStore } from "../src/store/gameStore";
import type { CabinConfiguration } from "../src/types/cabin";

const now = Date.UTC(2026, 0, 1, 11);
const hour = 3600000;
const model = aircraftById["737-max-8"];
useGameStore.persist.setOptions({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });
function fixture(count = 1, grade: "basic" | "premium" | "luxury" = "basic") {
  const configuration = setSeatProduct(model, defaultCabinConfiguration(model, true), "economy", grade);
  const game = normalizeGame(restoreGameStateFromCloudSave({ saveFormatVersion: 2, airlineName: "Cabin Air", difficulty: "realistic", baseAirportId: "lhr",
    money: 1e9, currentGameTimeMs: now, baseGameTimeMs: now, isPaused: true,
    routes: [{ id: "lhr-cdg", originAirportId: "lhr", destinationAirportId: "cdg", isOpen: true }],
    fleet: Array.from({ length: count }, (_, index) => ({ id: `plane-${index}`, modelId: model.id, registration: `G-C${index}`,
      homeBaseAirportId: "lhr", currentAirportId: "lhr", cabinLayout: configuredCabinLayout(model, configuration), cabinConfiguration: structuredClone(configuration),
      weeklySchedules: [], schedule: [{ id: `flight-${index}`, aircraftId: `plane-${index}`, routeId: "lhr-cdg", originAirportId: "lhr", destinationAirportId: "cdg",
        departureGameTime: now + hour, arrivalGameTime: now + 2 * hour, readyGameTime: now + 3 * hour,
        status: "scheduled", baseDelayMinutes: 0, technicalChecked: true }] })) }))!;
  game.routes[0].estimatedDemand = { first: 0, business: 0, premiumEconomy: 0, economy: 2800, cargoTons: 140 };
  game.routes[0].pricing = { ...game.routes[0].pricing! };
  return game;
}

test("every model has valid suggested/max row layouts; 737 locks First and A330 supports its products", () => {
  for (const aircraft of aircraftModels) for (const maximum of [false, true]) {
    const config = defaultCabinConfiguration(aircraft, maximum);
    const layout = configuredCabinLayout(aircraft, config);
    assert.ok(validateCabinConfiguration(aircraft, config, layout).isValid, aircraft.id);
    assert.ok(totalPassengerSeats(layout) <= aircraft.maxPassengerSeats);
    for (const cabin of CABIN_CLASSES) {
      const product = seatProducts(aircraft, cabin)[0];
      assert.ok(!layout[cabin] || (product && layout[cabin] % product.seatsPerRow === 0));
    }
  }
  assert.deepEqual(seatProducts(model, "first"), []);
  assert.deepEqual(seatProducts(aircraftById["a330-900neo"], "first").map((item) => item.arrangement), ["1-2-1", "1-2-1", "1-1-1"]);
});

test("Boeing thumbnails resolve existing uploaded assets without replacing Airbus image mappings", () => {
  for (const aircraft of aircraftModels.filter((item) => item.manufacturer === "Boeing")) {
    assert.ok(aircraft.imageUrl?.startsWith("/aircraft-side/"));
    assert.ok(existsSync(join(process.cwd(), "public", aircraft.imageUrl!)));
  }
  assert.equal(aircraftById["a220-300"].imageUrl, "/aircraft/a220-300.jpg");
  assert.equal(aircraftById["a330-900neo"].imageUrl, "/aircraft/a330-900neo.jpg");
});

test("new narrowbody Premium Economy keeps economy's abreast count for every grade", () => {
  for (const aircraft of aircraftModels.filter((item) => item.type === "narrowbody")) {
    const arrangement = aircraft.id === "a220-300" ? "2-3" : "3-3";
    for (const cabin of ["premiumEconomy", "economy"] as const) {
      assert.deepEqual(seatProducts(aircraft, cabin).map((product) => product.arrangement), [arrangement, arrangement, arrangement]);
      const initial = setCabinSpace(aircraft, defaultCabinConfiguration(aircraft), cabin, 100);
      for (const grade of ["basic", "premium", "luxury"] as const) {
        const config = setSeatProduct(aircraft, initial, cabin, grade);
        assert.equal(config.version, 2);
        assert.ok(configuredCabinLayout(aircraft, config)[cabin] % seatProducts(aircraft, cabin)[0].seatsPerRow === 0);
        assert.ok(validateCabinConfiguration(aircraft, config).isValid);
      }
    }
  }
  assert.deepEqual(seatProducts(aircraftById["a330-900neo"], "premiumEconomy").map((item) => item.arrangement), ["2-3-2", "2-3-2", "2-2-2"]);
  assert.deepEqual(seatProducts(aircraftById["a350-900"], "premiumEconomy").map((item) => item.arrangement), ["2-4-2", "2-3-2", "2-2-2"]);
  assert.deepEqual(seatProducts(aircraftById["777-300er"], "premiumEconomy").map((item) => item.arrangement), ["2-4-2", "2-3-2", "2-2-2"]);
  assert.ok(existsSync(join(process.cwd(), "public/cabin/seat-products.png")));
});

test("drag boundaries transfer only neighboring space, clamp endpoints and never mutate the original", () => {
  const aircraft = aircraftById["a330-900neo"];
  const initial = defaultCabinConfiguration(aircraft);
  const before = JSON.stringify(initial);
  const boundary = initial.sections.first.spacePercent + initial.sections.business.spacePercent;
  const moved = moveCabinBoundary(aircraft, initial, "business", boundary + 3);
  assert.equal(moved.sections.first.spacePercent, initial.sections.first.spacePercent);
  assert.equal(moved.sections.economy.spacePercent, initial.sections.economy.spacePercent);
  assert.equal(moved.sections.business.spacePercent, initial.sections.business.spacePercent + 3);
  assert.equal(moved.sections.premiumEconomy.spacePercent, initial.sections.premiumEconomy.spacePercent - 3);
  for (const position of [-100, 0, 12.345, 100, 10000]) {
    const config = moveCabinBoundary(aircraft, initial, "business", position);
    assert.ok(validateCabinConfiguration(aircraft, config).isValid);
    assert.equal(Math.round(CABIN_CLASSES.reduce((sum, cabin) => sum + config.sections[cabin].spacePercent, 0)), 100);
  }
  assert.equal(moveCabinBoundary(model, initial, "first", 10), initial);
  assert.equal(moveCabinBoundary(aircraft, initial, "economy", 10), initial);
  assert.equal(moveCabinBoundary(aircraft, initial, "business", NaN), initial);
  assert.equal(JSON.stringify(initial), before);
});

test("V1.7.0 products, aircraft seats, price and reviews survive a V1.7.1 compact save reload", () => {
  const game = fixture();
  const legacy = defaultCabinConfiguration(model);
  legacy.version = 1;
  legacy.sections.premiumEconomy.grade = "luxury";
  legacy.sections.premiumEconomy.pitchInches = 40;
  legacy.sections.economy.grade = "luxury";
  legacy.sections.economy.pitchInches = 36;
  game.fleet[0].cabinConfiguration = legacy;
  game.fleet[0].cabinLayout = configuredCabinLayout(model, legacy);
  game.cabinTemplates = [{ id: "legacy-product", name: "Legacy", modelId: model.id, configuration: structuredClone(legacy) }];
  const before = JSON.stringify(game);
  const price = configuredPurchasePrice(model, legacy);
  const comfort = cabinComfort(model, legacy, "economy");
  const restored = normalizeGame(restoreGameStateFromCloudSave(JSON.parse(JSON.stringify(createCompactSaveState(game)))))!;
  assert.deepEqual(restored.fleet[0].cabinConfiguration, legacy);
  assert.deepEqual(restored.fleet[0].cabinLayout, game.fleet[0].cabinLayout);
  assert.equal(restored.money, game.money);
  assert.equal(configuredPurchasePrice(model, restored.fleet[0].cabinConfiguration!), price);
  assert.equal(cabinComfort(model, restored.fleet[0].cabinConfiguration!, "economy"), comfort);
  assert.deepEqual(restored.cabinTemplates, game.cabinTemplates);
  const draft = normalizeCabinConfiguration(model, restored.cabinTemplates![0].configuration);
  assert.equal(draft.version, 2);
  assert.ok(validateCabinConfiguration(model, draft).isValid);
  assert.equal(JSON.stringify(game), before);
  assert.equal(seatProducts(model, "premiumEconomy", 1)[2].arrangement, "2-2");
  assert.equal(seatProducts(model, "premiumEconomy", 2)[2].arrangement, "3-3");
});

test("100 upgraded aircraft retain bounded review aggregates during a recurring-week forecast", () => {
  const game = fixture(100, "luxury");
  game.fleet = game.fleet.map((aircraft, index) => ({ ...aircraft, schedule: [], weeklySchedules: [{
    id: `cabin-week-${index}`, aircraftId: aircraft.id, routeId: "lhr-cdg", outboundFlightNumber: `CX${100 + index * 2}`,
    returnFlightNumber: `CX${101 + index * 2}`, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], departureTimeLocal: "12:00", isRoundTrip: true,
    blockMinutes: 180, turnaroundMinutes: 45, recurrenceRule: "WEEKLY", createdGameTime: now, createdAt: "2026-01-01", updatedAt: "2026-01-01"
  }] }));
  const before = JSON.stringify(game);
  const forecast = forecastOperations(game, 7);
  assert.ok(forecast.flights.length >= 1000);
  assert.ok(forecast.game.fleet.every((aircraft) => (aircraft.passengerExperience?.days.length ?? 0) <= 7));
  assert.ok(JSON.stringify(createCompactSaveState(forecast.game)).length < 900000);
  assert.equal(JSON.stringify(game), before);
});

test("increasing pitch reduces whole rows without moving other cabin allocations", () => {
  const initial = defaultCabinConfiguration(model, true);
  let previous = totalPassengerSeats(configuredCabinLayout(model, initial));
  for (let pitch = 28; pitch <= 38; pitch++) {
    const config = structuredClone(initial);
    config.sections.economy.pitchInches = pitch;
    const seats = configuredCabinLayout(model, config).economy;
    assert.ok(seats <= previous);
    assert.equal(seats % 6, 0);
    assert.equal(config.sections.economy.spacePercent, 100);
    assert.ok(validateCabinConfiguration(model, config).isValid);
    previous = seats;
  }
  assert.ok(previous < configuredCabinLayout(model, initial).economy);
});

test("normalization clamps pitch and space; purchase rejects bad products and mismatched seat snapshots", () => {
  const config = defaultCabinConfiguration(model);
  const raw = structuredClone(config);
  raw.sections.first.spacePercent = 30;
  raw.sections.economy.pitchInches = 10000;
  raw.sections.business.grade = "unknown" as never;
  raw.cargoTons = NaN;
  assert.equal(validateCabinConfiguration(model, raw).isValid, false);
  const normalized = normalizeCabinConfiguration(model, raw);
  assert.equal(normalized.sections.first.spacePercent, 0);
  assert.equal(normalized.sections.economy.pitchInches, 38);
  assert.equal(normalized.sections.business.grade, "basic");
  assert.equal(normalized.cargoTons, 0);
  assert.ok(validateCabinConfiguration(model, normalized).isValid);
  assert.equal(validateCabinConfiguration(model, config, { ...configuredCabinLayout(model, config), economy: 9999 }).isValid, false);
  assert.equal(validateCabinConfiguration(model, { version: 1 } as CabinConfiguration).isValid, false);
});

test("allocation respects total space, cargo stays bounded and maximum seats retains model limits", () => {
  let config = defaultCabinConfiguration(model);
  for (const cabin of ["business", "premiumEconomy", "economy"] as const) for (const percent of [0, 10, 50, 100]) {
    config = setCabinSpace(model, config, cabin, percent);
    assert.ok(CABIN_CLASSES.reduce((sum, key) => sum + config.sections[key].spacePercent, 0) <= 100.00001);
    assert.ok(totalPassengerSeats(configuredCabinLayout(model, config)) <= model.maxPassengerSeats);
    assert.ok(configuredCargoLimit(model, config) <= model.maxCargoTons);
  }
  const maximum = defaultCabinConfiguration(model, true);
  const roomy = structuredClone(maximum);
  roomy.sections.economy.pitchInches = 38;
  assert.ok(Math.abs(configuredCargoLimit(model, roomy) - configuredCargoLimit(model, maximum)) < 1);
});

test("luxury stays in its cabin class, lowers capacity and raises comfort/willingness with bounded gains", () => {
  const basic = defaultCabinConfiguration(model, true);
  basic.sections.economy.pitchInches = 31;
  const luxury = setSeatProduct(model, basic, "economy", "luxury");
  assert.equal(configuredCabinLayout(model, luxury).first, 0);
  assert.ok(configuredCabinLayout(model, luxury).economy < configuredCabinLayout(model, basic).economy);
  assert.ok(cabinComfort(model, luxury, "economy", 8) > cabinComfort(model, basic, "economy", 8));
  assert.ok(cabinFareMultiplier(model, luxury, "economy", 8) > 1);
  assert.ok(cabinFareMultiplier(model, luxury, "economy", 8) <= 1.28);
  assert.ok(cabinComfort(model, defaultCabinConfiguration(model, true), "economy", 8) < cabinComfort(model, defaultCabinConfiguration(model, true), "economy", 1));
});

test("luxury products incur cleaning and maintenance costs; fare changes remain manual", () => {
  const game = fixture();
  const before = JSON.stringify(game.routes[0].pricing);
  const basic = estimateExpectedFlightProfit(game.routes[0], model, game.fleet[0], game.difficultyConfig);
  const upgraded = fixture(1, "luxury");
  const luxury = estimateExpectedFlightProfit(game.routes[0], model, upgraded.fleet[0], game.difficultyConfig);
  assert.ok(luxury.cost > basic.cost);
  assert.ok(luxury.economics.estimatedMaintenanceReservePerFlight > basic.economics.estimatedMaintenanceReservePerFlight);
  assert.equal(JSON.stringify(game.routes[0].pricing), before);
  const weekly = estimateScheduleFinancials({ route: game.routes[0], model, aircraft: upgraded.fleet[0], daysOfWeek: [1], isRoundTrip: false, difficultyConfig: game.difficultyConfig });
  assert.equal(weekly.perFlight.cost, luxury.cost);
});

test("expensive fares lower value ratings; absurd fares sell no seats even with luxury products", () => {
  const game = fixture(1, "luxury");
  const route = game.routes[0];
  const fair = flightExperienceScores(route, model, game.fleet[0]);
  const expensive = { ...route, pricing: { ...route.pricing!, economy: route.pricing!.economy * 3 } };
  assert.ok(flightExperienceScores(expensive, model, game.fleet[0]).economy < fair.economy);
  route.pricing!.economy = 1e9;
  const result = advanceFleetOperations(game, now, now + 4 * hour).game;
  assert.equal(result.passengerCount, game.passengerCount);
  assert.equal(passengerExperienceSummary(result.fleet, result.currentGameTimeMs).score, null);
});

test("ratings begin only at arrival; delayed flights rate lower and repeated ticks do not award again", () => {
  const game = fixture();
  const departed = advanceFleetOperations(game, now, now + hour).game;
  assert.equal(passengerExperienceSummary(departed.fleet, now + hour).score, null);
  const arrived = advanceFleetOperations(departed, now + hour, now + 4 * hour).game;
  const score = passengerExperienceSummary(arrived.fleet, now + 4 * hour);
  assert.ok(score.passengers > 0);
  assert.equal(score.passengers, arrived.passengerCount - game.passengerCount);
  assert.equal(arrived.flightLog[0].passengerSatisfaction, score.score);
  const again = advanceFleetOperations(arrived, now + 4 * hour, now + 5 * hour).game;
  assert.deepEqual(passengerExperienceSummary(again.fleet, now + 5 * hour), score);
  assert.equal(again.money, arrived.money);
  const delayed = fixture();
  delayed.fleet[0].schedule[0].baseDelayMinutes = 90;
  const late = advanceFleetOperations(delayed, now, now + 6 * hour).game;
  assert.ok(passengerExperienceSummary(late.fleet, now + 6 * hour).score! < score.score!);
});

test("cancelled flights create no reviews and previews do not change actual ratings/cash", () => {
  const game = fixture();
  const initial = JSON.stringify(game);
  forecastOperations(game, 1);
  assert.equal(JSON.stringify(game), initial);
  game.fleet[0].schedule[0].status = "cancelled";
  const result = advanceFleetOperations(game, now, now + 4 * hour).game;
  assert.equal(passengerExperienceSummary(result.fleet, now + 4 * hour).score, null);
  assert.equal(result.money, game.money);
});

test("departure experience and financials survive later fare/cabin changes and compact reload", () => {
  const game = fixture(1, "luxury");
  const departed = advanceFleetOperations(game, now, now + hour).game;
  const restored = restoreGameStateFromCloudSave(JSON.parse(JSON.stringify(createCompactSaveState(departed))));
  const booking = restored.fleet[0].schedule[0].booking!;
  const expectedScore = booking.experienceScores!.economy;
  restored.routes[0].pricing!.economy = 1e9;
  restored.fleet[0].cabinConfiguration = defaultCabinConfiguration(model, true);
  restored.fleet[0].cabinLayout = configuredCabinLayout(model, restored.fleet[0].cabinConfiguration);
  const arrived = advanceFleetOperations(restored, now + hour, now + 4 * hour).game;
  assert.equal(passengerExperienceSummary(arrived.fleet, now + 4 * hour).score, expectedScore);
  assert.equal(arrived.fleet[0].totalRevenue, booking.revenue);
});

test("online/offline and reversed fleet ordering yield identical ratings and shared finite demand", () => {
  const game = fixture(8, "luxury");
  const offline = advanceFleetOperations(game, now, now + 5 * hour).game;
  let online = game;
  for (let time = now + 15 * 60000; time <= now + 5 * hour; time += 15 * 60000) online = advanceFleetOperations(online, online.currentGameTimeMs, time).game;
  const reversed = advanceFleetOperations({ ...game, fleet: [...game.fleet].reverse() }, now, now + 5 * hour).game;
  assert.equal(offline.money, online.money);
  assert.equal(reversed.money, online.money);
  assert.deepEqual(passengerExperienceSummary(offline.fleet, now + 5 * hour), passengerExperienceSummary(online.fleet, now + 5 * hour));
  assert.deepEqual(passengerExperienceSummary(reversed.fleet, now + 5 * hour), passengerExperienceSummary(online.fleet, now + 5 * hour));
  assert.ok(offline.passengerCount - game.passengerCount <= referenceWindowDemand(game.routes[0], "lhr", now + hour).economy * 1.6);
  assert.ok(offline.routeMarket!.windows[0].consumed.economy <= referenceWindowDemand(game.routes[0], "lhr", now + hour).economy);
});

test("passenger-weighted company ratings, neutral confidence and seven-day retention stay bounded", () => {
  const day = Math.floor(now / DAY_MS);
  const raw = (passengers: number, score: number) => ({ version: 1 as const, days: [{ day, cabins: {
    first: { passengers: 0, scoreTotal: 0 }, business: { passengers: 0, scoreTotal: 0 }, premiumEconomy: { passengers: 0, scoreTotal: 0 },
    economy: { passengers, scoreTotal: passengers * score } } }] });
  assert.equal(passengerExperienceSummary([{ passengerExperience: raw(90, 60) }, { passengerExperience: raw(10, 100) }], now).score, 64);
  const aircraft = fixture().fleet[0];
  assert.equal(reputationAttractiveness(aircraft, "economy", now), 1);
  assert.ok(reputationAttractiveness({ ...aircraft, passengerExperience: raw(1, 100) }, "economy", now) < 1.001);
  assert.ok(reputationAttractiveness({ ...aircraft, passengerExperience: raw(10000, 100) }, "economy", now) <= 1.08);
  assert.equal(normalizePassengerExperience(raw(10, 70), now + 7 * DAY_MS)!.days.length, 0);
  assert.equal(normalizePassengerExperience(raw(10, 70), now - DAY_MS)!.days.length, 0);
});

test("new configuration, reviews and templates round-trip while old saves keep original seats and cash", () => {
  const game = advanceFleetOperations(fixture(), now, now + 4 * hour).game;
  game.cabinTemplates = [{ id: "test-template", name: "Short haul", modelId: model.id, configuration: structuredClone(game.fleet[0].cabinConfiguration!) }];
  const restored = normalizeGame(restoreGameStateFromCloudSave(JSON.parse(JSON.stringify(createCompactSaveState(game)))))!;
  assert.deepEqual(restored.fleet[0].cabinConfiguration, game.fleet[0].cabinConfiguration);
  assert.deepEqual(restored.fleet[0].passengerExperience, game.fleet[0].passengerExperience);
  assert.deepEqual(restored.cabinTemplates, game.cabinTemplates);
  assert.equal(restored.money, game.money);
  const legacy = fixture();
  legacy.fleet[0].cabinConfiguration = undefined;
  legacy.fleet[0].cabinLayout = { first: 0, business: 13, premiumEconomy: 17, economy: 99, cargoTons: 4 };
  const old = normalizeGame(restoreGameStateFromCloudSave(JSON.parse(JSON.stringify(createCompactSaveState(legacy)))))!;
  assert.deepEqual(old.fleet[0].cabinLayout, legacy.fleet[0].cabinLayout);
  assert.equal(old.fleet[0].cabinConfiguration, undefined);
  assert.equal(old.money, legacy.money);
  assert.equal(passengerExperienceSummary(old.fleet, now).score, null);
});

test("purchase uses canonical configured cost, clones aircraft settings and rejects stale/malicious layouts", () => {
  const game = fixture();
  game.fleet = [];
  useGameStore.setState({ game });
  const configuration = defaultCabinConfiguration(model);
  const layout = configuredCabinLayout(model, configuration);
  const price = configuredPurchasePrice(model, configuration);
  const result = useGameStore.getState().buyAircraft(model.id, layout, "G-NEW", "lhr", configuration);
  assert.ok(result.ok);
  assert.equal(useGameStore.getState().game!.money, game.money - price);
  configuration.sections.economy.pitchInches = 38;
  assert.notEqual(result.aircraft!.cabinConfiguration!.sections.economy.pitchInches, 38);
  const cash = useGameStore.getState().game!.money;
  assert.equal(useGameStore.getState().buyAircraft(model.id, { ...layout, economy: 9999 }, "G-BAD", "lhr", configuration).ok, false);
  assert.equal(useGameStore.getState().game!.money, cash);
  useGameStore.setState({ game: null });
});

test("completed save snapshots are compact but airborne financial/experience locks remain intact", () => {
  const game = fixture();
  const departed = advanceFleetOperations(game, now, now + hour).game;
  const pending = createCompactSaveState(departed);
  assert.deepEqual(pending.fleet[0].schedule[0].booking, departed.fleet[0].schedule[0].booking);
  const arrived = advanceFleetOperations(departed, now + hour, now + 4 * hour).game;
  const compact = createCompactSaveState(arrived);
  assert.equal(compact.fleet[0].schedule[0].booking, undefined);
  assert.equal(compact.fleet[0].schedule[0].revenue, arrived.fleet[0].schedule[0].revenue);
  assert.ok(arrived.fleet[0].schedule[0].booking, "compact serialization must not mutate the live aircraft");
  assert.deepEqual(compact.fleet[0].passengerExperience, arrived.fleet[0].passengerExperience);
});

test("template save/overwrite/delete preserves existing aircraft and caps saved templates", () => {
  const game = fixture();
  useGameStore.setState({ game });
  const original = JSON.stringify(game.fleet);
  const config = defaultCabinConfiguration(model);
  for (let index = 0; index < 12; index++) assert.equal(useGameStore.getState().saveCabinTemplate(model.id, `Template ${index}`, config), true);
  assert.equal(useGameStore.getState().saveCabinTemplate(model.id, "Extra", config), false);
  assert.equal(useGameStore.getState().saveCabinTemplate(model.id, "Template 0", setSeatProduct(model, config, "economy", "luxury")), true);
  assert.equal(useGameStore.getState().game!.cabinTemplates!.length, 12);
  assert.equal(JSON.stringify(useGameStore.getState().game!.fleet), original);
  const id = useGameStore.getState().game!.cabinTemplates![0].id;
  useGameStore.getState().deleteCabinTemplate(id);
  assert.equal(useGameStore.getState().game!.cabinTemplates!.length, 11);
  assert.deepEqual(normalizeCabinTemplates([{ id: "invalid", name: "Bad", modelId: "missing", configuration: config }]), []);
  useGameStore.setState({ game: null });
});
