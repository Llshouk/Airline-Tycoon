import { ROUTE_MARKET, hourlyPassengerPreference } from "@/config/routeMarket";
import { airportsById } from "@/data/airports";
import { airportLocalMinutes } from "@/lib/airportOperations";
import type { CabinDemand, CabinPrices, Route, RoutePricing } from "@/types/game";

export const DEMAND_KEYS = ["first", "business", "premiumEconomy", "economy", "cargoTons"] as const;
export function emptyDemand(): CabinDemand { return { first: 0, business: 0, premiumEconomy: 0, economy: 0, cargoTons: 0 }; }

export function priceDemandMultiplier(reference: number, actual: number, cabin: keyof RoutePricing, distanceKm = 2000) {
  if (!Number.isFinite(reference) || reference <= 0 || !Number.isFinite(actual) || actual < 0) return 0;
  const ratio = actual / reference;
  const maximum = cabin === "cargo" ? ROUTE_MARKET.maxCargoDiscountBoost : ROUTE_MARKET.maxPassengerDiscountBoost;
  const distanceElasticity = cabin === "cargo" ? 1 : 0.85 + 0.35 * Math.exp(-Math.max(0, distanceKm) / 2500);
  return maximum / (1 + (maximum - 1) * Math.pow(ratio, ROUTE_MARKET.elasticity[cabin] * distanceElasticity)) *
    Math.exp(-Math.max(0, ratio - 2) * 0.7);
}

const localDates = new Map<string, Intl.DateTimeFormat>();
export function marketWindow(route: Route, originId: string, departure: number) {
  const zone = airportsById[originId]?.timeZone ?? "UTC";
  if (!localDates.has(zone)) localDates.set(zone, new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }));
  const minute = airportLocalMinutes(originId, departure);
  const slot = Math.floor(minute / (ROUTE_MARKET.windowHours * 60));
  const pair = [route.originAirportId, route.destinationAirportId].sort().join(":");
  return { key: `${pair}:${originId}:${localDates.get(zone)!.format(departure)}:${slot}`, slot,
    endsGameTimeMs: departure + ((slot + 1) * ROUTE_MARKET.windowHours * 60 - minute + 60) * 60000 };
}

export function referenceWindowDemand(route: Route, originId = route.originAirportId, departure?: number): CabinDemand {
  const slot = departure === undefined ? 3 : marketWindow(route, originId, departure).slot;
  const weights = Array.from({ length: 24 }, (_, hour) => hourlyPassengerPreference(route.distanceKm, hour));
  const share = weights.slice(slot * 4, slot * 4 + 4).reduce((sum, weight) => sum + weight, 0) /
    weights.reduce((sum, weight) => sum + weight, 0);
  const result = emptyDemand();
  for (const key of DEMAND_KEYS) {
    const weekly = Number.isFinite(route.estimatedDemand[key]) ? Math.max(0, route.estimatedDemand[key]) : 0;
    // estimatedDemand is a combined, two-direction weekly market. Cargo has no red-eye penalty.
    result[key] = weekly / 14 * (key === "cargoTons" ? 1 / 6 : share);
  }
  return result;
}

export function demandAtPrice(route: Route, demand: CabinDemand, fareMultipliers?: CabinPrices): CabinDemand {
  const reference = route.recommendedPricing ?? { ...route.estimatedTicketPrices, cargo: route.estimatedCargoRatePerTon };
  const actual = route.pricing ?? reference;
  const result = emptyDemand();
  for (const key of DEMAND_KEYS) {
    const cabin = key === "cargoTons" ? "cargo" : key;
    const referenceFare = reference[cabin] * (key === "cargoTons" ? 1 : fareMultipliers?.[key] ?? 1);
    const value = demand[key] * priceDemandMultiplier(referenceFare, actual[cabin], cabin, route.distanceKm);
    result[key] = key === "cargoTons" ? Math.floor(value * 10) / 10 : Math.floor(value);
  }
  return result;
}
