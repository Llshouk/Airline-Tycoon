import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { restoreGameStateFromCloudSave } from "../src/lib/cloudSave";
import { gameSaveStorage } from "../src/lib/gameSaveStorage";
import { normalizeGame } from "../src/store/gameStore";

const SAVE_KEY = "airline-tycoon-v1";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const localStorage = new MemoryStorage();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    indexedDB: new IDBFactory(),
    localStorage,
    setTimeout: (callback: () => void) => setTimeout(callback, 0)
  }
});

test("loads a pre-V1.3 save through the IndexedDB storage adapter", async () => {
  const departureGameTime = Date.UTC(2026, 1, 2, 8);
  const legacyGame = {
    saveFormatVersion: 2,
    airlineName: "Indexed Legacy Airways",
    difficulty: "realistic",
    gameStatus: "active",
    bailoutsUsed: 0,
    baseAirportId: "lhr",
    baseAirports: ["lhr", "cdg"],
    primaryBaseAirport: "lhr",
    expandedAirportIds: ["lhr", "cdg", "jfk"],
    money: 654_321_987,
    startedAtRealMs: Date.UTC(2026, 0, 1),
    baseGameTimeMs: Date.UTC(2026, 0, 1, 6),
    currentGameTimeMs: Date.UTC(2026, 1, 1, 6),
    timeMultiplier: 1,
    isPaused: false,
    fleet: [
      {
        id: "indexed-aircraft-1",
        modelId: "a220-300",
        registration: "G-IDB1",
        homeBaseAirportId: "lhr",
        currentAirportId: "lhr",
        status: "scheduled",
        schedule: [],
        weeklySchedules: [
          {
            id: "indexed-weekly-1",
            aircraftId: "indexed-aircraft-1",
            routeId: "lhr-jfk",
            outboundFlightNumber: "ID122",
            returnFlightNumber: "ID123",
            daysOfWeek: [1, 3, 5],
            departureTimeLocal: "08:00",
            isRoundTrip: true,
            blockMinutes: 900,
            turnaroundMinutes: 40,
            recurrenceRule: "WEEKLY:1,3,5@08:00",
            createdGameTime: departureGameTime,
            createdAt: "2026-01-02T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z"
          }
        ],
        cabinLayout: { first: 0, business: 12, premiumEconomy: 18, economy: 105, cargoTons: 6 },
        purchasePriceGBP: 72_000_000,
        totalRevenue: 12_345_678,
        totalFlights: 42,
        passengerCount: 4_200,
        cargoTransportedTons: 84
      }
    ],
    routes: [
      {
        id: "lhr-jfk",
        originAirportId: "lhr",
        originBaseAirportId: "lhr",
        destinationAirportId: "jfk",
        pricing: { first: 2_400, business: 1_200, premiumEconomy: 650, economy: 350, cargo: 1_500 },
        isOpen: true
      }
    ],
    flightLogSummary: [],
    totalProfit: 12_000_000,
    completedFlights: 42,
    passengerCount: 4_200,
    cargoTransportedTons: 84,
    lastTickRealMs: Date.UTC(2026, 1, 1),
    updatedAt: "2026-02-01T00:00:00.000Z"
  };
  const persisted = JSON.stringify({ state: { game: legacyGame, notice: null }, version: 2 });

  await gameSaveStorage.setItem(SAVE_KEY, persisted);
  const stored = await gameSaveStorage.getItem(SAVE_KEY);

  assert.equal(stored, persisted);
  assert.equal(localStorage.getItem(SAVE_KEY), null);

  const parsed = JSON.parse(stored!) as { state: { game: unknown } };
  const restored = normalizeGame(restoreGameStateFromCloudSave(parsed.state.game));

  assert.ok(restored);
  assert.equal(restored.airlineName, "Indexed Legacy Airways");
  assert.equal(restored.money, 654_321_987);
  assert.deepEqual(restored.baseAirports, ["lhr", "cdg"]);
  assert.equal(restored.fleet[0].registration, "G-IDB1");
  assert.deepEqual(restored.fleet[0].cabinLayout, legacyGame.fleet[0].cabinLayout);
  assert.equal(restored.fleet[0].weeklySchedules[0].outboundFlightNumber, "ID122");
  assert.equal(restored.routes[0].id, "lhr-jfk");
  assert.equal(restored.difficulty, "realistic");
});
