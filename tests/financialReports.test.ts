import assert from "node:assert/strict";
import test from "node:test";
import { aircraftById } from "../src/data/aircraft";
import { calculateOperatingCosts } from "../src/lib/economics/operatingCosts";
import { advanceAircraftOperations } from "../src/lib/aircraftOperations";
import { quoteMaintenance } from "../src/lib/aircraftMaintenance";
import { getCurrentCash } from "../src/lib/cash";
import { createCompactSaveState, restoreGameStateFromCloudSave } from "../src/lib/cloudSave";
import { fleetAlerts } from "../src/lib/fleetAlerts";
import { applyFinanceEvents, createFinancialHistory, financialDays, financialWeeks, normalizeFinancialHistory, recentOperatingTotals, splitRoundedCost } from "../src/lib/financialReports";
import { DAY_MS } from "../src/lib/time";
import { MILESTONES } from "../src/lib/companyGrowth";
import { normalizeGame, useGameStore } from "../src/store/gameStore";
import type { FinanceEvent } from "../src/types/finance";
import type { GameState, ScheduleItem } from "../src/types/game";

const now = Date.UTC(2026, 0, 1, 12), hour = 3_600_000;
useGameStore.persist.setOptions({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });

test("category costs distinguish aircraft, airport size, cycles and crew minimums", () => {
  const input = { distanceKm: 100, cruiseSpeedKmh: 500, fuelCostPerKm: 100, cargoTons: 0 };
  const small = calculateOperatingCosts({ ...input, originAirportTier: "regional", destinationAirportTier: "regional" });
  const hub = calculateOperatingCosts({ ...input, originAirportTier: "mega", destinationAirportTier: "mega" });
  const wide = calculateOperatingCosts({ ...input, aircraftType: "widebody" });
  const twoHours = calculateOperatingCosts({ ...input, distanceKm: 1000 });
  assert.equal(small.crewCost, 520);
  assert.equal(twoHours.crewCost, 1040);
  assert.equal(wide.crewCost, 1725);
  assert.ok(wide.maintenanceReserve > small.maintenanceReserve);
  assert.equal(hub.airportCost, small.airportCost * 3);
  assert.equal(twoHours.maintenanceReserve, 2700);
  assert.equal(twoHours.fuelCost, 1665);
  assert.equal(calculateOperatingCosts({ ...input, cargoTons: 2 }).airportCost - calculateOperatingCosts(input).airportCost, 70);
});

test("rounded accounting allocations sum to the exact cash cost", () => {
  for (const total of [0, 1, 137, 281554]) {
    const parts = splitRoundedCost(total, [123.7, 55.7, 12, 93.17]);
    assert.equal(parts.reduce((sum, value) => sum + value, 0), total);
    assert.ok(parts.every(Number.isInteger));
  }
});

test("daily and weekly reports separate operations, reserve, investments, subsidies and adjustments", () => {
  const events: FinanceEvent[] = [
    flightEvent(now), { kind: "cash", gameTimeMs: now, category: "extraMaintenance", delta: -20 },
    { kind: "cash", gameTimeMs: now, category: "aircraftPurchases", delta: -1000 },
    { kind: "cash", gameTimeMs: now, category: "routeOpening", delta: -200 },
    { kind: "cash", gameTimeMs: now, category: "basePurchases", delta: -300 },
    { kind: "cash", gameTimeMs: now, category: "subsidies", delta: 500 },
    { kind: "cash", gameTimeMs: now, category: "adjustments", delta: -50 }
  ];
  const original = createFinancialHistory(now, 10000);
  const history = applyFinanceEvents(original, events, now + DAY_MS);
  const days = financialDays(history, now + DAY_MS);
  assert.equal(original.days.length, 0);
  assert.equal(days[0].revenue, 300);
  assert.equal(days[0].cost, 200);
  assert.equal(days[0].profit, 80);
  assert.equal(days[0].maintenanceReserve, 60);
  assert.equal(days[0].cashChange, -970);
  assert.equal(days[0].closingCash, 9030);
  assert.equal(days[1].openingCash, 9030);
  assert.equal(days[0].partial, true);
  assert.equal(days[0].inProgress, false);
  assert.equal(days[1].inProgress, true);
  const weeks = financialWeeks(days, history, now + DAY_MS);
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].profit, 80);
  assert.equal(weeks[0].closingCash, 9030);
  assert.equal(weeks[0].partial, true);
});

