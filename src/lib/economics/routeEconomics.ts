import type {
  RouteEconomicsInput,
  RouteEconomicsResult,
  RouteSuitability,
  ScheduleFrequency,
  WeeklyEconomicsResult
} from "@/lib/economics/economicsTypes";
import { boundedRatio, calculateOperatingCosts, finiteNonNegative } from "@/lib/economics/operatingCosts";
import type { CabinDemand, CabinLayout, RoutePricing } from "@/types/game";

export function calculateRouteEconomics(input: RouteEconomicsInput): RouteEconomicsResult {
  const validInput = hasValidCoreInput(input);
  const distanceKm = finiteNonNegative(input.distanceKm);
  const aircraftRangeKm = finiteNonNegative(input.aircraftRangeKm);
  const loadFactor = boundedRatio(input.loadFactor);
  const cargoLoadFactor = boundedRatio(input.cargoLoadFactor);
  const cabinLayout = normalizeCabinLayout(input.cabinLayout);
  const demand = normalizeDemand(input.demand);
  const pricing = normalizePricing(input.pricing);
  const revenueMultiplier = validInput ? finiteNonNegative(input.revenueMultiplier) : 0;
  const soldSeats = calculateSoldSeats(demand, cabinLayout, loadFactor);
  const passengerCapacity = passengerSeats(cabinLayout);
  const passengerCount = passengerSeats(soldSeats);
  const rawCargoTons = Math.min(cabinLayout.cargoTons, demand.cargoTons * cargoLoadFactor);
  const costs = calculateOperatingCosts(
    validInput
      ? {
          distanceKm,
          cruiseSpeedKmh: input.cruiseSpeedKmh,
          fuelCostPerKm: input.fuelCostPerKm,
          cargoTons: rawCargoTons
        }
      : { distanceKm: 0, cruiseSpeedKmh: 0, fuelCostPerKm: 0, cargoTons: 0 }
  );
  const first = soldSeats.first * pricing.first * revenueMultiplier;
  const business = soldSeats.business * pricing.business * revenueMultiplier;
  const premiumEconomy = soldSeats.premiumEconomy * pricing.premiumEconomy * revenueMultiplier;
  const economy = soldSeats.economy * pricing.economy * revenueMultiplier;
  const passengerRevenue = first + business + premiumEconomy + economy;
  const cargoRevenue = rawCargoTons * pricing.cargo * revenueMultiplier;
  const totalRevenue = passengerRevenue + cargoRevenue;
  const operatingProfit = totalRevenue - costs.totalOperatingCost;
  const operatingMargin = totalRevenue > 0 ? operatingProfit / totalRevenue : 0;
  const fullPassengerRevenue = fullCabinPassengerRevenue(cabinLayout, pricing) * revenueMultiplier;
  const rawBreakEvenLoadFactor =
    fullPassengerRevenue > 0 ? Math.max(0, costs.totalOperatingCost - cargoRevenue) / fullPassengerRevenue : undefined;
  const estimatedBreakEvenLoadFactor =
    rawBreakEvenLoadFactor === undefined ? undefined : boundedRatio(rawBreakEvenLoadFactor);
  const rangeCompatible = validInput && distanceKm <= aircraftRangeKm;
  const capacityUtilization = passengerCapacity > 0 ? boundedRatio(passengerCount / passengerCapacity) : 0;
  const estimatedCostPerKm = distanceKm > 0 ? costs.totalOperatingCost / distanceKm : 0;
  const estimatedCostPerSeatKm = passengerCapacity > 0 && distanceKm > 0
    ? costs.totalOperatingCost / (passengerCapacity * distanceKm)
    : undefined;
  const routeSuitability = classifyRouteSuitability({
    validInput,
    rangeCompatible,
    operatingProfit,
    operatingMargin
  });

  return {
    validInput,
    rangeCompatible,
    distanceKm,
    durationHours: costs.durationHours,
    loadFactor,
    cargoLoadFactor,
    passengerCapacity,
    passengerCount,
    soldSeats,
    cargoTons: roundOneDecimal(rawCargoTons),
    capacityUtilization,
    revenue: {
      first,
      business,
      premiumEconomy,
      economy,
      passengerRevenue,
      cargoRevenue,
      totalRevenue
    },
    operatingCosts: costs,
    estimatedRevenuePerFlight: totalRevenue,
    estimatedFuelCostPerFlight: costs.fuelCost,
    estimatedCrewCostPerFlight: costs.crewCost,
    estimatedAirportCostPerFlight: costs.airportCost,
    estimatedMaintenanceReservePerFlight: costs.maintenanceReserve,
    estimatedTotalCostPerFlight: costs.totalOperatingCost,
    estimatedOperatingProfitPerFlight: operatingProfit,
    estimatedOperatingMargin: operatingMargin,
    estimatedBreakEvenLoadFactor,
    breakEvenAchievable: rawBreakEvenLoadFactor !== undefined && rawBreakEvenLoadFactor <= 1,
    estimatedCostPerKm,
    estimatedCostPerSeatKm,
    routeSuitability
  };
}

