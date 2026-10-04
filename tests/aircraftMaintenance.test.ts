import assert from "node:assert/strict";
import test from "node:test";
import { aircraftById } from "../src/data/aircraft";
import { aircraftAgeYears, aircraftReliability, beginAircraftMaintenance, completeAircraftMaintenance, getMaintenanceStatus, normalizeAircraftLifecycle, quoteMaintenance, recordAircraftFlight, technicalDelayMinutes } from "../src/lib/aircraftMaintenance";
import { advanceAircraftOperations } from "../src/lib/aircraftOperations";
import { createCompactSaveState, pruneOperationalFlights, restoreGameStateFromCloudSave } from "../src/lib/cloudSave";
import { flightWaitMs, DAY_MS } from "../src/lib/time";
import { normalizeGame, useGameStore } from "../src/store/gameStore";
import { calculateDashboardStats } from "../src/lib/stats";
import { maintenancePreview } from "../src/lib/maintenancePlanning";
import { airportLocalMinutes, flightAirportIssues, nightPassengerDemandMultiplier, weeklyAirportIssues } from "../src/lib/airportOperations";
import { estimateFlightFinancials, estimateScheduleFinancials } from "../src/lib/economy";
import { calculateScheduledCapacityForRoute } from "../src/lib/routeDemand";
import { weeklyEventBlocksFromSchedule } from "../src/lib/schedule";
import type { AircraftInstance, GameState, ScheduleItem } from "../src/types/game";

const now = Date.UTC(2026, 0, 1, 6);
const hour = 3_600_000;
const model = aircraftById["a220-300"];

test("cancelled one-off flights do not occupy route capacity or create turnaround blocks", () => {
  const game = fixture();
  game.fleet[0].schedule = [{ ...flight(game), status: "cancelled", cancellationReason: "maintenance" }];
  assert.equal(calculateScheduledCapacityForRoute(game.routes[0].id, game).economy, 0);
  const blocks = weeklyEventBlocksFromSchedule(game.fleet[0], game.routes);
  assert.ok(blocks.some((block) => block.kind === "cancelled"));
  assert.equal(blocks.some((block) => block.kind === "turnaround"), false);
});

test("reserved maintenance remains visible after the anchor lands but before turnaround ends", () => {
  const game = reservedFixture();
  const anchor = game.fleet[0].schedule[0];
  const advanced = advanceAircraftOperations(game.fleet[0], game.routes, anchor.arrivalGameTime, game.difficultyConfig);
  assert.equal(advanced.aircraft.lifecycle!.maintenance, undefined);
  assert.ok(advanced.aircraft.lifecycle!.reservation!.startsAfterGameTimeMs);
  assert.ok(weeklyEventBlocksFromSchedule(advanced.aircraft, game.routes).some((block) => block.kind === "maintenance"));
});

test("airport local time handles DST and curfews distinguish blocked FRA from advisory LHR", () => {
  assert.equal(airportLocalMinutes("fra", Date.UTC(2026, 0, 1, 22)), 23 * 60);
  assert.equal(airportLocalMinutes("fra", Date.UTC(2026, 6, 1, 22)), 0);
  assert.equal(flightAirportIssues("lhr", "fra", Date.UTC(2026, 0, 1, 21), Date.UTC(2026, 0, 1, 22))[0].blocking, true);
  assert.equal(flightAirportIssues("lhr", "cdg", Date.UTC(2026, 0, 1, 23), Date.UTC(2026, 0, 2, 0))[0].blocking, false);
  assert.deepEqual(flightAirportIssues("fra", "cdg", Date.UTC(2026, 0, 1, 4), Date.UTC(2026, 0, 1, 6)), []);
});

test("night reduction changes short-haul passenger demand only, not cargo or long-haul", () => {
  const game = fixture();
  const route = game.routes[0];
  const day = estimateFlightFinancials(route, model, game.fleet[0], 42, game.difficultyConfig,
    { departureGameTimeMs: Date.UTC(2026, 0, 1, 12), originAirportId: "lhr" });
  const night = estimateFlightFinancials(route, model, game.fleet[0], 42, game.difficultyConfig,
    { departureGameTimeMs: Date.UTC(2026, 0, 1, 23), originAirportId: "lhr" });
  assert.equal(night.nightDemandMultiplier, 0.85);
  assert.equal(night.adjustedDemand.economy, Math.round(day.adjustedDemand.economy * 0.85));
  assert.equal(night.cargoTons, day.cargoTons);
  assert.equal(night.adjustedDemand.cargoTons, day.adjustedDemand.cargoTons);
  assert.equal(nightPassengerDemandMultiplier(1501, "lhr", Date.UTC(2026, 0, 1, 23)), 1);
  assert.equal(nightPassengerDemandMultiplier(1000, "lhr", NaN), 1);
});

