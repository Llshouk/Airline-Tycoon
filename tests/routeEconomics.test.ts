import assert from "node:assert/strict";
import test from "node:test";
import { calculateOperatingCosts } from "../src/lib/economics/operatingCosts";
import { calculateRouteEconomics, calculateScheduleFrequency, calculateWeeklyEconomics } from "../src/lib/economics/routeEconomics";
import type { RouteEconomicsInput } from "../src/lib/economics/economicsTypes";
import { aircraftById } from "../src/data/aircraft";
import { getDifficultyConfig } from "../src/config/difficulty";
import { estimateFlightFinancials, estimateExpectedFlightProfit, estimateScheduleFinancials, calculatePriceAdjustedDemand } from "../src/lib/economy";
import { restoreGameStateFromCloudSave } from "../src/lib/cloudSave";
import { advanceAircraftOperations } from "../src/lib/aircraftOperations";

const baseInput: RouteEconomicsInput = {
  distanceKm: 1_000,
  aircraftRangeKm: 5_000,
  cruiseSpeedKmh: 500,
  fuelCostPerKm: 100,
  cabinLayout: { first: 0, business: 10, premiumEconomy: 20, economy: 70, cargoTons: 10 },
  demand: { first: 0, business: 10, premiumEconomy: 20, economy: 70, cargoTons: 10 },
  pricing: { first: 1_000, business: 500, premiumEconomy: 250, economy: 100, cargo: 200 },
  loadFactor: 0.5,
  cargoLoadFactor: 0.5,
  revenueMultiplier: 1
};

test("calculates a deterministic short-haul revenue and operating-cost breakdown", () => {
  const result = calculateRouteEconomics(baseInput);

  assert.equal(result.validInput, true);
  assert.equal(result.rangeCompatible, true);
  assert.equal(result.passengerCount, 50);
  assert.equal(result.cargoTons, 5);
  assert.equal(result.estimatedRevenuePerFlight, 9_500);
  assert.equal(result.estimatedFuelCostPerFlight, 1_665);
  assert.equal(result.estimatedCrewCostPerFlight, 1_040);
  assert.equal(result.estimatedAirportCostPerFlight, 1_775);
  assert.equal(result.estimatedMaintenanceReservePerFlight, 2_700);
  assert.equal(result.estimatedTotalCostPerFlight, 7_180);
  assert.equal(result.estimatedTotalCostPerFlight, sumOperatingCosts(result));
  assert.equal(result.estimatedOperatingProfitPerFlight, 2_320);
  assert.equal(result.estimatedOperatingMargin, 2_320 / 9_500);
  assert.equal(result.estimatedBreakEvenLoadFactor, 6_180 / 17_000);
  assert.equal(result.breakEvenAchievable, true);
  assert.equal(result.routeSuitability, "strong");
});

test("calculates a finite long-haul result without mixing per-flight units", () => {
  const result = calculateRouteEconomics({
    ...baseInput,
    distanceKm: 6_000,
    aircraftRangeKm: 12_000,
    cruiseSpeedKmh: 900,
    fuelCostPerKm: 250,
    loadFactor: 0.8,
    cargoLoadFactor: 0.9,
    revenueMultiplier: 3.78
  });

  assert.equal(result.validInput, true);
  assert.equal(result.rangeCompatible, true);
  assert.equal(result.durationHours, 6_000 / 900);
  assert.ok(result.estimatedRevenuePerFlight > 0);
  assert.ok(result.estimatedTotalCostPerFlight > 0);
  assert.ok(Number.isFinite(result.estimatedOperatingMargin));
  assert.equal(result.estimatedCostPerKm, result.estimatedTotalCostPerFlight / 6_000);
});

test("marks an otherwise valid aircraft outside route range as ineligible", () => {
  const result = calculateRouteEconomics({ ...baseInput, distanceKm: 6_000, aircraftRangeKm: 5_999 });

  assert.equal(result.validInput, true);
  assert.equal(result.rangeCompatible, false);
  assert.equal(result.routeSuitability, "ineligible");
});

test("returns zero financials for a zero-distance route", () => {
  const result = calculateRouteEconomics({ ...baseInput, distanceKm: 0 });

  assert.equal(result.validInput, false);
  assert.equal(result.estimatedRevenuePerFlight, 0);
  assert.equal(result.estimatedTotalCostPerFlight, 0);
  assert.equal(result.estimatedOperatingProfitPerFlight, 0);
  assert.equal(result.estimatedOperatingMargin, 0);
});

test("handles zero seats without NaN cost-per-seat or break-even values", () => {
  const result = calculateRouteEconomics({
    ...baseInput,
    cabinLayout: { first: 0, business: 0, premiumEconomy: 0, economy: 0, cargoTons: 0 },
    demand: { first: 100, business: 100, premiumEconomy: 100, economy: 100, cargoTons: 0 }
  });

  assert.equal(result.passengerCapacity, 0);
  assert.equal(result.passengerCount, 0);
  assert.equal(result.capacityUtilization, 0);
  assert.equal(result.estimatedCostPerSeatKm, undefined);
  assert.equal(result.estimatedBreakEvenLoadFactor, undefined);
  assert.equal(result.breakEvenAchievable, false);
  assert.ok(Number.isFinite(result.estimatedOperatingProfitPerFlight));
});

