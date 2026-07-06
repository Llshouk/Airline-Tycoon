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
  const longHaulDemandBonus = band === "long-haul" ? GAME_BALANCE.longHaulDemandBonus : 1;

  // TODO: Replace this seed-score model with imported static traffic data when the airport dataset grows.
  // Demand is stored as a 7-day weekly market and intentionally scaled up for V1 gameplay,
  // so one aircraft cannot usually satisfy an entire route by itself.
  const weeklyBase =
    averageDemandScore *
    tierBlend *
    hubBonus *
    distanceMultiplier *
    longHaulDemandBonus *
    2.2 *
    DAYS_PER_WEEK *
    GAME_BALANCE.passengerDemandMultiplier *
    GAME_BALANCE.routeDemandScale;
  const premiumBias = hubBonus * (band === "long-haul" ? 1.45 : band === "medium-haul" ? 1.14 : 0.76) * GAME_BALANCE.premiumDemandMultiplier;
  const cargoBias = (band === "long-haul" ? 1.18 : 1) * GAME_BALANCE.cargoDemandMultiplier;

  return calculateCabinDemandByDistance({
    routeDistanceKm: distanceKm,
    originAirport: origin,
    destinationAirport: destination,
    baseDemand: {
      first: Math.round(weeklyBase * (band === "long-haul" ? 0.045 : 0.01) * premiumBias),
      business: Math.round(weeklyBase * (band === "short-haul" ? 0.09 : 0.16) * premiumBias),
      premiumEconomy: Math.round(weeklyBase * (band === "short-haul" ? 0.08 : 0.2) * GAME_BALANCE.premiumDemandMultiplier),
      economy: Math.round(weeklyBase * (band === "short-haul" ? 0.95 : 0.82)),
      cargoTons: Math.round(weeklyBase * (band === "short-haul" ? 0.035 : band === "medium-haul" ? 0.075 : 0.12) * cargoBias * 10) / 10
    }
  });
}

export function calculateCabinDemandByDistance({
  routeDistanceKm,
  originAirport,
  destinationAirport,
  baseDemand
}: {
  routeDistanceKm: number;
  originAirport: Airport;
  destinationAirport: Airport;
  baseDemand: CabinDemand;
}): CabinDemand {
  const premiumMarket = (originAirport.baseDemandScore + destinationAirport.baseDemandScore) / 2;
  const hubPair = originAirport.sizeTier === "mega" && destinationAirport.sizeTier === "mega";
  const longHaulPremium = hubPair || premiumMarket >= 86;

  if (routeDistanceKm < 800) {
    return roundCabinDemand({
      first: 0,
      business: baseDemand.business * (hubPair ? 0.32 : 0.2),
      premiumEconomy: baseDemand.premiumEconomy * 0.08,
      economy: baseDemand.economy * 1.08,
      cargoTons: baseDemand.cargoTons * 0.45
    });
  }

  if (routeDistanceKm < 2500) {
    return roundCabinDemand({
      first: hubPair && premiumMarket >= 92 ? Math.min(4, baseDemand.first * 0.08) : 0,
      business: baseDemand.business * (hubPair ? 0.72 : 0.52),
      premiumEconomy: baseDemand.premiumEconomy * 0.38,
      economy: baseDemand.economy,
      cargoTons: baseDemand.cargoTons * 0.7
    });
  }

  if (routeDistanceKm < 5500) {
    return roundCabinDemand({
      first: longHaulPremium ? baseDemand.first * 0.65 : Math.min(6, baseDemand.first * 0.2),
      business: baseDemand.business * (longHaulPremium ? 1 : 0.78),
      premiumEconomy: baseDemand.premiumEconomy * 0.82,
      economy: baseDemand.economy * 0.96,
      cargoTons: baseDemand.cargoTons
    });
  }

  return roundCabinDemand({
    first: baseDemand.first * (longHaulPremium ? 1.05 : 0.7),
    business: baseDemand.business * (longHaulPremium ? 1.08 : 0.92),
    premiumEconomy: baseDemand.premiumEconomy * 1.05,
    economy: baseDemand.economy * 0.94,
    cargoTons: baseDemand.cargoTons * (hubPair ? 1.12 : 1)
  });
}

function roundCabinDemand(demand: CabinDemand): CabinDemand {
  return {
    first: Math.max(0, Math.round(demand.first)),
    business: Math.max(0, Math.round(demand.business)),
    premiumEconomy: Math.max(0, Math.round(demand.premiumEconomy)),
    economy: Math.max(0, Math.round(demand.economy)),
    cargoTons: Math.max(0, Math.round(demand.cargoTons * 10) / 10)
  };
}
