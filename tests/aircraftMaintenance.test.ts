import assert from "node:assert/strict";
import test from "node:test";
import { aircraftById } from "../src/data/aircraft";
import { aircraftAgeYears, aircraftReliability, beginAircraftMaintenance, completeAircraftMaintenance, getMaintenanceStatus, normalizeAircraftLifecycle, quoteMaintenance, recordAircraftFlight, technicalDelayMinutes } from "../src/lib/aircraftMaintenance";
import { advanceAircraftOperations } from "../src/lib/aircraftOperations";
import { createCompactSaveState, restoreGameStateFromCloudSave } from "../src/lib/cloudSave";
import { flightWaitMs, DAY_MS } from "../src/lib/time";
import { normalizeGame, useGameStore } from "../src/store/gameStore";
import { calculateDashboardStats } from "../src/lib/stats";
import type { AircraftInstance, GameState, ScheduleItem } from "../src/types/game";

const now = Date.UTC(2026, 0, 1, 6);
const hour = 3_600_000;
const model = aircraftById["a220-300"];

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