test("bounds low, full, and invalid load factors", () => {
  const low = calculateRouteEconomics({ ...baseInput, loadFactor: 0.1 });
  const full = calculateRouteEconomics({ ...baseInput, loadFactor: 1 });
  const tooHigh = calculateRouteEconomics({ ...baseInput, loadFactor: 8 });
  const invalid = calculateRouteEconomics({ ...baseInput, loadFactor: Number.NaN });

  assert.equal(low.loadFactor, 0.1);
  assert.equal(full.loadFactor, 1);
  assert.equal(tooHigh.loadFactor, 1);
  assert.equal(invalid.loadFactor, 0);
  assert.ok(low.passengerCount < full.passengerCount);
  assert.equal(tooHigh.passengerCount, full.passengerCount);
  assert.equal(invalid.passengerCount, 0);
});

test("excess market demand cannot erase passenger and cargo load factors", () => {
  const result = calculateRouteEconomics({
    ...baseInput, demand: { first: 10_000, business: 10_000, premiumEconomy: 10_000, economy: 10_000, cargoTons: 10_000 }
  });
  assert.equal(result.passengerCount, 50);
  assert.equal(result.capacityUtilization, 0.5);
  assert.equal(result.cargoTons, 5);
  assert.equal(result.estimatedRevenuePerFlight, 9_500);
  const lowDemand = calculateRouteEconomics({ ...baseInput, demand: { first: 0, business: 0, premiumEconomy: 0, economy: 10, cargoTons: 2 } });
  assert.equal(lowDemand.passengerCount, 5);
  assert.equal(lowDemand.cargoTons, 1);
});

test("Easy reduces income while Simulation preserves its bonus and Realistic stays unboosted", () => {
  const route = economicsFixture().routes[0];
  const model = aircraftById["a350-900"];
  for (const distanceKm of [1000, 5500]) {
    const candidate = { ...route, distanceKm };
    const easy = estimateFlightFinancials(candidate, model, model.suggestedLayout, 42, getDifficultyConfig("easy"));
    const realistic = estimateFlightFinancials(candidate, model, model.suggestedLayout, 42, getDifficultyConfig("realistic"));
    const simulation = estimateFlightFinancials(candidate, model, model.suggestedLayout, 42, getDifficultyConfig("simulation"));
    const easyBonus = 1.5;
    const sandboxBonus = distanceKm >= 5500 ? 3.15 * 1.2 * 5 : 3.15 * 5;
    assert.ok(Math.abs(easy.economics.estimatedRevenuePerFlight / realistic.economics.estimatedRevenuePerFlight - easyBonus) < 1e-10);
    assert.ok(Math.abs(simulation.economics.estimatedRevenuePerFlight / realistic.economics.estimatedRevenuePerFlight - sandboxBonus) < 1e-10);
    assert.equal(easy.cost, realistic.cost);
    assert.equal(easy.profit, easy.revenue - easy.cost);
    assert.equal(easy.passengerCount, realistic.passengerCount);
    assert.ok(easy.profit < simulation.profit);
  }
});

test("previews, weekly estimates and actual settlements share economics and do not force profit", () => {
  const game = economicsFixture();
  const model = aircraftById["a350-900"];
  const route = game.routes[0];
  const preview = estimateExpectedFlightProfit(route, model, model.suggestedLayout, game.difficultyConfig);
  const weekly = estimateScheduleFinancials({ route, model, aircraft: model.suggestedLayout, daysOfWeek: [1, 3, 5], isRoundTrip: true, difficultyConfig: game.difficultyConfig });
  assert.equal(weekly.weeklyRevenue, preview.revenue * 6);
  assert.equal(weekly.weeklyCost, preview.cost * 6);
  assert.equal(weekly.weeklyProfit, preview.profit * 6);
  const aircraft = game.fleet[0];
  const flight = aircraft.schedule[0];
  const settled = advanceAircraftOperations(aircraft, game.routes, flight.readyGameTime, game.difficultyConfig);
  assert.equal(settled.entries.length, 1);
  const actual = settled.aircraft.schedule[0];
  const financials = estimateFlightFinancials(route, model, aircraft, actual.departureGameTime + actual.arrivalGameTime, game.difficultyConfig,
    { departureGameTimeMs: actual.departureGameTime, originAirportId: actual.originAirportId });
  assert.equal(settled.entries[0].revenue, financials.revenue);
  assert.equal(settled.entries[0].cost, financials.cost);
  assert.equal(settled.entries[0].profit, financials.profit);
  const noRevenue = estimateFlightFinancials({ ...route, pricing: { first: 0, business: 0, premiumEconomy: 0, economy: 0, cargo: 0 } }, model,
    model.suggestedLayout, 42, game.difficultyConfig);
  assert.ok(noRevenue.profit < 0);
  assert.equal(calculatePriceAdjustedDemand(10_000, 100, 1_000_000, "economy"), 0);
});