test("weekly economics checks the return leg's local night and deduplicates valid operating days", () => {
  const game = fixture();
  const input = { route: { ...game.routes[0], distanceKm: 1000 }, model, aircraft: game.fleet[0],
    daysOfWeek: [3], isRoundTrip: true, departureTimeLocal: "21:30", referenceGameTimeMs: now };
  const normal = estimateScheduleFinancials(input);
  assert.equal(normal.weeklyFlights, 2);
  assert.equal(normal.nightFlights, 1);
  assert.deepEqual(estimateScheduleFinancials({ ...input, daysOfWeek: [3, 3, 9, NaN, "3"] }), normal);
  const restricted = weeklyAirportIssues({ ...input, route: { ...input.route, destinationAirportId: "fra" }, daysOfWeek: [3] });
  assert.ok(restricted.some((issue) => issue.airportId === "fra" && issue.blocking));
});

test("airport rules are opt-in and survive compact save without shifting existing UTC schedules", () => {
  const game = fixture();
  assert.equal(game.airportRulesEnabled, false);
  useGameStore.setState({ game });
  useGameStore.getState().setAirportRulesEnabled(true);
  const restored = normalizeGame(restoreGameStateFromCloudSave(createCompactSaveState(useGameStore.getState().game!)))!;
  assert.equal(restored.airportRulesEnabled, true);
  assert.deepEqual(restored.fleet[0].weeklySchedules, game.fleet[0].weeklySchedules);
});

test("future cancelled flights survive the history cap and cannot resurrect after recovery", () => {
  const game = fixture();
  game.fleet[0].schedule = Array.from({ length: 60 }, (_, index) => ({
    ...flight(game, "cancelled-" + index, now + hour + index * 60_000), status: "cancelled" as const, cancellationReason: "maintenance" as const
  }));
  assert.equal(pruneOperationalFlights(game.fleet[0].schedule, now).length, 60);
  const restored = normalizeGame(restoreGameStateFromCloudSave(JSON.parse(JSON.stringify(createCompactSaveState(game)))))!;
  assert.equal(restored.fleet[0].schedule.length, 60);
  assert.equal(advanceAircraftOperations(restored.fleet[0], restored.routes, now + 12 * hour, restored.difficultyConfig).entries.length, 0);
});

test("pruned dated weekly cancellations are not regenerated after a compact reload", () => {
  const game = fixture();
  const departure = now - 7 * DAY_MS + hour;
  game.fleet[0].weeklySchedules = [{
    id: "weekly", aircraftId: "plane-1", routeId: game.routes[0].id, outboundFlightNumber: "MA100",
    daysOfWeek: [3], departureTimeLocal: "07:00", isRoundTrip: true, blockMinutes: 90, turnaroundMinutes: 30,
    recurrenceRule: "weekly", createdGameTime: departure, createdAt: new Date(departure).toISOString(), updatedAt: new Date(departure).toISOString()
  }];
  game.fleet[0].operationsThroughGameTimeMs = now;
  game.fleet[0].schedule = [{ ...flight(game, "weekly-" + departure + "-out", departure), status: "cancelled", cancellationReason: "maintenance" }];
  const restored = normalizeGame(restoreGameStateFromCloudSave(JSON.parse(JSON.stringify(createCompactSaveState(game)))))!;
  restored.isPaused = false;
  restored.lastTickRealMs = Date.now();
  restored.timeMultiplier = 1;
  useGameStore.setState({ game: restored });
  useGameStore.getState().tickSimulation();
  const advanced = useGameStore.getState().game!;
  assert.equal(advanced.completedFlights, 0);
  assert.equal(advanced.money, game.money);
  assert.equal(advanced.fleet[0].schedule.some((item) => item.departureGameTime < now), false);
  assert.ok(advanced.fleet[0].schedule.some((item) => item.departureGameTime > now));
});

test("cross-day maintenance with no compatible departure finishes without teleporting the aircraft", () => {
  const game = reservedFixture();
  game.fleet[0].schedule = game.fleet[0].schedule.slice(0, 3).map((item) => ({
    ...item, departureGameTime: item.departureGameTime + 15 * hour, arrivalGameTime: item.arrivalGameTime + 15 * hour,
    scheduledDepartureGameTime: item.scheduledDepartureGameTime! + 15 * hour, scheduledArrivalGameTime: item.scheduledArrivalGameTime! + 15 * hour,
    readyGameTime: item.readyGameTime + 15 * hour
  }));
  const advanced = advanceAircraftOperations(game.fleet[0], game.routes, now + 48 * hour, game.difficultyConfig);
  assert.equal(advanced.entries.length, 1);
  assert.equal(advanced.aircraft.status, "idle");
  assert.equal(advanced.aircraft.currentAirportId, "cdg");
  assert.ok(advanced.aircraft.lifecycle!.recovery);
  assert.equal(advanced.aircraft.lifecycle!.maintenance, undefined);
});

