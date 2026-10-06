import assert from "node:assert/strict";
import test from "node:test";
import { aircraftById } from "../src/data/aircraft";
import { normalizeAircraftLifecycle } from "../src/lib/aircraftMaintenance";
import { restoreGameStateFromCloudSave, createCompactSaveState } from "../src/lib/cloudSave";
import { advanceFleetOperations } from "../src/lib/fleetOperations";
import { distanceDemandMultiplier } from "../src/lib/demand";
import { demandAtPrice, marketWindow, priceDemandMultiplier, referenceWindowDemand } from "../src/lib/marketDemand";
import { forecastOperations } from "../src/lib/operationForecast";
import { copyWeeklySchedules, prepareWeeklySchedule } from "../src/lib/scheduleActions";
import { recentOperatingTotals } from "../src/lib/financialReports";
import { DAY_MS } from "../src/lib/time";
import { normalizeGame, useGameStore } from "../src/store/gameStore";

const hour = 3600000;
const now = Date.UTC(2026, 0, 1, 11);
useGameStore.persist.setOptions({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });
function fixture(count = 2) {
  const game = restoreGameStateFromCloudSave({ saveFormatVersion: 2, airlineName: "Market Air", difficulty: "easy", baseAirportId: "lhr",
    money: 100000000, currentGameTimeMs: now, baseGameTimeMs: now, isPaused: false,
    routes: [{ id: "lhr-cdg", originAirportId: "lhr", destinationAirportId: "cdg", isOpen: true }],
    fleet: Array.from({ length: count }, (_, index) => ({ id: `plane-${index}`, modelId: "a220-300", registration: `G-M${index}`,
      homeBaseAirportId: "lhr", currentAirportId: "lhr", cabinLayout: aircraftById["a220-300"].suggestedLayout, weeklySchedules: [],
      schedule: [{ id: `leg-${index}`, aircraftId: `plane-${index}`, routeId: "lhr-cdg", originAirportId: "lhr", destinationAirportId: "cdg",
        departureGameTime: now + hour, arrivalGameTime: now + 2 * hour, readyGameTime: now + 3 * hour,
        status: "scheduled", baseDelayMinutes: 0, technicalChecked: true }] })) });
  game.routes[0].estimatedDemand = { first: 0, business: 0, premiumEconomy: 0, economy: 2800, cargoTons: 140 };
  return game;
}

test("price curves are bounded, strictly falling and approach zero for every class", () => {
  for (const cabin of ["first", "business", "premiumEconomy", "economy", "cargo"] as const) {
    let previous = Infinity;
    for (const price of [0, 10, 50, 100, 150, 200, 400, 1000, 1000000]) {
      const multiplier = priceDemandMultiplier(100, price, cabin);
      assert.ok(multiplier <= 1.6 && multiplier >= 0 && multiplier < previous);
      previous = multiplier;
    }
    assert.equal(priceDemandMultiplier(100, 100, cabin), 1);
    assert.equal(priceDemandMultiplier(100, 1000000, cabin), 0);
  }
  assert.equal(priceDemandMultiplier(100, NaN, "economy"), 0);
  assert.equal(priceDemandMultiplier(100, -1, "economy"), 0);
});

test("very short and very long routes lose demand without jumps in the distance coefficient", () => {
  assert.ok(distanceDemandMultiplier(100) < distanceDemandMultiplier(1500));
  assert.ok(distanceDemandMultiplier(16000) < distanceDemandMultiplier(3500));
  assert.ok(Math.abs(distanceDemandMultiplier(3499) - distanceDemandMultiplier(3501)) < 0.001);
  assert.equal(distanceDemandMultiplier(0), 0);
  assert.equal(distanceDemandMultiplier(Infinity), 0);
});

