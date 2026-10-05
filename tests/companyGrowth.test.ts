import assert from "node:assert/strict";
import test from "node:test";
import { aircraftById } from "../src/data/aircraft";
import { airportsById } from "../src/data/airports";
import { acceptCompanyContract, abandonCompanyContract, advanceCompanyGrowth, applyCompanyGrowth, companyLevel, contractEligibility,
  createCompanyGrowth, MILESTONES, normalizeCompanyGrowth, refreshContractBoard, totalDevelopmentPoints } from "../src/lib/companyGrowth";
import { createCompactSaveState, restoreGameStateFromCloudSave } from "../src/lib/cloudSave";
import { applyFinanceEvents, createFinancialHistory, financialDays } from "../src/lib/financialReports";
import { advanceAircraftOperations } from "../src/lib/aircraftOperations";
import { DAY_MS } from "../src/lib/time";
import { normalizeGame, useGameStore } from "../src/store/gameStore";
import type { CompanyContract, ContractKind } from "../src/types/companyGrowth";
import type { FinanceEvent } from "../src/types/finance";
import type { GameState, ScheduleItem } from "../src/types/game";

const now = Date.UTC(2026, 0, 1, 6), hour = 3600000;
useGameStore.persist.setOptions({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });
function fixture(): GameState {
  const game = normalizeGame(restoreGameStateFromCloudSave({ saveFormatVersion: 2, airlineName: "Growth Air", difficulty: "easy", baseAirportId: "lhr",
    money: 200000000, baseGameTimeMs: now, currentGameTimeMs: now, isPaused: false,
    routes: ["cdg", "ams", "fra"].map((destinationAirportId) => ({ id: "lhr-" + destinationAirportId, originAirportId: "lhr", destinationAirportId, isOpen: true })),
    fleet: [{ id: "plane", modelId: "a220-300", registration: "G-GROW", currentAirportId: "lhr", status: "idle",
      cabinLayout: aircraftById["a220-300"].suggestedLayout, schedule: [], weeklySchedules: [] }]
  }))!;
  game.companyGrowth = createCompanyGrowth(game);
  game.financialHistory = createFinancialHistory(now, game.money);
  return game;
}
function contract(kind: ContractKind = "commuter", required = 2): CompanyContract {
  return { id: "0:" + kind, key: kind + ":cdg:lhr", kind, durationDays: kind === "cargo" ? 10 : 7, points: kind === "cargo" ? 150 : 100,
    cashReward: 800, quotedCost: 10000, acceptedGameTimeMs: now, deadlineGameTimeMs: now + (kind === "cargo" ? 10 : 7) * DAY_MS,
    targets: [{ originId: "lhr", destinationId: "cdg", required, progress: 0, needsNewRoute: false }] };
}
function event(id: string, time = now + hour, departure = now, pax = 50, cargo = 5): Extract<FinanceEvent, { kind: "flight" }> {
  return { kind: "flight", gameTimeMs: time, departureGameTimeMs: departure,
    entry: { id, aircraftId: "plane", aircraftRegistration: "G-GROW", routeId: "lhr-cdg", originAirportId: "lhr", destinationAirportId: "cdg",
      completedGameTime: time, revenue: 300, cost: 200, profit: 100, passengerCount: pax, cargoTons: cargo },
    values: { passengerRevenue: 200, cargoRevenue: 100, fuelCost: 80, crewCost: 40, airportCost: 40, maintenanceReserve: 40, passengerCapacity: 100, cargoCapacity: 10 } };
}

