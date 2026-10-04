import { AIRPORT_MOVEMENT_COST, CARGO_HANDLING_COST_PER_TON, OPERATING_COST_PROFILES } from "@/config/operatingCosts";
import type { OperatingCostBreakdown } from "@/lib/economics/economicsTypes";
import type { AirportSizeTier, AircraftModel } from "@/types/game";

// These retain the existing V1 gameplay balance. Aircraft fuelCostPerKm is a
// gameplay coefficient, not a claim about real-world litres or kilograms.
export function calculateOperatingCosts(input: {
  distanceKm: number;
  cruiseSpeedKmh: number;
  fuelCostPerKm: number;
  cargoTons: number;
  aircraftType?: AircraftModel["type"];
  originAirportTier?: AirportSizeTier;
  destinationAirportTier?: AirportSizeTier;
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
  const profile = OPERATING_COST_PROFILES[input.aircraftType ?? "narrowbody"];
  const cruiseFuelPerHour = fuelCostPerKm * cruiseSpeedKmh * profile.cruiseFuelScale;
  const fuelCost = cruiseFuelPerHour * durationHours + fuelCostPerKm * profile.departureFuelScale;
  const crewCost = Math.max(profile.minimumCrewHours, durationHours) * profile.crewPerHour;
  const airportCost = ((AIRPORT_MOVEMENT_COST[input.originAirportTier ?? "large"] ?? AIRPORT_MOVEMENT_COST.large) +
    (AIRPORT_MOVEMENT_COST[input.destinationAirportTier ?? "large"] ?? AIRPORT_MOVEMENT_COST.large)) * profile.airportFactor +
    cargoTons * CARGO_HANDLING_COST_PER_TON;
  const maintenanceReserve = durationHours * profile.maintenancePerHour + profile.maintenancePerCycle;
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
