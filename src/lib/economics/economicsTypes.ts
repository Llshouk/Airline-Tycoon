import type { CabinDemand, CabinLayout, RoutePricing } from "@/types/game";

export type RouteSuitability = "ineligible" | "loss-making" | "marginal" | "strong";

export type OperatingCostBreakdown = {
  fuelCost: number;
  crewCost: number;
  airportCost: number;
  maintenanceReserve: number;
  totalOperatingCost: number;
};

export type RevenueBreakdown = {
  first: number;
  business: number;
  premiumEconomy: number;
  economy: number;
  passengerRevenue: number;
  cargoRevenue: number;
  totalRevenue: number;
};

export type RouteEconomicsInput = {
  // Distances use kilometres and speed uses kilometres per hour.
  distanceKm: number;
  aircraftRangeKm: number;
  cruiseSpeedKmh: number;
  // Existing aircraft data stores this gameplay fuel-cost coefficient per kilometre.
  fuelCostPerKm: number;
  cabinLayout: CabinLayout;
  demand: CabinDemand;
  pricing: RoutePricing;
  // Load factors and utilization are ratios from 0 to 1.
  loadFactor: number;
  cargoLoadFactor: number;
  revenueMultiplier: number;
};

export type RouteEconomicsResult = {
  validInput: boolean;
  rangeCompatible: boolean;
  distanceKm: number;
  durationHours: number;
  loadFactor: number;
  cargoLoadFactor: number;
  passengerCapacity: number;
  passengerCount: number;
  soldSeats: CabinDemand;
  cargoTons: number;
  capacityUtilization: number;
  revenue: RevenueBreakdown;
  operatingCosts: OperatingCostBreakdown;
  estimatedRevenuePerFlight: number;
  estimatedFuelCostPerFlight: number;
  estimatedCrewCostPerFlight: number;
  estimatedAirportCostPerFlight: number;
  estimatedMaintenanceReservePerFlight: number;
  estimatedTotalCostPerFlight: number;
  estimatedOperatingProfitPerFlight: number;
  estimatedOperatingMargin: number;
  estimatedBreakEvenLoadFactor?: number;
  breakEvenAchievable: boolean;
  estimatedCostPerKm: number;
  estimatedCostPerSeatKm?: number;
  routeSuitability: RouteSuitability;
};

export type ScheduleFrequency = {
  servicesPerWeek: number;
  legsPerService: 1 | 2;
  flightsPerWeek: number;
};

export type WeeklyEconomicsResult = ScheduleFrequency & {
  weeklyRevenue: number;
  weeklyCost: number;
  weeklyProfit: number;
  weeklyPassengerCount: number;
  weeklyCargoTons: number;
};

export type AircraftEconomicsResult = {
  rangeCompatible: boolean;
  routeSuitability: RouteSuitability;
  estimatedFuelCostPerFlight: number;
  estimatedOperatingCostPerFlight: number;
  estimatedCostPerKm: number;
  estimatedCostPerSeatKm?: number;
  capacityUtilization: number;
  estimatedBreakEvenLoadFactor?: number;
  estimatedOperatingProfitPerFlight: number;
  estimatedOperatingMargin: number;
};