test("local-hour red-eye windows have less passenger demand, including long-haul; cargo is unchanged", () => {
  const route = fixture().routes[0];
  for (const distanceKm of [500, 3500, 10000]) {
    const candidate = { ...route, distanceKm };
    const day = referenceWindowDemand(candidate, "lhr", now + hour);
    const night = referenceWindowDemand(candidate, "lhr", Date.UTC(2026, 0, 2, 1));
    assert.ok(night.economy < day.economy);
    assert.equal(night.cargoTons, day.cargoTons);
  }
  const weekly = Array.from({ length: 6 }, (_, index) => referenceWindowDemand(route, "lhr", Date.UTC(2026, 0, 1, index * 4)).economy)
    .reduce((sum, value) => sum + value, 0) * 14;
  assert.ok(Math.abs(weekly - route.estimatedDemand.economy) < 1e-8);
  assert.notEqual(marketWindow(route, "lhr", now).key, marketWindow(route, "cdg", now).key);
});

test("same-direction departures share a finite window instead of duplicating route demand", () => {
  const game = fixture(10);
  const result = advanceFleetOperations(game, now, now + 4 * hour).game;
  const passengers = result.passengerCount - game.passengerCount;
  assert.ok(passengers <= demandAtPrice(game.routes[0], referenceWindowDemand(game.routes[0], "lhr", now + hour)).economy);
  assert.equal(result.completedFlights, 10);
  assert.equal(result.routeMarket?.windows.length, 1);
  assert.equal(game.routeMarket, undefined);
  assert.equal(game.fleet[0].schedule[0].booking, undefined);
});

test("online steps, offline catch-up and reversed fleet order settle identically", () => {
  const game = fixture(5);
  const offline = advanceFleetOperations(game, now, now + 4 * hour).game;
  let online = game;
  for (let time = now + 10 * 60000; time <= now + 4 * hour; time += 10 * 60000) online = advanceFleetOperations(online, online.currentGameTimeMs, time).game;
  const reversed = advanceFleetOperations({ ...game, fleet: [...game.fleet].reverse() }, now, now + 4 * hour).game;
  assert.equal(online.money, offline.money);
  assert.equal(reversed.money, offline.money);
  assert.equal(online.passengerCount, offline.passengerCount);
  assert.deepEqual(online.routeMarket, offline.routeMarket);
  assert.deepEqual(online.companyGrowth, offline.companyGrowth);
});

test("departure bookings survive price/cabin changes and compact reload without a second settlement", () => {
  const game = fixture();
  const departed = advanceFleetOperations(game, now, now + hour).game;
  const booking = departed.fleet[0].schedule[0].booking!;
  assert.ok(booking);
  const restored = restoreGameStateFromCloudSave(JSON.parse(JSON.stringify(createCompactSaveState(departed))));
  assert.deepEqual(restored.routeMarket, departed.routeMarket);
  restored.routes[0].pricing!.economy *= 100000;
  restored.fleet[0].cabinLayout = { ...restored.fleet[0].cabinLayout, economy: 0 };
  const arrived = advanceFleetOperations(restored, restored.currentGameTimeMs, now + 4 * hour).game;
  assert.equal(arrived.fleet[0].totalRevenue, booking.revenue);
  assert.equal(arrived.fleet[0].passengerCount, booking.passengerCount);
  const again = advanceFleetOperations(arrived, arrived.currentGameTimeMs, now + 5 * hour).game;
  assert.equal(again.money, arrived.money);
  assert.equal(again.completedFlights, arrived.completedFlights);
});

test("cancelled flights consume no demand and old market windows are bounded", () => {
  const game = fixture();
  game.fleet[0].schedule[0].status = "cancelled";
  const result = advanceFleetOperations(game, now, now + 4 * hour).game;
  assert.equal(result.completedFlights, 1);
  assert.equal(result.routeMarket?.windows[0].bookedFlightIds.length, 1);
  const later = advanceFleetOperations(result, result.currentGameTimeMs, now + 7 * DAY_MS).game;
  assert.equal(later.routeMarket?.windows.length, 0);
});

test("forecast is an isolated use of the same market and accounting engine", () => {
  const game = fixture();
  const before = JSON.stringify(game);
  const forecast = forecastOperations(game, 1);
  const actual = advanceFleetOperations(game, now, now + DAY_MS).game;
  assert.equal(forecast.game.money, actual.money);
  assert.equal(forecast.flights.length, 2);
  assert.equal(JSON.stringify(game), before);
});

