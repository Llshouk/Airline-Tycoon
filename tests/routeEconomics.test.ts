import assert from "node:assert/strict";
import test from "node:test";
import { calculateOperatingCosts } from "../src/lib/economics/operatingCosts";
import { calculateRouteEconomics, calculateScheduleFrequency, calculateWeeklyEconomics } from "../src/lib/economics/routeEconomics";
import type { RouteEconomicsInput } from "../src/lib/economics/economicsTypes";

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
  assert.equal(result.estimatedFuelCostPerFlight, 3_000);
  assert.equal(result.estimatedCrewCostPerFlight, 180);
  assert.equal(result.estimatedAirportCostPerFlight, 455.25);
  assert.equal(result.estimatedMaintenanceReservePerFlight, 600);
  assert.equal(result.estimatedTotalCostPerFlight, 4_235.25);
  assert.equal(result.estimatedTotalCostPerFlight, sumOperatingCosts(result));
  assert.equal(result.estimatedOperatingProfitPerFlight, 5_264.75);
  assert.equal(result.estimatedOperatingMargin, 5_264.75 / 9_500);
  assert.equal(result.estimatedBreakEvenLoadFactor, 3_235.25 / 17_000);
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