function reservedFixture() {
  const game = fixture();
  const anchor = flight(game, "anchor", now + hour);
  const during = { ...flight(game, "during", now + 3 * hour), originAirportId: "cdg", destinationAirportId: "lhr" };
  const wrongPosition = flight(game, "wrong-position", now + 12 * hour);
  const resume = { ...flight(game, "resume", now + 14 * hour), originAirportId: "cdg", destinationAirportId: "lhr" };
  game.fleet[0] = { ...game.fleet[0], schedule: [anchor, during, wrongPosition, resume],
    lifecycle: { ...game.fleet[0].lifecycle!, condition: 60, reservation: { kind: "service", afterFlightId: anchor.id, state: "scheduled" } } };
  return game;
}

test("reservation starts after actual landing and turnaround, cancels conflicts and resumes at the real airport", () => {
  const game = reservedFixture();
  const expectedStart = game.fleet[0].schedule[0].readyGameTime;
  const active = advanceAircraftOperations(game.fleet[0], game.routes, now + 4 * hour, game.difficultyConfig, game.money);
  assert.equal(active.aircraft.lifecycle!.maintenance!.startedGameTimeMs, expectedStart);
  assert.equal(active.entries.length, 1);
  assert.equal(active.aircraft.schedule.find((item) => item.id === "during")!.status, "cancelled");
  assert.equal(active.aircraft.schedule.find((item) => item.id === "wrong-position")!.cancellationReason, "position");
  const finished = advanceAircraftOperations(active.aircraft, game.routes, now + 30 * hour, game.difficultyConfig, game.money);
  assert.equal(finished.entries.length, 1);
  assert.equal(finished.entries[0].id, "resume");
  assert.equal(finished.aircraft.currentAirportId, "lhr");
  assert.equal(finished.aircraft.lifecycle!.flightCycles, 2);
  assert.equal(finished.maintenanceCashCost, 0);
  assert.equal(finished.aircraft.lifecycle!.maintenance, undefined);
  assert.equal(finished.aircraft.schedule.find((item) => item.id === "resume")!.departureGameTime, now + 14 * hour);
});

test("delayed anchor moves the maintenance start without cancelling the airborne anchor", () => {
  const game = reservedFixture();
  game.fleet[0].schedule[0].baseDelayMinutes = 180;
  const advanced = advanceAircraftOperations(game.fleet[0], game.routes, now + 7 * hour, game.difficultyConfig);
  assert.equal(advanced.entries[0].id, "anchor");
  assert.equal(advanced.aircraft.lifecycle!.maintenance!.startedGameTimeMs, game.fleet[0].schedule[0].readyGameTime + 3 * hour);
});

test("reservation shortfall is charged once across compact reload and terminal cancellations never earn income", () => {
  const game = reservedFixture();
  const first = advanceAircraftOperations(game.fleet[0], game.routes, now + 4 * hour, game.difficultyConfig);
  const maintenanceEvents = first.financeEvents.filter((event) => event.kind === "cash");
  assert.equal(maintenanceEvents.length, 1);
  assert.equal(maintenanceEvents[0].delta, -first.maintenanceCashCost);
  game.fleet[0] = first.aircraft;
  game.currentGameTimeMs = now + 4 * hour;
  game.money += first.entries.reduce((sum, entry) => sum + entry.profit, 0) - first.maintenanceCashCost;
  const restored = normalizeGame(restoreGameStateFromCloudSave(JSON.parse(JSON.stringify(createCompactSaveState(game)))))!;
  const advanced = advanceAircraftOperations(restored.fleet[0], restored.routes, now + 30 * hour, restored.difficultyConfig);
  assert.equal(advanced.maintenanceCashCost, 0);
  assert.equal(advanced.entries.length, 1);
  assert.equal(advanced.aircraft.schedule.filter((item) => item.status === "cancelled").length, 2);
  const repeated = advanceAircraftOperations(advanced.aircraft, restored.routes, now + 30 * hour, restored.difficultyConfig);
  assert.equal(repeated.entries.length, 0);
  assert.equal(repeated.maintenanceCashCost, 0);
  assert.equal(repeated.financeEvents.length, 0);
  assert.equal(repeated.aircraft.totalProfit, advanced.aircraft.totalProfit);
});

test("a failed reservation reports insufficient funds and does not subtract cash or silently cancel flights", () => {
  const game = reservedFixture();
  const advanced = advanceAircraftOperations(game.fleet[0], game.routes, now + 4 * hour, game.difficultyConfig, -1_000_000);
  assert.equal(advanced.aircraft.lifecycle!.reservation!.state, "blocked");
  assert.equal(advanced.aircraft.lifecycle!.reservation!.error, "cash");
  assert.equal(advanced.maintenanceCashCost, 0);
  assert.equal(advanced.aircraft.schedule.some((item) => item.status === "cancelled"), false);
});