test("new companies start at zero; thresholds are permanent non-spendable experience", () => {
  const growth = fixture().companyGrowth!;
  assert.equal(totalDevelopmentPoints(growth), 0);
  for (const [points, level] of [[299, 0], [300, 1], [999, 1], [1000, 2], [2500, 3], [6000, 4]]) {
    growth.points.contracts = points;
    assert.equal(companyLevel(growth), level);
  }
});
test("legacy migration grants points once, no cash, and no fictional earlier flights", () => {
  const game = fixture();
  game.companyGrowth = undefined;
  game.completedFlights = 1200; game.passengerCount = 50000; game.cargoTransportedTons = 2000;
  const migrated = normalizeGame(game)!;
  assert.equal(migrated.money, game.money);
  assert.equal(migrated.totalProfit, game.totalProfit);
  assert.equal(migrated.companyGrowth!.milestones.firstFlight, "legacy");
  assert.equal(migrated.companyGrowth!.progress.flights, 1200);
  assert.ok(companyLevel(migrated.companyGrowth!) >= 2);
  assert.deepEqual(normalizeGame(migrated)!.companyGrowth, migrated.companyGrowth);
  assert.equal(advanceCompanyGrowth({ ...migrated, currentGameTimeMs: now + hour }, [event("new")]).cashReward, 0);
});
test("eligible offers are stable, limited to three, frozen on acceptance, and limited to two active", () => {
  let game = fixture();
  game.companyGrowth = refreshContractBoard(game);
  assert.equal(game.companyGrowth.offers.length, 3);
  assert.deepEqual(refreshContractBoard(game), game.companyGrowth);
  const offers = structuredClone(game.companyGrowth.offers);
  game = acceptCompanyContract(game, offers[0].id).game;
  assert.equal(game.companyGrowth!.active[0].cashReward, offers[0].cashReward);
  assert.equal(acceptCompanyContract(game, offers[0].id).error, "unavailable");
  game = acceptCompanyContract(game, offers[1].id).game;
  assert.equal(acceptCompanyContract(game, offers[2].id).error, "slotsFull");
  assert.equal(game.money, fixture().money);
});
test("zero fleet, zero payload, grounded aircraft and out-of-range routes do not produce impossible offers", () => {
  const game = fixture();
  game.fleet = [];
  assert.equal(refreshContractBoard(game).offers.length, 0);
  game.fleet = fixture().fleet;
  game.fleet[0].status = "grounded";
  assert.equal(refreshContractBoard(game).offers.length, 0);
  game.fleet[0].status = "idle";
  game.fleet[0].cabinLayout = { first: 0, business: 0, premiumEconomy: 0, economy: 0, cargoTons: 0 };
  game.companyGrowth!.points.contracts = 300;
  assert.equal(refreshContractBoard(game).offers.length, 0);
  game.fleet = fixture().fleet;
  game.routes = [{ ...game.routes[0], distanceKm: 99999 }];
  assert.equal(refreshContractBoard(game).offers.length, 0);
});
test("offers refresh at three game days, not on abandoning or reloading; cooldown lasts seven days", () => {
  let game = fixture();
  game.companyGrowth = refreshContractBoard(game);
  const offer = game.companyGrowth.offers[0];
  game = abandonCompanyContract(acceptCompanyContract(game, offer.id).game, offer.id);
  assert.equal(totalDevelopmentPoints(game.companyGrowth!), 0);
  assert.equal(acceptCompanyContract(game, offer.id).error, "unavailable");
  const frozen = structuredClone(game.companyGrowth!.offers);
  game.currentGameTimeMs += 2 * DAY_MS;
  assert.deepEqual(refreshContractBoard(game).offers, frozen);
  game.currentGameTimeMs = now + 3 * DAY_MS;
  assert.ok(!refreshContractBoard(game).offers.some((item) => item.key === offer.key));
  game.currentGameTimeMs = now + 9 * DAY_MS;
  assert.ok(refreshContractBoard(game).offers.some((item) => item.key === offer.key));
});
test("long-haul startups can earn points without an artificial regional-range lock", () => {
  const game = fixture();
  game.fleet[0].modelId = "a350-900";
  game.fleet[0].cabinLayout = aircraftById["a350-900"].suggestedLayout;
  game.routes = [{ ...game.routes[0], id: "lhr-jfk", destinationAirportId: "jfk", distanceKm: 5500 }];
  const board = refreshContractBoard(normalizeGame(game)!);
  assert.equal(companyLevel(board), 0);
  assert.equal(board.offers.length, 1);
  assert.ok(board.offers[0].targets[0].required >= 2 && board.offers[0].targets[0].required < 20);
});
test("pre-accept departure, empty legs and future events do not count; outbound and return each count", () => {
  const game = fixture(); game.companyGrowth!.active = [contract()]; game.currentGameTimeMs = now + 2 * hour;
  const old = event("old", now + hour, now - 1), empty = event("empty", now + hour, now, 0, 0), future = event("future", now + 3 * hour);
  const first = advanceCompanyGrowth(game, [old, empty, future]);
  assert.equal(first.growth.active[0].targets[0].progress, 0);
  const back = event("return", now + 2 * hour, now + hour);
  back.entry.originAirportId = "cdg"; back.entry.destinationAirportId = "lhr";
  const completed = advanceCompanyGrowth(game, [event("outbound"), back]);
  assert.equal(completed.growth.active.length, 0);
  assert.equal(completed.growth.history[0].outcome, "completed");
});
test("offline events complete chronologically before tick-end expiry, including exact deadline arrivals", () => {
  const game = fixture(); game.companyGrowth!.active = [contract()]; game.currentGameTimeMs = now + 30 * DAY_MS;
  const late = event("late", now + 8 * DAY_MS), deadline = event("deadline", now + 7 * DAY_MS, now + 6 * DAY_MS);
  const result = advanceCompanyGrowth(game, [late, deadline, event("first")]);
  assert.equal(result.growth.history[0].outcome, "completed");
  assert.equal(result.growth.history[0].endedGameTimeMs, now + 7 * DAY_MS);
  const missed = advanceCompanyGrowth(game, [event("first"), late]);
  assert.equal(missed.growth.history[0].outcome, "expired");
  assert.equal(missed.growth.points.contracts, 0);
});
test("duplicate events and replay after compact JSON reload cannot award points or cash twice", () => {
  const game = fixture(); game.companyGrowth!.active = [contract("commuter", 1)]; game.currentGameTimeMs += hour;
  const first = advanceCompanyGrowth(game, [event("once"), event("once")]);
  assert.equal(first.growth.progress.flights, 1);
  assert.equal(first.growth.points.contracts, 100);
  assert.equal(first.cashReward, 25800);
  game.companyGrowth = first.growth;
  const reload = normalizeGame(restoreGameStateFromCloudSave(JSON.parse(JSON.stringify(createCompactSaveState(game)))))!;
  const replay = advanceCompanyGrowth(reload, [event("once")]);
  assert.equal(replay.cashReward, 0);
  assert.deepEqual(replay.growth, first.growth);
});
test("same actual flight can advance different types; cargo uses actual tonnage", () => {
  const game = fixture(); game.companyGrowth!.active = [contract("commuter", 1), contract("cargo", 7)]; game.currentGameTimeMs += hour;
  const result = advanceCompanyGrowth(game, [event("one", now + hour, now, 50, 2.5)]);
  assert.equal(result.growth.history[0].kind, "commuter");
  assert.equal(result.growth.active[0].targets[0].progress, 2.5);
  assert.equal(result.growth.points.contracts, 100);
});
test("network contract requires three distinct cities and an unopened affordable route", () => {
  const game = fixture(); game.companyGrowth!.points.contracts = 1000;
  const board = refreshContractBoard(game);
  const network = board.offers.find((item) => item.kind === "network")!;
  assert.ok(network);
  assert.equal(network.targets.length, 3);
  assert.equal(new Set(network.targets.map((target) => airportsById[target.destinationId].city)).size, 3);
  assert.equal(network.targets.filter((target) => target.needsNewRoute).length, 1);
  game.companyGrowth = board;
  assert.equal(contractEligibility(game, network), null);
  game.money = 0;
  assert.equal(contractEligibility(game, network), "ineligible");
  assert.ok(!refreshContractBoard({ ...game, companyGrowth: createCompanyGrowth(game) }, { ...createCompanyGrowth(game), points: { contracts: 1000, milestones: 0, legacy: 0 } })
    .offers.some((item) => item.kind === "network"));
});
test("network counts only arrivals at every designated city, not return flights or old route openings", () => {
  const game = fixture(); game.companyGrowth!.points.contracts = 1000;
  game.companyGrowth = refreshContractBoard(game);
  const offer = game.companyGrowth.offers.find((item) => item.kind === "network")!;
  const accepted = acceptCompanyContract(game, offer.id).game;
  accepted.currentGameTimeMs += 3 * hour;
  const events = offer.targets.flatMap((target, index) => [0, 1].map((i) => {
    const value = event(index + ":" + i, now + (i + 1) * hour);
    value.entry.destinationAirportId = target.destinationId;
    return value;
  }));
  const result = advanceCompanyGrowth(accepted, events.reverse());
  assert.equal(result.growth.history[0].outcome, "completed");
  assert.equal(result.growth.points.contracts, 1200);
});
test("opening a network target before acceptance invalidates the offer rather than counting old expansion", () => {
  const game = fixture(); game.companyGrowth!.points.contracts = 1000; game.companyGrowth = refreshContractBoard(game);
  const offer = game.companyGrowth.offers.find((item) => item.kind === "network")!;
  const target = offer.targets.find((target) => target.needsNewRoute)!;
  game.routes.push({ ...game.routes[0], id: target.originId + "-" + target.destinationId, destinationAirportId: target.destinationId });
  assert.equal(acceptCompanyContract(game, offer.id).error, "ineligible");
  assert.equal(game.companyGrowth.active.length, 0);
});
test("company cash rewards reconcile in Finance without inflating flight revenue or profit", () => {
  const game = fixture(); game.companyGrowth!.active = [contract("commuter", 1)]; game.currentGameTimeMs += hour;
  game.money += 100;
  game.financialHistory = applyFinanceEvents(game.financialHistory!, [event("one")], game.currentGameTimeMs);
  const result = applyCompanyGrowth(game, [event("one")]);
  const report = financialDays(result.financialHistory!, result.currentGameTimeMs).at(-1)!;
  assert.equal(report.contractRewards, 25800);
  assert.equal(report.revenue, 300);
  assert.equal(report.profit, 100);
  assert.equal(report.closingCash, result.money);
  assert.equal(result.totalProfit, game.totalProfit);
});
test("milestones are one-time and console stat changes do not earn them", (t) => {
  const game = fixture(); game.isPaused = true;
  game.money = 1000000000;
  useGameStore.setState({ game, isAdminUser: true });
  useGameStore.getState().addConsoleStats({ completedFlights: 1000, passengerCount: 10000, cargoTransportedTons: 1000 });
  const after = useGameStore.getState().game!;
  assert.equal(advanceCompanyGrowth(after, []).cashReward, 0);
  assert.equal(totalDevelopmentPoints(after.companyGrowth!), 0);
  t.mock.method(Date, "now", () => 1800000000000);
  for (let i = 1; i <= 4; i++) {
    const result = useGameStore.getState().buyAircraft("a220-300", aircraftById["a220-300"].suggestedLayout, "G-X00" + i, "lhr");
    assert.equal(result.ok, true, result.message);
  }
  const purchased = useGameStore.getState().game!;
  assert.equal(purchased.companyGrowth!.milestones.fleet5, "earned");
  assert.equal(purchased.companyGrowth!.points.milestones, 100);
  assert.equal(advanceCompanyGrowth(purchased, [], true).cashReward, 0);
  useGameStore.setState({ game: null, isAdminUser: false });
});
test("pause freezes deadlines; 100x offline catch-up, local save and repeated ticks preserve rewards", (t) => {
  let wall = 1800000000000; t.mock.method(Date, "now", () => wall);
  const game = fixture(); game.companyGrowth!.active = [contract("commuter", 1)]; game.lastTickRealMs = wall; game.isPaused = true;
  game.fleet[0].schedule = [{ id: "scheduled", aircraftId: "plane", routeId: "lhr-cdg", originAirportId: "lhr", destinationAirportId: "cdg",
    departureGameTime: now + hour, arrivalGameTime: now + 2 * hour, readyGameTime: now + 3 * hour,
    status: "scheduled", technicalChecked: true, baseDelayMinutes: 0 }];
  useGameStore.setState({ game }); wall += 30 * DAY_MS; useGameStore.getState().tickSimulation();
  assert.equal(useGameStore.getState().game!.currentGameTimeMs, now);
  useGameStore.setState({ game: { ...useGameStore.getState().game!, isPaused: false, timeMultiplier: 100 } });
  wall += 30 * DAY_MS / 100; useGameStore.getState().tickSimulation();
  const after = useGameStore.getState().game!;
  assert.equal(after.companyGrowth!.history[0].outcome, "completed");
  assert.equal(after.companyGrowth!.progress.flights, 1);
  assert.equal(financialDays(after.financialHistory!, after.currentGameTimeMs).at(-1)!.closingCash, after.money);
  const restored = normalizeGame(restoreGameStateFromCloudSave(JSON.parse(JSON.stringify(createCompactSaveState(after)))))!;
  useGameStore.setState({ game: restored }); useGameStore.getState().tickSimulation();
  assert.deepEqual(useGameStore.getState().game!.companyGrowth, after.companyGrowth);
  assert.equal(useGameStore.getState().game!.money, after.money);
  useGameStore.setState({ game: null });
});
test("acceptance first settles stale wall time and cannot retroactively count an already airborne flight", (t) => {
  let wall = 1800000000000; t.mock.method(Date, "now", () => wall);
  const game = fixture(); game.lastTickRealMs = wall; game.timeMultiplier = 1; game.companyGrowth = refreshContractBoard(game);
  const offer = game.companyGrowth.offers.find((offer) => offer.targets[0].destinationId === "cdg")!;
  game.fleet[0].schedule = [{ id: "airborne", aircraftId: "plane", routeId: "lhr-cdg", originAirportId: "lhr", destinationAirportId: "cdg",
    actualDepartureGameTime: now, departureGameTime: now, arrivalGameTime: now + hour, readyGameTime: now + 2 * hour, status: "in-flight" }];
  useGameStore.setState({ game });
  wall += 2 * hour;
  const result = useGameStore.getState().acceptContract(offer.id);
  assert.equal(result.ok, true, result.error);
  const after = useGameStore.getState().game!;
  assert.equal(after.completedFlights, 1);
  assert.equal(after.companyGrowth!.active[0].acceptedGameTimeMs, now + 2 * hour);
  assert.equal(after.companyGrowth!.active[0].targets[0].progress, 0);
  assert.equal(useGameStore.getState().acceptContract(offer.id).ok, false);
  useGameStore.setState({ game: null });
});
test("maintenance cancellation yields no mission event", () => {
  const game = fixture(), aircraft = game.fleet[0];
  const cancelled: ScheduleItem = { id: "cancelled", aircraftId: aircraft.id, routeId: game.routes[0].id, originAirportId: "lhr", destinationAirportId: "cdg",
    departureGameTime: now, arrivalGameTime: now + hour, readyGameTime: now + 2 * hour, status: "cancelled", cancellationReason: "maintenance" };
  aircraft.schedule = [cancelled];
  const operation = advanceAircraftOperations(aircraft, game.routes, now + 3 * hour, game.difficultyConfig);
  game.companyGrowth!.active = [contract()]; game.currentGameTimeMs += 3 * hour;
  const result = advanceCompanyGrowth(game, operation.financeEvents);
  assert.equal(result.growth.active[0].targets[0].progress, 0);
});
test("100 aircraft events, milestone totals and history remain bounded and independent", () => {
  const game = fixture(); game.currentGameTimeMs += hour;
  const result = advanceCompanyGrowth(game, Array.from({ length: 100 }, (_, i) => {
    const flight = event("plane" + i);
    flight.entry.aircraftId = "plane" + i;
    flight.entry.aircraftRegistration = "G-P" + i;
    return flight;
  }));
  assert.equal(result.growth.progress.flights, 100);
  assert.equal(result.growth.points.milestones, MILESTONES.filter((m) => m.id !== "fleet5").reduce((sum, m) => sum + m.points, 0));
  const grown = { ...game, companyGrowth: result.growth };
  for (let i = 0; i < 30; i++) {
    grown.companyGrowth.active = [{ ...contract(), id: "contract" + i }];
    grown.companyGrowth = abandonCompanyContract(grown, "contract" + i).companyGrowth!;
  }
  assert.equal(grown.companyGrowth.history.length, 20);
  assert.equal(grown.companyGrowth.cooldowns.length, 1);
  const invalid = structuredClone(grown.companyGrowth);
  invalid.active = [{ ...contract(), cashReward: Infinity }];
  assert.equal(normalizeCompanyGrowth(invalid, grown).active.length, 0);
  assert.ok(JSON.stringify(createCompactSaveState(grown)).length < 40000);
});
test("fractional cargo reaches exact targets without drift; invalid event times earn nothing", () => {
  const game = fixture(); game.currentGameTimeMs += hour; game.companyGrowth!.active = [contract("cargo", 1)];
  const flights = Array.from({ length: 10 }, (_, i) => event("fraction" + i, now + hour, now, 0, 0.1));
  const result = advanceCompanyGrowth(game, flights);
  assert.equal(result.growth.progress.cargoTons, 1);
  assert.equal(result.growth.history[0].outcome, "completed");
  const invalid = advanceCompanyGrowth(fixture(), [event("invalid", NaN)]);
  assert.equal(invalid.cashReward, 0);
  assert.equal(invalid.growth.progress.flights, 0);
});