export function calculateScheduleFrequency(daysOfWeek: unknown[], isRoundTrip: boolean): ScheduleFrequency {
  const validDays = new Set(
    daysOfWeek.filter((day): day is number => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6)
  );
  const servicesPerWeek = validDays.size;
  const legsPerService = isRoundTrip ? 2 : 1;
  return {
    servicesPerWeek,
    legsPerService,
    flightsPerWeek: servicesPerWeek * legsPerService
  };
}

export function calculateWeeklyEconomics(
  perFlight: Pick<
    RouteEconomicsResult,
    "estimatedRevenuePerFlight" | "estimatedTotalCostPerFlight" | "estimatedOperatingProfitPerFlight" | "passengerCount" | "cargoTons"
  >,
  daysOfWeek: unknown[],
  isRoundTrip: boolean
): WeeklyEconomicsResult {
  const frequency = calculateScheduleFrequency(daysOfWeek, isRoundTrip);
  const multiplier = frequency.flightsPerWeek;
  return {
    ...frequency,
    weeklyRevenue: perFlight.estimatedRevenuePerFlight * multiplier,
    weeklyCost: perFlight.estimatedTotalCostPerFlight * multiplier,
    weeklyProfit: perFlight.estimatedOperatingProfitPerFlight * multiplier,
    weeklyPassengerCount: perFlight.passengerCount * multiplier,
    weeklyCargoTons: roundOneDecimal(perFlight.cargoTons * multiplier)
  };
}

function hasValidCoreInput(input: RouteEconomicsInput) {
  return (
    Number.isFinite(input.distanceKm) &&
    input.distanceKm > 0 &&
    Number.isFinite(input.aircraftRangeKm) &&
    input.aircraftRangeKm >= 0 &&
    Number.isFinite(input.cruiseSpeedKmh) &&
    input.cruiseSpeedKmh > 0 &&
    Number.isFinite(input.fuelCostPerKm) &&
    input.fuelCostPerKm >= 0
  );
}

function normalizeCabinLayout(layout: CabinLayout): CabinLayout {
  return {
    first: finiteNonNegative(layout.first),
    business: finiteNonNegative(layout.business),
    premiumEconomy: finiteNonNegative(layout.premiumEconomy),
    economy: finiteNonNegative(layout.economy),
    cargoTons: finiteNonNegative(layout.cargoTons)
  };
}

function normalizeDemand(demand: CabinDemand): CabinDemand {
  return {
    first: finiteNonNegative(demand.first),
    business: finiteNonNegative(demand.business),
    premiumEconomy: finiteNonNegative(demand.premiumEconomy),
    economy: finiteNonNegative(demand.economy),
    cargoTons: finiteNonNegative(demand.cargoTons)
  };
}

function normalizePricing(pricing: RoutePricing): RoutePricing {
  return {
    first: finiteNonNegative(pricing.first),
    business: finiteNonNegative(pricing.business),
    premiumEconomy: finiteNonNegative(pricing.premiumEconomy),
    economy: finiteNonNegative(pricing.economy),
    cargo: finiteNonNegative(pricing.cargo)
  };
}

function calculateSoldSeats(demand: CabinDemand, layout: CabinLayout, loadFactor: number): CabinDemand {
  return {
    first: Math.min(layout.first, Math.round(demand.first * loadFactor)),
    business: Math.min(layout.business, Math.round(demand.business * loadFactor)),
    premiumEconomy: Math.min(layout.premiumEconomy, Math.round(demand.premiumEconomy * loadFactor)),
    economy: Math.min(layout.economy, Math.round(demand.economy * loadFactor)),
    cargoTons: 0
  };
}

function passengerSeats(layout: CabinLayout | CabinDemand) {
  return layout.first + layout.business + layout.premiumEconomy + layout.economy;
}

function fullCabinPassengerRevenue(layout: CabinLayout, pricing: RoutePricing) {
  return (
    layout.first * pricing.first +
    layout.business * pricing.business +
    layout.premiumEconomy * pricing.premiumEconomy +
    layout.economy * pricing.economy
  );
}

function classifyRouteSuitability(input: {
  validInput: boolean;
  rangeCompatible: boolean;
  operatingProfit: number;
  operatingMargin: number;
}): RouteSuitability {
  if (!input.validInput || !input.rangeCompatible) return "ineligible";
  if (input.operatingProfit < 0) return "loss-making";
  if (input.operatingMargin < 0.15) return "marginal";
  return "strong";
}

function roundOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}