test("missing or grounded anchor is actionable rather than triggering maintenance on another flight", () => {
  const game = reservedFixture();
  const missing = { ...game.fleet[0], schedule: game.fleet[0].schedule.slice(1) };
  assert.equal(advanceAircraftOperations(missing, game.routes, now + 4 * hour, game.difficultyConfig).aircraft.lifecycle!.reservation!.error, "missing");
  const grounded = { ...game.fleet[0], lifecycle: { ...game.fleet[0].lifecycle!, condition: 25 } };
  const advanced = advanceAircraftOperations(grounded, game.routes, now + 4 * hour, game.difficultyConfig);
  assert.equal(advanced.aircraft.lifecycle!.reservation!.error, "grounded");
  assert.equal(advanced.maintenanceCashCost, 0);
  assert.equal(advanced.entries.length, 0);
});

test("preview lists cancellation causes and the first position-compatible recovery flight", () => {
  const game = reservedFixture();
  const preview = maintenancePreview(game.fleet[0], "service", now, "anchor")!;
  assert.deepEqual(preview.cancelled.map((item) => item.reason), ["maintenance", "position"]);
  assert.equal(preview.resume!.id, "resume");
  assert.equal(maintenancePreview(game.fleet[0], "service", now, "missing"), null);
});

test("batch reservation is atomic, has no booking charge and keeps independent registrations", () => {
  const game = reservedFixture();
  game.fleet[0].lifecycle!.reservation = undefined;
  game.fleet.push({ ...game.fleet[0], id: "plane-2", registration: "G-M002", lifecycle: { ...game.fleet[0].lifecycle! },
    schedule: game.fleet[0].schedule.map((item) => ({ ...item, id: "second-" + item.id, aircraftId: "plane-2" })) });
  useGameStore.setState({ game });
  const bad = useGameStore.getState().reserveAircraftMaintenance([
    { aircraftId: "plane-1", kind: "service", afterFlightId: "anchor" },
    { aircraftId: "plane-2", kind: "service", afterFlightId: "missing" }
  ]);
  assert.equal(bad.ok, false);
  assert.equal(useGameStore.getState().game!.fleet[0].lifecycle!.reservation, undefined);
  assert.equal(useGameStore.getState().reserveAircraftMaintenance([
    { aircraftId: "plane-1", kind: "service", afterFlightId: "anchor" },
    { aircraftId: "plane-2", kind: "service", afterFlightId: "second-anchor" }
  ]).ok, true);
  assert.equal(useGameStore.getState().game!.money, game.money);
  assert.deepEqual(useGameStore.getState().game!.fleet.map((item) => item.registration), ["G-M001", "G-M002"]);
  useGameStore.getState().cancelMaintenanceReservation("plane-1");
  assert.equal(useGameStore.getState().game!.fleet[0].lifecycle!.reservation, undefined);
  assert.ok(useGameStore.getState().game!.fleet[1].lifecycle!.reservation);
});

test("100 independent aircraft can complete reservations in one catch-up with no duplicate settlement", () => {
  const game = reservedFixture();
  const source = game.fleet[0];
  game.money = 1_000_000_000;
  game.fleet = Array.from({ length: 100 }, (_, index) => ({
    ...source, id: "fleet-" + index, registration: "G-" + index, lifecycle: { ...source.lifecycle! },
    schedule: source.schedule.map((item) => ({ ...item, aircraftId: "fleet-" + index }))
  }));
  game.isPaused = false;
  game.timeMultiplier = 1;
  game.lastTickRealMs = Date.now() - 30 * hour;
  useGameStore.setState({ game });
  useGameStore.getState().tickSimulation();
  const advanced = useGameStore.getState().game!;
  assert.equal(advanced.completedFlights, 200);
  assert.equal(new Set(advanced.fleet.map((item) => item.registration)).size, 100);
  assert.equal(advanced.fleet.every((item) => item.totalFlights === 2), true);
  const cash = advanced.money;
  useGameStore.getState().tickSimulation();
  assert.equal(useGameStore.getState().game!.completedFlights, 200);
  assert.equal(useGameStore.getState().game!.money, cash);
});

test("cumulative aircraft profit survives a truncated recent log without inventing missing legacy history", () => {
  const game = fixture();
  game.fleet[0].totalProfit = 123456;
  game.fleet[0].totalFlights = 100;
  game.flightLog = [];
  assert.equal(normalizeGame(restoreGameStateFromCloudSave(createCompactSaveState(game)))!.fleet[0].totalProfit, 123456);
  game.fleet[0].totalProfit = undefined;
  assert.equal(normalizeGame(game)!.fleet[0].profitHistoryIncomplete, true);
});