test("ninety-day retention and seven-day diagnostics retain exact cash across a long time jump", () => {
  const later = now + 110 * DAY_MS;
  const events = Array.from({ length: 111 }, (_, i) => flightEvent(now + i * DAY_MS));
  const history = applyFinanceEvents(createFinancialHistory(now, 10000), events, later);
  const days = financialDays(history, later);
  assert.equal(days.length, 90);
  assert.equal(history.days.length, 90);
  assert.equal(history.recentOperations.length, 7);
  assert.equal(history.openingCash, 12100);
  assert.equal(days.at(-1)!.closingCash, 21100);
  assert.equal(recentOperatingTotals(history, later, "aircraft").plane.flights, 7);
  assert.equal(financialWeeks(days, history, later)[0].partial, true);
  const next = applyFinanceEvents(history, [], later + 100 * DAY_MS);
  assert.equal(next.days.length, 0);
  assert.equal(next.recentOperations.length, 0);
  assert.equal(financialDays(next, later + 100 * DAY_MS).at(-1)!.closingCash, 21100);
});

test("old pending settlements are cash adjustments before tracking, not fabricated old sales", () => {
  const history = applyFinanceEvents(createFinancialHistory(now, 10000), [flightEvent(now - DAY_MS)], now);
  const day = financialDays(history, now)[0];
  assert.equal(day.earlierSettlements, 100);
  assert.equal(day.revenue, 0);
  assert.equal(day.flights, 0);
  assert.equal(day.closingCash, 10100);
  assert.deepEqual(recentOperatingTotals(history, now, "aircraft"), {});
});

test("legacy and malformed report saves start safely and never invent recent history", () => {
  const game = fixture();
  game.financialHistory = undefined;
  game.flightLog = [flightEvent(now).entry];
  const restored = normalizeGame(game)!;
  assert.equal(restored.financialHistory!.days.length, 0);
  assert.equal(restored.financialHistory!.openingCash, game.money);
  assert.equal(restored.flightLog.length, 1);
  assert.equal(restored.fleet[0].totalRevenue, 0);
  assert.equal(restored.fleet[0].totalFlights, 0);
  assert.equal(normalizeFinancialHistory({ ...createFinancialHistory(now, 1), trackingStartedGameTimeMs: Infinity }, now, 22).openingCash, 22);
  const adjusted = normalizeFinancialHistory(createFinancialHistory(now, 100), now, -40);
  assert.equal(financialDays(adjusted, now)[0].adjustments, -140);
  assert.equal(financialDays(adjusted, now)[0].closingCash, -40);
  assert.deepEqual(normalizeFinancialHistory(adjusted, now, -40), adjusted);
});

test("actual flight events reconcile costs and do not repeat on another tick or compact reload", () => {
  const game = fixture();
  const result = advanceAircraftOperations(game.fleet[0], game.routes, now + 2 * hour, game.difficultyConfig);
  const event = result.financeEvents[0];
  assert.equal(event.kind, "flight");
  if (event.kind !== "flight") return;
  assert.equal(event.entry.revenue, event.values.passengerRevenue + event.values.cargoRevenue);
  assert.equal(event.entry.cost, event.values.fuelCost + event.values.crewCost + event.values.airportCost + event.values.maintenanceReserve);
  game.currentGameTimeMs = now + 2 * hour;
  game.fleet = [result.aircraft];
  game.money += result.entries[0].profit;
  game.financialHistory = applyFinanceEvents(game.financialHistory!, result.financeEvents, game.currentGameTimeMs);
  const restored = normalizeGame(restoreGameStateFromCloudSave(JSON.parse(JSON.stringify(createCompactSaveState(game)))))!;
  assert.deepEqual(restored.financialHistory, game.financialHistory);
  assert.equal(restored.fleet[0].lastCompletedFlightGameTimeMs, now + hour);
  assert.equal(advanceAircraftOperations(restored.fleet[0], restored.routes, now + 3 * hour, restored.difficultyConfig).financeEvents.length, 0);
  assert.equal(financialDays(restored.financialHistory!, restored.currentGameTimeMs).at(-1)!.closingCash, restored.money);
});

