import type { AircraftEconomicsResult, RouteEconomicsResult } from "@/lib/economics/economicsTypes";

export function summarizeAircraftEconomics(routeEconomics: RouteEconomicsResult): AircraftEconomicsResult {
  return {
    rangeCompatible: routeEconomics.rangeCompatible,
    routeSuitability: routeEconomics.routeSuitability,
    estimatedFuelCostPerFlight: routeEconomics.estimatedFuelCostPerFlight,
    estimatedOperatingCostPerFlight: routeEconomics.estimatedTotalCostPerFlight,
    estimatedCostPerKm: routeEconomics.estimatedCostPerKm,
    estimatedCostPerSeatKm: routeEconomics.estimatedCostPerSeatKm,
    capacityUtilization: routeEconomics.capacityUtilization,
    estimatedBreakEvenLoadFactor: routeEconomics.estimatedBreakEvenLoadFactor,
    estimatedOperatingProfitPerFlight: routeEconomics.estimatedOperatingProfitPerFlight,
    estimatedOperatingMargin: routeEconomics.estimatedOperatingMargin
  };
}