// Store-action tests run without a browser; save serialization is tested separately below.
useGameStore.persist.setOptions({ storage: {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined
} });

function fixture(): GameState {
  return normalizeGame(restoreGameStateFromCloudSave({
    airlineName: "Maintenance Airways", difficulty: "easy", money: 1_000_000,
    currentGameTimeMs: now, baseGameTimeMs: now, baseAirportId: "lhr",
    lastTickRealMs: Date.now(), isPaused: true,
    fleet: [{
      id: "plane-1", modelId: "a220-300", registration: "G-M001", homeBaseAirportId: "lhr",
      currentAirportId: "lhr", status: "idle", schedule: [], weeklySchedules: [],
      cabinLayout: model.suggestedLayout, purchasePriceGBP: model.estimatedPriceGBP,
      totalRevenue: 0, totalFlights: 0, passengerCount: 0, cargoTransportedTons: 0
    }],
    routes: [{ id: "lhr-cdg", originAirportId: "lhr", destinationAirportId: "cdg", isOpen: true }]
  }))!;
}

function flight(game: GameState, id = "flight-1", departure = now + hour): ScheduleItem {
  const duration = flightWaitMs(game.routes[0].distanceKm, model.cruiseSpeedKmh);
  return {
    id, aircraftId: "plane-1", routeId: "lhr-cdg", originAirportId: "lhr", destinationAirportId: "cdg",
    scheduledDepartureGameTime: departure, scheduledArrivalGameTime: departure + duration,
    departureGameTime: departure, arrivalGameTime: departure + duration,
    readyGameTime: departure + duration + model.turnaroundMinutes * 60_000,
    status: "scheduled", baseDelayMinutes: 0, technicalChecked: true, technicalDelayMinutes: 0
  };
}

test("legacy aircraft get one safe lifecycle without changing identity, money or schedules", () => {
  const game = fixture();
  const first = { ...game.fleet[0], lifecycle: undefined, totalFlights: 42, schedule: [flight(game)] };
  game.fleet = [first, { ...first, id: "plane-2", registration: "G-M002" }];
  const restored = normalizeGame(restoreGameStateFromCloudSave(createCompactSaveState(game)))!;
  assert.equal(restored.money, game.money);
  assert.equal(restored.fleet.length, 2);
  assert.deepEqual(restored.fleet.map((item) => item.registration), ["G-M001", "G-M002"]);
  assert.equal(restored.fleet[0].schedule[0].id, first.schedule[0].id);
  assert.deepEqual(restored.fleet[0].cabinLayout, first.cabinLayout);
  assert.equal(restored.fleet[0].lifecycle!.flightCycles, 42);
  assert.equal(restored.fleet[0].lifecycle!.condition, 100);
  assert.equal(restored.fleet[0].lifecycle!.reserveBalance, 0);
  assert.deepEqual(normalizeAircraftLifecycle(restored.fleet[0], now), restored.fleet[0].lifecycle);
});

test("age uses game time and flight wear uses actual flight hours and one cycle per leg", () => {
  const lifecycle = fixture().fleet[0].lifecycle!;
  assert.equal(aircraftAgeYears(lifecycle, now + 365.25 * DAY_MS), 1);
  const flown = recordAircraftFlight(lifecycle, 2 * hour, 8_000);
  assert.equal(flown.flightHours, 2);
  assert.equal(flown.flightCycles, 1);
  assert.equal(flown.hoursSinceService, 2);
  assert.equal(flown.cyclesSinceService, 1);
  assert.equal(flown.condition, 100 - 2 * 0.035 - 0.045);
  assert.equal(flown.reserveBalance, 8_000);
});

test("service warnings, due intervals and grounding have explicit boundaries", () => {
  const lifecycle = fixture().fleet[0].lifecycle!;
  assert.equal(getMaintenanceStatus(lifecycle, now), "healthy");
  assert.equal(getMaintenanceStatus({ ...lifecycle, hoursSinceService: 400 }, now), "soon");
  assert.equal(getMaintenanceStatus({ ...lifecycle, hoursSinceService: 500 }, now), "due");
  assert.equal(getMaintenanceStatus({ ...lifecycle, cyclesSinceService: 250 }, now), "due");
  assert.equal(getMaintenanceStatus(lifecycle, now + 90 * DAY_MS), "due");
  assert.equal(getMaintenanceStatus({ ...lifecycle, condition: 30 }, now), "grounded");
});