test("store purchases and console adjustments change cash without becoming operating profit", (t) => {
  t.mock.method(Date, "now", () => 1800000000000);
  useGameStore.getState().startGame("Reports Air", "lhr", "easy");
  useGameStore.setState({ isAdminUser: true });
  const start = useGameStore.getState().game!;
  assert.equal(financialDays(start.financialHistory!, start.currentGameTimeMs)[0].basePurchases, 100000000);
  assert.equal(useGameStore.getState().buyAircraft("a220-300", aircraftById["a220-300"].suggestedLayout, "G-REPORT", "lhr").ok, true);
  assert.equal(useGameStore.getState().openRoute("lhr", "cdg").ok, true);
  assert.equal(useGameStore.getState().buyBaseAirport("cdg").ok, true);
  useGameStore.getState().addConsoleMoney(100000);
  useGameStore.getState().setConsoleMoney(300000000);
  const game = useGameStore.getState().game!;
  const day = financialDays(game.financialHistory!, game.currentGameTimeMs)[0];
  assert.ok(day.aircraftPurchases > 0);
  assert.ok(day.routeOpening > 0);
  assert.equal(day.basePurchases, 200000000);
  assert.equal(day.revenue, 0);
  assert.equal(day.profit, 0);
  assert.equal(game.totalProfit, 0);
  assert.equal(day.closingCash, 300000000);
  useGameStore.setState({ game: null, isAdminUser: false });
});

test("maintenance uses existing reserve first and only the shortfall affects report profit", (t) => {
  t.mock.method(Date, "now", () => 1800000000000);
  const game = fixture();
  game.isPaused = true;
  game.fleet[0].schedule = [];
  game.fleet[0].lifecycle!.reserveBalance = 25000;
  const quote = quoteMaintenance(aircraftById["a220-300"], game.fleet[0].lifecycle!, "service");
  useGameStore.setState({ game });
  assert.equal(useGameStore.getState().startAircraftMaintenance("plane", "service").ok, true);
  const after = useGameStore.getState().game!;
  const day = financialDays(after.financialHistory!, after.currentGameTimeMs)[0];
  assert.equal(day.extraMaintenance, quote.cashCost);
  assert.equal(day.maintenanceReserve, 0);
  assert.equal(day.profit, -quote.cashCost);
  assert.equal(day.closingCash, after.money);
  assert.equal(useGameStore.getState().startAircraftMaintenance("plane", "service").ok, false);
  assert.equal(financialDays(useGameStore.getState().game!.financialHistory!, now)[0].extraMaintenance, quote.cashCost);
  useGameStore.setState({ game: null });
});

