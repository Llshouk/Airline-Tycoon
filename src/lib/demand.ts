import { GAME_BALANCE } from "@/config/gameBalance";
import { ROUTE_MARKET } from "@/config/routeMarket";
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
  const hubBonus = origin.sizeTier === "mega" && destination.sizeTier === "mega" ? GAME_BALANCE.majorHubDemandBonus : 1;
  const averageDemandScore = Math.sqrt(Math.max(0, origin.baseDemandScore) * Math.max(0, destination.baseDemandScore));
  const tierBlend = Math.sqrt(tierMultiplier[origin.sizeTier] * tierMultiplier[destination.sizeTier]);
  const distanceMultiplier = distanceDemandMultiplier(distanceKm);
  const medium = smooth(600, 2500, distanceKm);
  const long = smooth(4500, 6500, distanceKm);
  const longHaulDemandBonus = 1 + (GAME_BALANCE.longHaulDemandBonus - 1) * long;

  // TODO: Replace this seed-score model with imported static traffic data when the airport dataset grows.
  // Combined two-direction weekly market. Distance is applied exactly once here.
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
  const premiumBias = hubBonus * (0.76 + 0.38 * medium + 0.31 * long) * GAME_BALANCE.premiumDemandMultiplier;
  const cargoBias = (1 + 0.18 * long) * GAME_BALANCE.cargoDemandMultiplier;

  return calculateCabinDemandByDistance({
    routeDistanceKm: distanceKm,
    originAirport: origin,
    destinationAirport: destination,
    baseDemand: {
      first: weeklyBase * (0.01 + 0.035 * long) * premiumBias,
      business: weeklyBase * (0.09 + 0.07 * medium) * premiumBias,
      premiumEconomy: weeklyBase * (0.08 + 0.12 * medium) * GAME_BALANCE.premiumDemandMultiplier,
      economy: weeklyBase * (0.95 - 0.13 * medium),
      cargoTons: weeklyBase * (0.035 + 0.04 * medium + 0.045 * long) * cargoBias
    }
  });
}

export function distanceDemandMultiplier(distanceKm: number) {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  const surfaceCompetition = distanceKm / (distanceKm + ROUTE_MARKET.shortDistanceKm);
  const longJourneyPenalty = Math.exp(-Math.max(0, distanceKm - ROUTE_MARKET.longDistanceStartKm) / ROUTE_MARKET.longDistanceDecayKm);
  return surfaceCompetition * longJourneyPenalty;
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

  const short = smooth(600, 1000, routeDistanceKm);
  const medium = smooth(2200, 3000, routeDistanceKm);
  const long = smooth(4500, 6500, routeDistanceKm);
  return roundCabinDemand({
    first: baseDemand.first * smooth(2500, 5500, routeDistanceKm) * (longHaulPremium ? 0.65 + 0.4 * long : 0.2 + 0.5 * long),
    business: baseDemand.business * ((hubPair ? 0.32 : 0.2) + (hubPair ? 0.4 : 0.32) * short +
      (longHaulPremium ? 0.28 : 0.26) * medium + (longHaulPremium ? 0.08 : 0.14) * long),
    premiumEconomy: baseDemand.premiumEconomy * (0.08 + 0.3 * short + 0.44 * medium + 0.23 * long),
    economy: baseDemand.economy * (1.08 - 0.08 * short - 0.04 * medium - 0.02 * long),
    cargoTons: baseDemand.cargoTons * (0.45 + 0.25 * short + 0.3 * medium + (hubPair ? 0.12 : 0) * long)
  });
}

function smooth(from: number, to: number, distance: number) {
  const x = Number.isFinite(distance) ? Math.max(0, Math.min(1, (distance - from) / (to - from))) : 0;
  return x * x * (3 - 2 * x);
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