test("reserve funding covers service first and completion does not charge twice", () => {
  const lifecycle = { ...fixture().fleet[0].lifecycle!, condition: 60, reserveBalance: 50_000, hoursSinceService: 510 };
  const quote = quoteMaintenance(model, lifecycle, "service");
  assert.equal(quote.totalCost, 65_000 + 40 * 1_800);
  assert.equal(quote.reserveUsed, 50_000);
  assert.equal(quote.cashCost, quote.totalCost - 50_000);
  const active = beginAircraftMaintenance(lifecycle, model, "service", now);
  assert.equal(aircraftReliability(active, now), aircraftReliability(lifecycle, now));
  assert.equal(active.reserveBalance, 0);
  assert.equal(completeAircraftMaintenance(active, now + hour), active);
  const finished = completeAircraftMaintenance(active, now + quote.durationMs);
  assert.equal(finished.condition, 100);
  assert.equal(finished.hoursSinceService, 0);
  assert.equal(finished.lastServiceGameTimeMs, now + quote.durationMs);
  assert.equal(finished.totalMaintenanceCashCost, quote.cashCost);
  assert.equal(finished.flightHours, lifecycle.flightHours);
  assert.equal(finished.maintenance, undefined);
  assert.equal(completeAircraftMaintenance(finished, now + 24 * hour), finished);
  assert.equal(quoteMaintenance(model, { ...lifecycle, reserveBalance: 1_000_000 }, "service").cashCost, 0);
});

test("inspection improves condition but cannot reset full-service due intervals", () => {
  const lifecycle = { ...fixture().fleet[0].lifecycle!, condition: 60, hoursSinceService: 510 };
  const active = beginAircraftMaintenance(lifecycle, model, "inspection", now);
  const finished = completeAircraftMaintenance(active, now + 2 * hour);
  assert.equal(finished.condition, 68);
  assert.equal(finished.hoursSinceService, 510);
  assert.equal(getMaintenanceStatus(finished, now + 2 * hour), "due");
  assert.ok(aircraftReliability(finished, now + 2 * hour) > aircraftReliability(lifecycle, now));
});

test("fractional reserves cannot introduce fractional cash or spend more than their balance", () => {
  const lifecycle = { ...fixture().fleet[0].lifecycle!, reserveBalance: 1234.75 };
  const quote = quoteMaintenance(model, lifecycle, "service");
  assert.equal(quote.reserveUsed, 1234);
  assert.equal(Number.isInteger(quote.cashCost), true);
  assert.equal(beginAircraftMaintenance(lifecycle, model, "service", now).reserveBalance, 0.75);
});

test("condition and malformed lifecycle numbers remain finite and bounded", () => {
  const aircraft = fixture().fleet[0];
  const restored = normalizeAircraftLifecycle({ ...aircraft, lifecycle: {
    ...aircraft.lifecycle!, condition: Infinity, flightHours: NaN, cyclesSinceService: -20, reserveBalance: Infinity
  } }, now);
  assert.equal(restored.condition, 100);
  assert.equal(restored.flightHours, 0);
  assert.equal(restored.cyclesSinceService, 0);
  assert.equal(restored.reserveBalance, 0);
  const worn = { ...restored, condition: 0, hoursSinceService: 50_000, cyclesSinceService: 50_000 };
  assert.ok(aircraftReliability(worn, now + 100 * 365.25 * DAY_MS) >= 80);
  assert.ok(recordAircraftFlight(restored, NaN, Infinity).condition <= 100);
});

test("grounded aircraft retain scheduled flights and produce no revenue or wear", () => {
  const game = fixture();
  const aircraft = { ...game.fleet[0], schedule: [flight(game)], lifecycle: { ...game.fleet[0].lifecycle!, condition: 25 } };
  const advanced = advanceAircraftOperations(aircraft, game.routes, now + 48 * hour, game.difficultyConfig);
  assert.equal(advanced.entries.length, 0);
  assert.equal(advanced.aircraft.status, "grounded");
  assert.equal(advanced.aircraft.schedule[0].status, "scheduled");
  assert.equal(advanced.aircraft.schedule[0].operationalStatus, "grounded");
  assert.equal(advanced.aircraft.lifecycle!.flightCycles, 0);
});