test("batch timetable copies preview without mutation, keep aircraft independent and reject conflicts", () => {
  const game = fixture(3);
  game.fleet = game.fleet.map((aircraft) => ({ ...aircraft, schedule: [] }));
  const source = prepareWeeklySchedule(game, { aircraftId: "plane-0", routeId: "lhr-cdg", daysOfWeek: [3],
    outboundFlightNumber: "MA101", returnFlightNumber: "MA102", departureTimeLocal: "12:00", isRoundTrip: true });
  assert.ok(source.game);
  const saved = source.game!;
  const id = saved.fleet[0].weeklySchedules[0].id;
  const original = JSON.stringify(saved);
  const copy = copyWeeklySchedules(saved, id, ["plane-1", "plane-2"], 30);
  assert.ok(copy.outcomes.every((row) => row.ok));
  assert.equal(JSON.stringify(saved), original);
  assert.equal(copy.game.fleet[1].registration, "G-M1");
  assert.equal(copy.game.fleet[2].weeklySchedules[0].departureTimeLocal, "13:00");
  const numbers = copy.game.fleet.flatMap((aircraft) => aircraft.weeklySchedules.flatMap((schedule) => [schedule.outboundFlightNumber, schedule.returnFlightNumber]));
  assert.equal(new Set(numbers).size, numbers.length);
  const repeated = copyWeeklySchedules(copy.game, id, ["plane-1", "plane-2"], 30);
  assert.ok(repeated.outcomes.every((row) => !row.ok));
  assert.equal(repeated.game.fleet[1].weeklySchedules.length, 1);
  const approved = copyWeeklySchedules(saved, id, ["plane-1", "plane-2"], 30, ["plane-2"]);
  assert.equal(approved.game.fleet[1].weeklySchedules.length, 0);
  assert.equal(approved.game.fleet[2].weeklySchedules[0].departureTimeLocal, "13:00");
});

test("cross-midnight timetable copies shift operating days and reject wrong bases/curfews", () => {
  const game = fixture();
  game.fleet = game.fleet.map((aircraft) => ({ ...aircraft, schedule: [] }));
  const source = prepareWeeklySchedule(game, { aircraftId: "plane-0", routeId: "lhr-cdg", daysOfWeek: [3],
    outboundFlightNumber: "MA101", returnFlightNumber: "MA102", departureTimeLocal: "23:30", isRoundTrip: true }).game!;
  const id = source.fleet[0].weeklySchedules[0].id;
  const copy = copyWeeklySchedules(source, id, ["plane-1"], 60);
  assert.equal(copy.game.fleet[1].weeklySchedules[0].departureTimeLocal, "00:30");
  assert.deepEqual(copy.game.fleet[1].weeklySchedules[0].daysOfWeek, [4]);
  source.fleet[1] = { ...source.fleet[1], homeBaseAirportId: "cdg" };
  assert.equal(copyWeeklySchedules(source, id, ["plane-1"], 60).outcomes[0].ok, false);
});

test("actual route passenger/cargo summaries retain seven days without a second cash owner", () => {
  const game = fixture();
  const result = advanceFleetOperations(game, now, now + 4 * hour).game;
  const summary = recentOperatingTotals(result.financialHistory, result.currentGameTimeMs, "routes")[game.routes[0].id];
  assert.equal(summary.passengers, result.passengerCount - game.passengerCount);
  assert.equal(summary.passengerRevenue! + summary.cargoRevenue!, summary.revenue);
  assert.equal(summary.profit, summary.revenue - summary.cost);
  assert.equal(summary.observedFlights, 2);
  assert.deepEqual(recentOperatingTotals(result.financialHistory, now + 8 * DAY_MS, "routes"), {});
});

test("repeated DST hours and reversed route records cannot duplicate the same directional market", () => {
  const route = fixture().routes[0];
  const beforeClockChange = marketWindow(route, "lhr", Date.UTC(2026, 9, 25, 0, 30));
  const afterClockChange = marketWindow(route, "lhr", Date.UTC(2026, 9, 25, 1, 30));
  assert.equal(beforeClockChange.key, afterClockChange.key);
  assert.equal(marketWindow({ ...route, originAirportId: "cdg", destinationAirportId: "lhr" }, "lhr", now).key,
    marketWindow(route, "lhr", now).key);
});

