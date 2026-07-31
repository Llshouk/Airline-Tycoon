import assert from "node:assert/strict";
import test from "node:test";
import { restoreGameStateFromCloudSave } from "../src/lib/cloudSave";
import { normalizeGame } from "../src/store/gameStore";

const departureGameTime = Date.UTC(2026, 1, 2, 8);
const arrivalGameTime = Date.UTC(2026, 1, 2, 15);
const v122CompactSave = {
  saveFormatVersion: 2,
  airlineName: "Legacy Airways",
  difficulty: "realistic",
  gameStatus: "active",
  bailoutsUsed: 0,
  baseAirportId: "lhr",
  baseAirports: ["lhr", "cdg"],
  primaryBaseAirport: "lhr",
  expandedAirportIds: ["lhr", "cdg", "jfk"],
  money: 765_432_109,
  startedAtRealMs: Date.UTC(2026, 0, 1),
  baseGameTimeMs: Date.UTC(2026, 0, 1, 6),
  currentGameTimeMs: Date.UTC(2026, 1, 1, 6),
  timeMultiplier: 1,
  isPaused: false,
  fleet: [
    {
      id: "legacy-aircraft-1",
      modelId: "a220-300",
      registration: "G-V122",
      homeBaseAirportId: "lhr",
      currentAirportId: "lhr",
      status: "scheduled",
      schedule: [
        {
          id: "legacy-flight-1",
          weeklyScheduleId: "legacy-weekly-1",
          routeId: "lhr-jfk",
          aircraftId: "legacy-aircraft-1",
          flightNumber: "LA122",
          legType: "outbound",
          originAirportId: "lhr",
          destinationAirportId: "jfk",
          departureGameTime,
          arrivalGameTime,
          readyGameTime: arrivalGameTime + 40 * 60 * 1000,
          status: "scheduled"
        }
      ],
      weeklySchedules: [
        {
          id: "legacy-weekly-1",
          aircraftId: "legacy-aircraft-1",
          routeId: "lhr-jfk",
          outboundFlightNumber: "LA122",
          returnFlightNumber: "LA123",
          daysOfWeek: [1, 3, 5],
          departureTimeLocal: "08:00",
          isRoundTrip: true,
          blockMinutes: 900,
          turnaroundMinutes: 40,
          recurrenceRule: "WEEKLY:1,3,5@08:00",
          createdGameTime: Date.UTC(2026, 0, 2),
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
  flightLogSummary: [
    {
      id: "legacy-log-1",
      aircraftId: "legacy-aircraft-1",
      aircraftRegistration: "G-V122",
      flightNumber: "LA120",
      routeId: "lhr-jfk",
      originAirportId: "lhr",
      destinationAirportId: "jfk",
      completedGameTime: Date.UTC(2026, 0, 31),
      revenue: 300_000,
      cost: 200_000,
      profit: 100_000,
      passengerCount: 120,
      cargoTons: 4
    }
  ],
  totalProfit: 12_000_000,
  completedFlights: 42,
  passengerCount: 4_200,
  cargoTransportedTons: 84,
  lastTickRealMs: Date.UTC(2026, 1, 1),
  language: "en",
  updatedAt: "2026-02-01T00:00:00.000Z"
};

test("restores a V1.2.2 compact save without losing authoritative game fields", () => {
  const restored = normalizeGame(restoreGameStateFromCloudSave(v122CompactSave));

  assert.ok(restored);
  assert.equal(restored.airlineName, "Legacy Airways");
  assert.equal(restored.difficulty, "realistic");
  assert.equal(restored.money, 765_432_109);
  assert.deepEqual(restored.baseAirports, ["lhr", "cdg"]);
  assert.equal(restored.primaryBaseAirport, "lhr");
  assert.deepEqual(restored.expandedAirportIds, ["lhr", "cdg", "jfk"]);

  assert.equal(restored.fleet.length, 1);
  assert.equal(restored.fleet[0].registration, "G-V122");
  assert.equal(restored.fleet[0].homeBaseAirportId, "lhr");
  assert.deepEqual(restored.fleet[0].cabinLayout, v122CompactSave.fleet[0].cabinLayout);
  assert.equal(restored.fleet[0].weeklySchedules[0].outboundFlightNumber, "LA122");
  assert.equal(restored.fleet[0].schedule[0].scheduledDepartureGameTime, departureGameTime);

  assert.equal(restored.routes.length, 1);
  assert.equal(restored.routes[0].id, "lhr-jfk");
  assert.equal(restored.routes[0].originIata, "LHR");
  assert.equal(restored.routes[0].destinationIata, "JFK");
  assert.deepEqual(restored.routes[0].pricing, v122CompactSave.routes[0].pricing);
  assert.equal(restored.flightLog[0].aircraftRegistration, "G-V122");
  assert.equal(restored.updatedAt, "2026-02-01T00:00:00.000Z");
});