test("maintenance postpones departures, finishes before flying, and settles each flight once", () => {
  const game = fixture();
  const aircraft: AircraftInstance = {
    ...game.fleet[0], schedule: [flight(game)],
    lifecycle: beginAircraftMaintenance({ ...game.fleet[0].lifecycle!, condition: 25 }, model, "service", now)
  };
  const waiting = advanceAircraftOperations(aircraft, game.routes, now + 4 * hour, game.difficultyConfig);
  assert.equal(waiting.entries.length, 0);
  assert.equal(waiting.aircraft.status, "maintenance");
  assert.equal(waiting.aircraft.schedule[0].departureGameTime, now + 8 * hour);
  const repeated = advanceAircraftOperations(waiting.aircraft, game.routes, now + 4 * hour, game.difficultyConfig);
  assert.equal(repeated.aircraft.schedule[0].departureGameTime, now + 8 * hour);
  const finished = advanceAircraftOperations(repeated.aircraft, game.routes, now + 10 * hour, game.difficultyConfig);
  assert.equal(finished.entries.length, 1);
  assert.equal(finished.aircraft.lifecycle!.maintenance, undefined);
  assert.equal(finished.aircraft.lifecycle!.flightCycles, 1);
  assert.equal(finished.aircraft.lifecycle!.totalMaintenanceCashCost, aircraft.lifecycle!.totalMaintenanceCashCost);
  assert.ok(finished.aircraft.lifecycle!.reserveBalance > 0);
  assert.equal("economics" in finished.aircraft.schedule[0], false);
  assert.equal(advanceAircraftOperations(finished.aircraft, game.routes, now + 11 * hour, game.difficultyConfig).entries.length, 0);
});

test("maintenance and technical decisions persist in local/cloud compact save round trips", () => {
  const game = fixture();
  game.fleet[0].lifecycle = beginAircraftMaintenance({ ...game.fleet[0].lifecycle!, reserveBalance: 25_000 }, model, "service", now);
  game.fleet[0].schedule = [{ ...flight(game), technicalChecked: true, technicalDelayMinutes: 45 }];
  const compact = JSON.parse(JSON.stringify(createCompactSaveState(game)));
  const restored = normalizeGame(restoreGameStateFromCloudSave(compact))!;
  assert.deepEqual(restored.fleet[0].lifecycle, game.fleet[0].lifecycle);
  assert.equal(restored.fleet[0].status, "maintenance");
  assert.equal(restored.fleet[0].schedule[0].technicalDelayMinutes, 45);
});

test("a time jump settles the first leg then grounds later legs when condition crosses the threshold", () => {
  const game = fixture();
  const aircraft = {
    ...game.fleet[0], lifecycle: { ...game.fleet[0].lifecycle!, condition: 30.01 },
    schedule: [flight(game), { ...flight(game, "return-flight", now + 3 * hour), originAirportId: "cdg", destinationAirportId: "lhr" }]
  };
  const result = advanceAircraftOperations(aircraft, game.routes, now + 12 * hour, game.difficultyConfig);
  assert.equal(result.entries.length, 1);
  assert.equal(result.aircraft.currentAirportId, "cdg");
  assert.equal(result.aircraft.lifecycle!.flightCycles, 1);
  assert.ok(result.aircraft.lifecycle!.condition < 30);
  assert.equal(result.aircraft.status, "grounded");
  const held = result.aircraft.schedule.find((item) => item.id === "return-flight")!;
  assert.equal(held.status, "scheduled");
  assert.equal(held.operationalStatus, "grounded");
  assert.equal(advanceAircraftOperations(result.aircraft, game.routes, now + 24 * hour, game.difficultyConfig).entries.length, 0);
});

test("a completed service and a not-yet-departed technical delay survive compact reload without time drift", () => {
  const game = fixture();
  const aircraft = {
    ...game.fleet[0],
    lifecycle: beginAircraftMaintenance({ ...game.fleet[0].lifecycle!, condition: 25 }, model, "service", now),
    schedule: [{ ...flight(game), technicalDelayMinutes: 60 }]
  };
  const waiting = advanceAircraftOperations(aircraft, game.routes, now + 4 * hour, game.difficultyConfig);
  const serviced = advanceAircraftOperations(waiting.aircraft, game.routes, now + 8.5 * hour, game.difficultyConfig);
  assert.equal(serviced.entries.length, 0);
  assert.equal(serviced.aircraft.lifecycle!.maintenance, undefined);
  assert.equal(serviced.aircraft.schedule[0].departureGameTime, now + 9 * hour);
  game.fleet = [serviced.aircraft];
  game.currentGameTimeMs = now + 8.5 * hour;
  const restored = normalizeGame(restoreGameStateFromCloudSave(JSON.parse(JSON.stringify(createCompactSaveState(game)))))!;
  const repeated = advanceAircraftOperations(restored.fleet[0], restored.routes, game.currentGameTimeMs, game.difficultyConfig);
  assert.equal(repeated.aircraft.schedule[0].departureGameTime, now + 9 * hour);
  const completed = advanceAircraftOperations(repeated.aircraft, restored.routes, now + 10 * hour, game.difficultyConfig);
  assert.equal(completed.entries.length, 1);
  assert.equal(completed.aircraft.lifecycle!.flightCycles, 1);
});