test("pause, faster multi-day settlement, subsidy and repeated reload preserve one accounting owner", (t) => {
  let wall = 1800000000000;
  t.mock.method(Date, "now", () => wall);
  const game = fixture();
  // Isolate bailout accounting from the new first-flight milestone reward.
  game.companyGrowth!.milestones = Object.fromEntries(MILESTONES.map((milestone) => [milestone.id, "earned"]));
  game.routes[0].pricing = { first: 0, business: 0, premiumEconomy: 0, economy: 0, cargo: 0 };
  game.money = 1;
  game.financialHistory = createFinancialHistory(now, 1);
  game.lastTickRealMs = wall;
  game.isPaused = true;
  useGameStore.setState({ game });
  wall += DAY_MS;
  useGameStore.getState().tickSimulation();
  assert.equal(useGameStore.getState().game!.financialHistory!.days.length, 0);
  useGameStore.setState({ game: { ...useGameStore.getState().game!, isPaused: false, timeMultiplier: 100 } });
  wall += DAY_MS / 100 * 2;
  useGameStore.getState().tickSimulation();
  const settled = useGameStore.getState().game!;
  assert.equal(settled.completedFlights, 1);
  const days = financialDays(settled.financialHistory!, settled.currentGameTimeMs);
  assert.equal(days[0].flights, 1);
  assert.equal(days[0].revenue, 0);
  assert.ok(days[0].profit < 0);
  assert.equal(days.at(-1)!.subsidies, 1000000000);
  assert.equal(days.at(-1)!.closingCash, settled.money);
  useGameStore.setState({ game: normalizeGame(restoreGameStateFromCloudSave(JSON.parse(JSON.stringify(createCompactSaveState(settled))))) });
  useGameStore.getState().tickSimulation();
  assert.deepEqual(useGameStore.getState().game!.financialHistory, settled.financialHistory);
  useGameStore.setState({ game: null });
});

test("negative canonical cash survives compact/local normalization and is not erased in finance", () => {
  const game = fixture();
  game.money = -100;
  game.financialHistory = normalizeFinancialHistory(game.financialHistory, now, -100);
  const restored = normalizeGame(restoreGameStateFromCloudSave(JSON.parse(JSON.stringify(createCompactSaveState(game)))))!;
  assert.equal(getCurrentCash(restored), -100);
  assert.equal(restored.money, -100);
  assert.equal(financialDays(restored.financialHistory!, now)[0].closingCash, -100);
});

test("fleet loss alerts require five recent flights and expire at the seven-day boundary", () => {
  const game = fixture();
  const events = Array.from({ length: 5 }, () => flightEvent(now, -10));
  game.financialHistory = applyFinanceEvents(game.financialHistory!, events.slice(0, 4), now);
  assert.equal(fleetAlerts(game)[0].kinds.includes("loss"), false);
  game.financialHistory = applyFinanceEvents(game.financialHistory, events.slice(4), now);
  assert.equal(fleetAlerts(game)[0].kinds.includes("loss"), true);
  game.currentGameTimeMs += 7 * DAY_MS;
  assert.equal(fleetAlerts(game)[0].kinds.includes("loss"), false);
});

test("fleet distinguishes blocked/grounded, unplanned service and arranged maintenance", () => {
  const game = fixture();
  game.fleet[0].lifecycle!.hoursSinceService = 500;
  assert.deepEqual(fleetAlerts(game)[0].kinds, ["service"]);
  game.fleet[0].lifecycle!.reservation = { kind: "service", afterFlightId: "leg", state: "scheduled" };
  assert.deepEqual(fleetAlerts(game)[0].kinds, ["arranged"]);
  game.fleet[0].lifecycle!.reservation!.state = "blocked";
  game.fleet[0].lifecycle!.reservation!.error = "cash";
  assert.ok(fleetAlerts(game)[0].kinds.includes("urgent"));
  game.fleet[0].lifecycle!.reservation = undefined;
  game.fleet[0].lifecycle!.condition = 20;
  assert.equal(fleetAlerts(game)[0].kinds.includes("urgent"), true);
  assert.equal(fleetAlerts(game)[0].kinds.includes("idle"), false);
});