function economicsFixture() {
  const now = Date.UTC(2026, 0, 1, 12);
  return restoreGameStateFromCloudSave({
    saveFormatVersion: 2, airlineName: "Economics Airways", difficulty: "easy", baseAirportId: "lhr",
    money: 1_000_000, baseGameTimeMs: now, currentGameTimeMs: now,
    routes: [{ id: "lhr-jfk", originAirportId: "lhr", destinationAirportId: "jfk", isOpen: true }],
    fleet: [{
      id: "plane", modelId: "a350-900", registration: "G-TEST", currentAirportId: "lhr",
      cabinLayout: aircraftById["a350-900"].suggestedLayout, weeklySchedules: [],
      schedule: [{
        id: "leg", aircraftId: "plane", routeId: "lhr-jfk", flightNumber: "EA2",
        originAirportId: "lhr", destinationAirportId: "jfk", status: "in-flight",
        departureGameTime: now, arrivalGameTime: now + 8 * 3_600_000, readyGameTime: now + 10 * 3_600_000,
        baseDelayMinutes: 0, technicalChecked: true
      }]
    }]
  });
}

test("counts one-way and round-trip frequency exactly once", () => {
  assert.deepEqual(calculateScheduleFrequency([1], false), {
    servicesPerWeek: 1,
    legsPerService: 1,
    flightsPerWeek: 1
  });
  assert.deepEqual(calculateScheduleFrequency([1, 3, 5], true), {
    servicesPerWeek: 3,
    legsPerService: 2,
    flightsPerWeek: 6
  });
  assert.deepEqual(calculateScheduleFrequency([1, 1, 3, -1, 7, "Friday"], true), {
    servicesPerWeek: 2,
    legsPerService: 2,
    flightsPerWeek: 4
  });
});

test("scales per-flight economics once for multiple round-trip services", () => {
  const perFlight = calculateRouteEconomics(baseInput);
  const weekly = calculateWeeklyEconomics(perFlight, [1, 3, 5], true);

  assert.equal(weekly.flightsPerWeek, 6);
  assert.equal(weekly.weeklyRevenue, perFlight.estimatedRevenuePerFlight * 6);
  assert.equal(weekly.weeklyCost, perFlight.estimatedTotalCostPerFlight * 6);
  assert.equal(weekly.weeklyProfit, perFlight.estimatedOperatingProfitPerFlight * 6);
  assert.equal(weekly.weeklyPassengerCount, perFlight.passengerCount * 6);
});

test("sanitizes zero-distance, NaN, Infinity, and negative inputs", () => {
  const result = calculateRouteEconomics({
    ...baseInput,
    distanceKm: 0,
    aircraftRangeKm: Number.POSITIVE_INFINITY,
    cruiseSpeedKmh: Number.NaN,
    fuelCostPerKm: -100,
    cabinLayout: { first: -1, business: Number.NaN, premiumEconomy: 0, economy: 0, cargoTons: Number.POSITIVE_INFINITY },
    demand: { first: -1, business: 10, premiumEconomy: Number.NaN, economy: Number.POSITIVE_INFINITY, cargoTons: -5 },
    pricing: { first: -1, business: Number.NaN, premiumEconomy: 0, economy: Number.POSITIVE_INFINITY, cargo: -2 },
    loadFactor: Number.POSITIVE_INFINITY,
    cargoLoadFactor: -1,
    revenueMultiplier: Number.NaN
  });

  assert.equal(result.validInput, false);
  assert.equal(result.rangeCompatible, false);
  assert.equal(result.routeSuitability, "ineligible");
  assert.equal(result.estimatedTotalCostPerFlight, 0);
  assertFiniteAndNonNegative(result.estimatedRevenuePerFlight);
  assertFiniteAndNonNegative(result.estimatedTotalCostPerFlight);
  assertFiniteAndNonNegative(result.estimatedFuelCostPerFlight);
  assertFiniteAndNonNegative(result.estimatedCrewCostPerFlight);
  assertFiniteAndNonNegative(result.estimatedAirportCostPerFlight);
  assertFiniteAndNonNegative(result.estimatedMaintenanceReservePerFlight);
  assertFiniteAndNonNegative(result.capacityUtilization);
});

test("operating-cost helper preserves the documented category sum", () => {
  const costs = calculateOperatingCosts({ distanceKm: 1_000, cruiseSpeedKmh: 500, fuelCostPerKm: 100, cargoTons: 5 });
  assert.equal(costs.totalOperatingCost, costs.fuelCost + costs.crewCost + costs.airportCost + costs.maintenanceReserve);
});

function sumOperatingCosts(result: ReturnType<typeof calculateRouteEconomics>) {
  return (
    result.estimatedFuelCostPerFlight +
    result.estimatedCrewCostPerFlight +
    result.estimatedAirportCostPerFlight +
    result.estimatedMaintenanceReservePerFlight
  );
}

function assertFiniteAndNonNegative(value: number) {
  assert.equal(Number.isFinite(value), true);
  assert.ok(value >= 0);
}