test("technical delays propagate through turnaround once without accumulating on repeated ticks", () => {
  const game = fixture();
  const aircraft = {
    ...game.fleet[0], schedule: [
      { ...flight(game, "technical-outbound", now), technicalDelayMinutes: 45 },
      { ...flight(game, "connecting-return", now + 10 * 60_000), originAirportId: "cdg", destinationAirportId: "lhr" }
    ]
  };
  const first = advanceAircraftOperations(aircraft, game.routes, now, game.difficultyConfig);
  assert.equal(first.aircraft.schedule[1].departureGameTime, first.aircraft.schedule[0].readyGameTime);
  const again = advanceAircraftOperations(first.aircraft, game.routes, now, game.difficultyConfig);
  assert.deepEqual(again.aircraft.schedule.map((item) => item.departureGameTime), first.aircraft.schedule.map((item) => item.departureGameTime));
  const complete = advanceAircraftOperations(again.aircraft, game.routes, now + 5 * hour, game.difficultyConfig);
  assert.equal(complete.entries.length, 2);
  assert.equal(complete.aircraft.lifecycle!.flightCycles, 2);
});

test("technical delays are bounded, depend on condition and never accumulate on repeated ticks", () => {
  const game = fixture();
  const healthy = game.fleet[0].lifecycle!;
  const worn = { ...healthy, condition: 31, hoursSinceService: 510, cyclesSinceService: 260 };
  assert.ok(aircraftReliability(worn, now) < aircraftReliability(healthy, now));
  let delayedId = "";
  for (let index = 0; index < 10_000; index += 1) {
    const id = `technical-flight-${index}`;
    const delay = technicalDelayMinutes(id, worn, now);
    assert.ok(delay >= 0 && delay <= 90);
    if (delay > 0) { delayedId = id; break; }
  }
  assert.ok(delayedId);
  const aircraft = { ...game.fleet[0], lifecycle: worn, schedule: [{ ...flight(game, delayedId, now), technicalChecked: false }] };
  const first = advanceAircraftOperations(aircraft, game.routes, now, game.difficultyConfig);
  const second = advanceAircraftOperations(first.aircraft, game.routes, now, game.difficultyConfig);
  assert.ok(first.aircraft.schedule[0].technicalDelayMinutes! > 0);
  assert.equal(second.aircraft.schedule[0].departureGameTime, first.aircraft.schedule[0].departureGameTime);
  assert.equal(second.aircraft.schedule[0].technicalDelayMinutes, first.aircraft.schedule[0].technicalDelayMinutes);
});

test("store maintenance charges canonical money and profit once and respects pause and affordability", (t) => {
  let wallClock = 1_800_000_000_000;
  t.mock.method(Date, "now", () => wallClock);
  const game = fixture();
  game.fleet[0].lifecycle!.reserveBalance = 25_000;
  useGameStore.setState({ game });
  const quote = quoteMaintenance(model, game.fleet[0].lifecycle!, "service");
  assert.equal(useGameStore.getState().startAircraftMaintenance("plane-1", "service").ok, true);
  const started = useGameStore.getState().game!;
  assert.equal(started.money, game.money - quote.cashCost);
  assert.equal(started.totalProfit, game.totalProfit - quote.cashCost);
  assert.equal(calculateDashboardStats(started).totalProfit, started.totalProfit);
  assert.equal(calculateDashboardStats(started).totalOperatingCost, quote.cashCost);
  assert.equal(useGameStore.getState().startAircraftMaintenance("plane-1", "service").error, "busy");
  wallClock += 12 * hour;
  useGameStore.getState().tickSimulation();
  assert.equal(useGameStore.getState().game!.currentGameTimeMs, now);
  useGameStore.setState({ game: { ...useGameStore.getState().game!, isPaused: false, timeMultiplier: 1 } });
  wallClock += 10 * hour;
  useGameStore.getState().tickSimulation();
  assert.equal(useGameStore.getState().game!.fleet[0].lifecycle!.maintenance, undefined);
  assert.equal(useGameStore.getState().game!.money, started.money);
  const poorGame = fixture();
  poorGame.money = 0;
  useGameStore.setState({ game: poorGame });
  assert.equal(useGameStore.getState().startAircraftMaintenance("plane-1", "service").error, "cash");
  assert.equal(useGameStore.getState().game!.fleet[0].lifecycle!.maintenance, undefined);
  useGameStore.setState({ game: null });
});

test("store rejects maintenance on an airborne aircraft", () => {
  const game = fixture();
  game.fleet[0].schedule = [{ ...flight(game, "airborne", now - hour), status: "in-flight", arrivalGameTime: now + hour }];
  game.isPaused = false;
  game.timeMultiplier = 1;
  useGameStore.setState({ game });
  assert.equal(useGameStore.getState().startAircraftMaintenance("plane-1", "service").error, "airborne");
  useGameStore.setState({ game: null });
});