test("idle requires past 24 hours and no valid next 24-hour leg; cancellation and wrong location do not count", () => {
  const game = fixture();
  game.currentGameTimeMs += 2 * DAY_MS;
  game.fleet[0].status = "idle";
  game.fleet[0].schedule = [];
  assert.equal(fleetAlerts(game)[0].kinds.includes("idle"), true);
  game.fleet[0].lastCompletedFlightGameTimeMs = game.currentGameTimeMs - hour;
  assert.equal(fleetAlerts(game)[0].kinds.includes("idle"), false);
  game.fleet[0].lastCompletedFlightGameTimeMs = 0;
  const leg = { ...flight(game.currentGameTimeMs + hour), status: "scheduled" as const };
  game.fleet[0].schedule = [leg];
  assert.equal(fleetAlerts(game)[0].kinds.includes("idle"), false);
  game.fleet[0].schedule = [{ ...leg, status: "cancelled" }];
  assert.equal(fleetAlerts(game)[0].kinds.includes("idle"), true);
  game.fleet[0].schedule = [{ ...leg, originAirportId: "cdg", destinationAirportId: "lhr" }];
  assert.equal(fleetAlerts(game)[0].kinds.includes("idle"), true);
  game.fleet[0].schedule = [];
  game.fleet[0].lifecycle!.acquiredGameTimeMs = game.currentGameTimeMs;
  assert.equal(fleetAlerts(game)[0].kinds.includes("idle"), false);
});

test("100 independent aircraft produce bounded summaries beyond the 60-flight log", () => {
  const game = fixture();
  const aircraft = game.fleet[0];
  game.fleet = Array.from({ length: 100 }, (_, i) => ({ ...aircraft, id: "plane" + i, registration: "G-T" + i,
    schedule: [{ ...flight(), id: "leg" + i, aircraftId: "plane" + i }] }));
  const results = game.fleet.map((plane) => advanceAircraftOperations(plane, game.routes, now + 2 * hour, game.difficultyConfig));
  const history = applyFinanceEvents(game.financialHistory!, results.flatMap((result) => result.financeEvents), now + 2 * hour);
  assert.equal(history.days[0].flights, 100);
  assert.equal(Object.keys(history.recentOperations[0].aircraft).length, 100);
  assert.equal(game.fleet[0].registration, "G-T0");
  assert.equal(game.fleet[99].registration, "G-T99");
  assert.equal(history.recentOperations.length, 1);
});

function flightEvent(time: number, profit = 100): Extract<FinanceEvent, { kind: "flight" }> {
  return { kind: "flight", gameTimeMs: time,
    entry: { id: "event-" + time, aircraftId: "plane", aircraftRegistration: "G-REPORT", routeId: "lhr-cdg", flightNumber: "RP2",
      originAirportId: "lhr", destinationAirportId: "cdg", completedGameTime: time, revenue: 200 + profit, cost: 200, profit, passengerCount: 50, cargoTons: 5 },
    values: { passengerRevenue: 150 + profit, cargoRevenue: 50, fuelCost: 40, crewCost: 60, airportCost: 40, maintenanceReserve: 60, passengerCapacity: 100, cargoCapacity: 10 }
  };
}
function flight(departure = now): ScheduleItem {
  return { id: "leg", aircraftId: "plane", routeId: "lhr-cdg", originAirportId: "lhr", destinationAirportId: "cdg",
    departureGameTime: departure, arrivalGameTime: departure + hour, readyGameTime: departure + 2 * hour,
    status: "in-flight", technicalChecked: true, baseDelayMinutes: 0 };
}
function fixture(): GameState {
  return normalizeGame(restoreGameStateFromCloudSave({ saveFormatVersion: 2, airlineName: "Report Air", difficulty: "easy", baseAirportId: "lhr",
    money: 10000000, baseGameTimeMs: now, currentGameTimeMs: now, isPaused: false,
    routes: [{ id: "lhr-cdg", originAirportId: "lhr", destinationAirportId: "cdg", isOpen: true }],
    fleet: [{ id: "plane", modelId: "a220-300", registration: "G-REPORT", currentAirportId: "lhr",
      cabinLayout: aircraftById["a220-300"].suggestedLayout, schedule: [flight()], weeklySchedules: [] }]
  }))!;
}
