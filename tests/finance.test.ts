import assert from "node:assert/strict";
import test from "node:test";
import { companyAge, DAY_MS, formatCompanyAge, formatCompanyFoundedAt } from "../src/lib/time";
import { sortFlightLog } from "../src/lib/finance";
import { createCompactSaveState, restoreGameStateFromCloudSave } from "../src/lib/cloudSave";
import { normalizeGame, useGameStore } from "../src/store/gameStore";
import type { FlightLogEntry } from "../src/types/game";

const founded = Date.UTC(2026, 0, 1, 6);
const entries: FlightLogEntry[] = [
  entry("a", "AT10", 300, 50, 2.5, 100),
  entry("b", "AT2", -20, 120, 1, 200),
  entry("c", undefined, 300, 80, 10, 300),
  entry("d", "AT1", 0, 30, 0, 400)
];

test("company age uses elapsed simulation time across days, leap day and years", () => {
  assert.deepEqual(companyAge({ baseGameTimeMs: founded, currentGameTimeMs: founded + 31 * DAY_MS + 2 * 3_600_000 + 17 * 60_000 + 59_999 }),
    { days: 31, hours: 2, minutes: 17 });
  assert.equal(companyAge({ baseGameTimeMs: Date.UTC(2028, 1, 28), currentGameTimeMs: Date.UTC(2028, 2, 1) }).days, 2);
  assert.equal(companyAge({ baseGameTimeMs: founded, currentGameTimeMs: founded + 400 * DAY_MS }).days, 400);
});

test("company age clamps reversed or invalid clocks and formats both languages", () => {
  for (const currentGameTimeMs of [founded - 1, NaN, Infinity]) {
    assert.deepEqual(companyAge({ baseGameTimeMs: founded, currentGameTimeMs }), { days: 0, hours: 0, minutes: 0 });
  }
  assert.deepEqual(companyAge({ baseGameTimeMs: NaN, currentGameTimeMs: founded }), { days: 0, hours: 0, minutes: 0 });
  assert.match(formatCompanyAge({ baseGameTimeMs: founded, currentGameTimeMs: founded + DAY_MS }, "en"), /1 day/);
  assert.match(formatCompanyAge({ baseGameTimeMs: founded, currentGameTimeMs: founded + DAY_MS }, "zh"), /1天/);
  assert.match(formatCompanyFoundedAt(Date.UTC(2026, 0, 1, 23, 59), "en"), /1 Jan 2026/);
  assert.equal(formatCompanyFoundedAt(NaN, "en"), "-");
});

test("sorts negative profit and equal values in both directions without changing history", () => {
  const frozen = Object.freeze(entries.map((value) => Object.freeze({ ...value })));
  assert.deepEqual(sortFlightLog(frozen, "profit", "desc").map((value) => value.id), ["c", "a", "d", "b"]);
  assert.deepEqual(sortFlightLog(frozen, "profit", "asc").map((value) => value.id), ["b", "d", "c", "a"]);
  assert.deepEqual(frozen.map((value) => value.id), ["a", "b", "c", "d"]);
  assert.equal(sortFlightLog(frozen, "profit", "desc")[0], frozen[2]);
});

test("flight numbers use natural numeric order and missing numbers stay last", () => {
  assert.deepEqual(sortFlightLog(entries, "flightNumber", "asc").map((value) => value.id), ["d", "b", "a", "c"]);
  assert.deepEqual(sortFlightLog(entries, "flightNumber", "desc").map((value) => value.id), ["a", "b", "d", "c"]);
  assert.deepEqual(sortFlightLog([entry("blank", " ", 0, 0, 0, 500), entries[0]], "flightNumber", "asc").map((value) => value.id), ["a", "blank"]);
});

test("sorts passenger counts, fractional cargo, revenue, cost and completion time", () => {
  assert.deepEqual(sortFlightLog(entries, "passengerCount", "desc").map((value) => value.id), ["b", "c", "a", "d"]);
  assert.deepEqual(sortFlightLog(entries, "passengerCount", "asc").map((value) => value.id), ["d", "a", "c", "b"]);
  assert.deepEqual(sortFlightLog(entries, "cargoTons", "desc").map((value) => value.id), ["c", "a", "b", "d"]);
  assert.deepEqual(sortFlightLog(entries, "cargoTons", "asc").map((value) => value.id), ["d", "b", "a", "c"]);
  assert.deepEqual(sortFlightLog(entries, "completedGameTime", "desc").map((value) => value.id), ["d", "c", "b", "a"]);
  assert.deepEqual(sortFlightLog(entries, "revenue", "asc").map((value) => value.id), ["b", "d", "c", "a"]);
  assert.equal(sortFlightLog(entries, "cost", "asc").length, entries.length);
  assert.deepEqual(sortFlightLog([], "profit", "desc"), []);
  assert.deepEqual(sortFlightLog([entries[0]], "profit", "desc"), [entries[0]]);
});

// A memory-only adapter prevents store tests from touching any player's saves.
useGameStore.persist.setOptions({ storage: {
  getItem: () => null, setItem: () => {}, removeItem: () => {}
} });

test("pause and speed act through the canonical clock; company age survives a compact reload", (t) => {
  let wallClock = 1_800_000_000_000;
  t.mock.method(Date, "now", () => wallClock);
  useGameStore.getState().startGame("Clock Airways", "lhr", "easy");
  const initial = useGameStore.getState().game!;
  useGameStore.setState({ game: { ...initial, isPaused: true, flightLog: entries, totalProfit: 580 } });
  wallClock += 2 * DAY_MS;
  useGameStore.getState().tickSimulation();
  assert.deepEqual(companyAge(useGameStore.getState().game!), { days: 0, hours: 0, minutes: 0 });
  useGameStore.setState({ game: { ...useGameStore.getState().game!, isPaused: false, timeMultiplier: 20 } });
  wallClock += 3 * 60_000;
  useGameStore.getState().tickSimulation();
  const advanced = useGameStore.getState().game!;
  assert.deepEqual(companyAge(advanced), { days: 0, hours: 1, minutes: 0 });
  const restored = normalizeGame(restoreGameStateFromCloudSave(JSON.parse(JSON.stringify(createCompactSaveState(advanced)))))!;
  assert.deepEqual(companyAge(restored), companyAge(advanced));
  assert.equal(restored.baseGameTimeMs, initial.baseGameTimeMs);
  assert.equal(restored.money, advanced.money);
  assert.equal(restored.totalProfit, advanced.totalProfit);
  assert.deepEqual(restored.flightLog, JSON.parse(JSON.stringify(advanced.flightLog)));
  useGameStore.setState({ game: null });
});

function entry(id: string, flightNumber: string | undefined, profit: number, passengerCount: number, cargoTons: number, completedGameTime: number): FlightLogEntry {
  return {
    id, flightNumber, profit, passengerCount, cargoTons, completedGameTime,
    aircraftId: "plane", aircraftRegistration: "G-TEST", routeId: "lhr-cdg",
    originAirportId: "lhr", destinationAirportId: "cdg", revenue: profit + 500, cost: 500
  };
}
