import { COST_BALANCE_MULTIPLIER } from "@/config/gameBalance";
import type { OperatingCostBreakdown } from "@/lib/economics/economicsTypes";

// These retain the existing V1 gameplay balance. Aircraft fuelCostPerKm is a
// gameplay coefficient, not a claim about real-world litres or kilograms.
export const OPERATING_COST_ASSUMPTIONS = {
  airportBaseCost: 10_000,
  airportCostPerKm: 5,
  crewCostPerFlightHour: 3_000,
  maintenanceReservePerKm: 20,
  cargoHandlingCostPerTon: 35,
  balanceMultiplier: COST_BALANCE_MULTIPLIER
} as const;

export function calculateOperatingCosts(input: {
  distanceKm: number;
  cruiseSpeedKmh: number;
  fuelCostPerKm: number;
  cargoTons: number;
}): OperatingCostBreakdown & { durationHours: number } {
  const distanceKm = finiteNonNegative(input.distanceKm);
  const cruiseSpeedKmh = finiteNonNegative(input.cruiseSpeedKmh);
  const fuelCostPerKm = finiteNonNegative(input.fuelCostPerKm);
  const cargoTons = finiteNonNegative(input.cargoTons);
  if (distanceKm === 0 || cruiseSpeedKmh === 0) {
    return {
      durationHours: 0,
      fuelCost: 0,
      crewCost: 0,
      airportCost: 0,
      maintenanceReserve: 0,
      totalOperatingCost: 0
    };
  }
  const durationHours = cruiseSpeedKmh > 0 ? distanceKm / cruiseSpeedKmh : 0;
  const multiplier = OPERATING_COST_ASSUMPTIONS.balanceMultiplier;
  const fuelCost = distanceKm * fuelCostPerKm * multiplier;
  const crewCost = durationHours * OPERATING_COST_ASSUMPTIONS.crewCostPerFlightHour * multiplier;
  const airportCost =
    (OPERATING_COST_ASSUMPTIONS.airportBaseCost +
      distanceKm * OPERATING_COST_ASSUMPTIONS.airportCostPerKm +
      cargoTons * OPERATING_COST_ASSUMPTIONS.cargoHandlingCostPerTon) *
    multiplier;
  const maintenanceReserve = distanceKm * OPERATING_COST_ASSUMPTIONS.maintenanceReservePerKm * multiplier;
  const totalOperatingCost = fuelCost + crewCost + airportCost + maintenanceReserve;

  return {
    durationHours,
    fuelCost,
    crewCost,
    airportCost,
    maintenanceReserve,
    totalOperatingCost
  };
}

export function finiteNonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function boundedRatio(value: number) {
  return Math.min(1, finiteNonNegative(value));
}