test("maintenance cancellations and recovery preserve identical online/offline market settlement", () => {
  const game = fixture();
  const aircraft = game.fleet[0];
  const anchor = aircraft.schedule[0];
  aircraft.schedule = [anchor, ...[3, 12, 14].map((offset, index) => ({ ...anchor, id: `maintenance-leg-${index}`,
    originAirportId: offset === 12 ? "lhr" : "cdg", destinationAirportId: offset === 12 ? "cdg" : "lhr",
    departureGameTime: now + offset * hour, arrivalGameTime: now + (offset + 1) * hour, readyGameTime: now + (offset + 2) * hour }))];
  aircraft.lifecycle = { ...normalizeAircraftLifecycle(aircraft, now), condition: 60,
    reservation: { kind: "service", afterFlightId: anchor.id, state: "scheduled" } };
  const offline = advanceFleetOperations(game, now, now + 30 * hour).game;
  let online = game;
  for (let time = now + 10 * 60000; time <= now + 30 * hour; time += 10 * 60000)
    online = advanceFleetOperations(online, online.currentGameTimeMs, time).game;
  assert.equal(online.money, offline.money);
  assert.deepEqual(online.companyGrowth, offline.companyGrowth);
  assert.deepEqual(online.routeMarket, offline.routeMarket);
  assert.equal(offline.completedFlights, 3);
  assert.equal(offline.fleet[0].schedule.filter(item => item.status === "cancelled").length, 2);
  assert.equal(offline.routeMarket!.windows.flatMap(window => window.bookedFlightIds).some(id => id === "maintenance-leg-0"), false);
  const repeated = advanceFleetOperations(offline, offline.currentGameTimeMs, now + 31 * hour).game;
  assert.equal(repeated.money, offline.money);
});

test("batch pricing rejects invalid input atomically without another cash balance or historical rewrite", () => {
  const game = normalizeGame(fixture())!;
  game.isPaused = true;
  useGameStore.setState({ game });
  for (const percent of [NaN, -1, 0, 1001]) assert.equal(useGameStore.getState().batchRoutePricing([game.routes[0].id], percent), false);
  assert.equal(useGameStore.getState().batchRoutePricing([game.routes[0].id, "missing"], 100), false);
  assert.deepEqual(useGameStore.getState().game!.routes, game.routes);
  assert.equal(useGameStore.getState().batchRoutePricing([game.routes[0].id], 80), true);
  const changed = useGameStore.getState().game!;
  assert.equal(changed.routes[0].pricing!.economy, Math.round(changed.routes[0].recommendedPricing!.economy * 0.8));
  assert.equal(changed.money, game.money);
  assert.deepEqual(changed.financialHistory, game.financialHistory);
  assert.deepEqual(changed.flightLog, game.flightLog);
});

test("100 aircraft share demand across multi-day recurring service with bounded saved data", () => {
  const game = fixture(100);
  game.fleet = game.fleet.map((aircraft, index) => ({ ...aircraft, schedule: [], weeklySchedules: [{
    id: `weekly-${index}`, aircraftId: aircraft.id, routeId: "lhr-cdg", outboundFlightNumber: `MA${100 + index * 2}`,
    returnFlightNumber: `MA${101 + index * 2}`, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], departureTimeLocal: "12:00", isRoundTrip: true,
    blockMinutes: 180, turnaroundMinutes: 40, recurrenceRule: "WEEKLY", createdGameTime: now, createdAt: "2026-01-01", updatedAt: "2026-01-01" }] }));
  const before = JSON.stringify(game);
  const forecast = forecastOperations(game, 7);
  assert.ok(forecast.flights.length >= 1000);
  assert.equal(forecast.game.fleet.length, 100);
  assert.ok(forecast.game.routeMarket!.windows.length <= 36);
  assert.equal(forecast.game.flightLog.length, 60);
  assert.equal(JSON.stringify(game), before);
  assert.ok(JSON.stringify(createCompactSaveState(forecast.game)).length < 900000);
});
