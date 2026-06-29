import { GAME_BALANCE } from "@/config/gameBalance";
import type { Airport, CabinDemand, RouteBand } from "@/types/game";

const tierMultiplier = {
  regional: 0.75,
  large: 1,
  mega: 1.32
};
const DAYS_PER_WEEK = 7;

export function getRouteBand(distanceKm: number): RouteBand {
  if (distanceKm < 1500) return "short-haul";
  if (distanceKm < 5500) return "medium-haul";
  return "long-haul";
}

export function estimateDemand(origin: Airport, destination: Airport, distanceKm: number): CabinDemand {
  const band = getRouteBand(distanceKm);
  const hubBonus = origin.sizeTier === "mega" && destination.sizeTier === "mega" ? GAME_BALANCE.majorHubDemandBonus : 1;
  const averageDemandScore = (origin.baseDemandScore + destination.baseDemandScore) / 2;
  const tierBlend = (tierMultiplier[origin.sizeTier] + tierMultiplier[destination.sizeTier]) / 2;
  const distanceMultiplier = band === "short-haul" ? 1.22 : band === "medium-haul" ? 1.02 : 0.9;

  // TODO: Replace this seed-score model with imported static traffic data when the airport dataset grows.
  // Demand is stored and displayed as a 7-day weekly market so timetable capacity consumes it naturally.
  const weeklyBase = averageDemandScore * tierBlend * hubBonus * distanceMultiplier * 2.2 * DAYS_PER_WEEK * GAME_BALANCE.passengerDemandMultiplier;
  const premiumBias = hubBonus * (band === "long-haul" ? 1.45 : band === "medium-haul" ? 1.14 : 0.76) * GAME_BALANCE.premiumDemandMultiplier;
  const cargoBias = (band === "long-haul" ? 1.18 : 1) * GAME_BALANCE.cargoDemandMultiplier;

  return {
    first: Math.round(weeklyBase * (band === "long-haul" ? 0.045 : 0.01) * premiumBias),
    business: Math.round(weeklyBase * (band === "short-haul" ? 0.09 : 0.16) * premiumBias),
    premiumEconomy: Math.round(weeklyBase * (band === "short-haul" ? 0.08 : 0.2) * GAME_BALANCE.premiumDemandMultiplier),
    economy: Math.round(weeklyBase * (band === "short-haul" ? 0.95 : 0.82)),
    cargoTons: Math.round(weeklyBase * (band === "short-haul" ? 0.035 : band === "medium-haul" ? 0.075 : 0.12) * cargoBias * 10) / 10
  };
}
