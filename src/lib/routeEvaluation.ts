import { aircraftById } from "@/data/aircraft";
import { airports, airportsById } from "@/data/airports";
import { calculateCabinDemandByDistance, estimateDemand } from "@/lib/demand";
import { estimateCargoRatePerTon, estimateExpectedFlightProfit, estimateTicketPrices } from "@/lib/economy";
import { distanceKm } from "@/lib/geo";
import type { AircraftInstance, Airport, CabinDemand, CabinLayout, GameState, Route } from "@/types/game";

export type RouteGrade = "A+" | "A" | "B" | "C" | "D";
export type RouteRiskLevel = "low" | "medium" | "high";
export type RouteStrategicValue = "low" | "medium" | "high";

export type RouteEvaluation = {
  overallScore: number;
  overallGrade: RouteGrade;
  demandScore: number;
  demandGrade: RouteGrade;
  profitScore: number;
  profitGrade: RouteGrade;
  aircraftFitScore: number;
  aircraftFitGrade: RouteGrade;
  riskScore: number;
  riskLevel: RouteRiskLevel;
  strategicScore: number;
  strategicValue: RouteStrategicValue;
  cabinDemandBreakdown: {
    first: number;
    business: number;
    premiumEconomy: number;
    economy: number;
    cargo: number;
  };
  scoreReasons: string[];
  estimatedWeeklyRevenue: number;
  estimatedWeeklyProfit?: number;
  recommendedAircraftIds: string[];
  warnings: string[];
  suggestions: string[];
  adjustedDemand: CabinDemand;
};

export function evaluateRoute({ route, gameState }: { route: Route; gameState: GameState }): RouteEvaluation {
  const origin = airportsById[route.originAirportId];
  const destination = airportsById[route.destinationAirportId];
  const adjustedDemand = calculateCabinDemandByDistance({
    routeDistanceKm: route.distanceKm,
    originAirport: origin,
    destinationAirport: destination,
    baseDemand: route.estimatedDemand
  });
  const evaluationRoute = { ...route, estimatedDemand: adjustedDemand };
  const aircraftScores = getAircraftFitScores(evaluationRoute, gameState, adjustedDemand);
  const recommendedAircraftIds = aircraftScores
    .filter((item) => item.canOperate && item.score >= 45)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.aircraft.id);
  const bestAircraftScore = aircraftScores.find((item) => item.canOperate);
  const bestFinancials = bestAircraftScore
    ? estimateExpectedFlightProfit(evaluationRoute, bestAircraftScore.model, bestAircraftScore.aircraft.cabinLayout, gameState.difficultyConfig)
    : null;
  const weeklyFlights = route.distanceKm >= 5500 ? 7 : 14;
  const estimatedWeeklyRevenue = bestFinancials
    ? Math.round(bestFinancials.revenue * weeklyFlights)
    : estimateRevenueFromDemand(evaluationRoute);
  // TODO V1.2: replace this per-flight proxy with a fuller operating-cost and utilization model.
  const estimatedWeeklyProfit = bestFinancials ? Math.round(bestFinancials.profit * weeklyFlights) : undefined;
  const demandScore = clampScore(demandStrength(adjustedDemand, origin, destination, route.distanceKm));
  const profitScore = clampScore(profitStrength(estimatedWeeklyRevenue, estimatedWeeklyProfit));
  const aircraftFitScore = clampScore(bestAircraftScore?.score ?? 0);
  const strategicScore = strategicScoreForRoute(origin, destination, route.distanceKm, demandScore);
  const strategicValue = strategicValueFromScore(strategicScore);
  const riskScore = riskScoreForRoute({ route, demandNumeric: demandScore, bestAircraftScore, estimatedWeeklyProfit, aircraftCount: recommendedAircraftIds.length });
  const riskLevel = scoreToRiskLevel(riskScore);
  const warnings = routeWarnings({ route, adjustedDemand, bestAircraftScore, aircraftScores, estimatedWeeklyProfit });
  const suggestions = routeSuggestions({ route, adjustedDemand, bestAircraftScore, recommendedAircraftIds, riskLevel, strategicValue });
  const scoreReasons = routeScoreReasons({
    route,
    adjustedDemand,
    demandScore,
    profitScore,
    aircraftFitScore,
    riskLevel,
    strategicValue,
    bestAircraftScore,
    recommendedAircraftIds,
    estimatedWeeklyRevenue
  });
  const overallScore = overallScoreFor({
    demandScore,
    profitScore,
    aircraftFitScore,
    riskScore,
    strategicScore
  });

  return {
    overallScore,
    overallGrade: scoreToGrade(overallScore),
    demandScore,
    demandGrade: scoreToGrade(demandScore),
    profitScore,
    profitGrade: scoreToGrade(profitScore),
    aircraftFitScore,
    aircraftFitGrade: scoreToGrade(aircraftFitScore),
    riskScore,
    riskLevel,
    strategicScore,
    strategicValue,
    cabinDemandBreakdown: {
      first: adjustedDemand.first,
      business: adjustedDemand.business,
      premiumEconomy: adjustedDemand.premiumEconomy,
      economy: adjustedDemand.economy,
      cargo: adjustedDemand.cargoTons
    },
    scoreReasons,
    estimatedWeeklyRevenue,
    estimatedWeeklyProfit,
    recommendedAircraftIds,
    warnings,
    suggestions,
    adjustedDemand
  };
}

export function evaluateCabinFit({
  aircraftCabinConfig,
  routeCabinDemand,
  routeDistanceKm
}: {
  aircraftCabinConfig: CabinLayout;
  routeCabinDemand: CabinDemand;
  routeDistanceKm: number;
}): { score: number; grade: RouteGrade; warnings: string[]; suggestions: string[] } {
  const warnings: string[] = [];
  const suggestions: string[] = [];
  const weeklyFlights = routeDistanceKm >= 5500 ? 7 : 14;
  const perFlightEconomyDemand = routeCabinDemand.economy / weeklyFlights;
  const perFlightPremiumDemand = (routeCabinDemand.first + routeCabinDemand.business + routeCabinDemand.premiumEconomy) / weeklyFlights;
  const premiumSeats = aircraftCabinConfig.first + aircraftCabinConfig.business + aircraftCabinConfig.premiumEconomy;
  const totalSeats = premiumSeats + aircraftCabinConfig.economy;
  let score = 76;

  if (routeDistanceKm < 800 && aircraftCabinConfig.first > 0) {
    score -= 24;
    warnings.push("Short-haul routes do not support meaningful First Class demand");
  }
  if (perFlightEconomyDemand > aircraftCabinConfig.economy * 1.6) {
    score -= 12;
    suggestions.push("Use more economy capacity on this route");
  }
  if (perFlightPremiumDemand < premiumSeats * 0.35 && premiumSeats > totalSeats * 0.22) {
    score -= 16;
    warnings.push("Cabin configuration does not match route demand");
  }
  if (routeDistanceKm > 5500 && routeCabinDemand.business > 80 && aircraftCabinConfig.business < 12) {
    score -= 14;
    suggestions.push("Add more business seats for this long-haul premium route");
  }
  if (totalSeats > (routeCabinDemand.first + routeCabinDemand.business + routeCabinDemand.premiumEconomy + routeCabinDemand.economy) / 5) {
    score -= 8;
    warnings.push("Aircraft capacity may be high for this demand level");
  }

  const numericScore = clampScore(score);
  return { score: numericScore, grade: scoreToGrade(numericScore), warnings, suggestions };
}

export function getRecommendedRouteOpportunities(gameState: GameState, limit = 5) {
  const baseIds = gameState.baseAirports ?? [gameState.primaryBaseAirport ?? gameState.baseAirportId];
  return baseIds
    .flatMap((baseId) => {
      const origin = airportsById[baseId];
      return airports
        .filter((destination) => destination.id !== baseId)
        .filter((destination) => !gameState.routes.some((route) => routeConnects(route.originAirportId, route.destinationAirportId, baseId, destination.id)))
        .map((destination) => {
          const distance = distanceKm(origin, destination);
          const estimatedTicketPrices = estimateTicketPrices(distance);
          const estimatedCargoRatePerTon = estimateCargoRatePerTon(distance);
          const recommendedPricing = { ...estimatedTicketPrices, cargo: estimatedCargoRatePerTon };
          const route: Route = {
            id: `${origin.id}-${destination.id}`,
            originAirportId: origin.id,
            originBaseAirportId: origin.id,
            originIata: origin.iata,
            destinationAirportId: destination.id,
            destinationIata: destination.iata,
            distanceKm: distance,
            estimatedDemand: estimateDemand(origin, destination, distance),
            estimatedTicketPrices,
            estimatedCargoRatePerTon,
            recommendedPricing,
            pricing: recommendedPricing,
            isOpen: false
          };
          return { route, evaluation: evaluateRoute({ route, gameState }) };
        });
    })
    .filter(({ evaluation }) => evaluation.overallGrade !== "D" && evaluation.riskLevel !== "high")
    .sort((a, b) => evaluationSortScore(b.evaluation) - evaluationSortScore(a.evaluation))
    .slice(0, limit);
}

function getAircraftFitScores(route: Route, gameState: GameState, adjustedDemand: CabinDemand) {
  const originBaseId = route.originBaseAirportId ?? route.originAirportId;
  return gameState.fleet.map((aircraft) => {
    const model = aircraftById[aircraft.modelId];
    const rangeMargin = model.rangeKm - route.distanceKm;
    const correctBase = aircraft.homeBaseAirportId === originBaseId || aircraft.homeBaseAirportId === route.originAirportId;
    const notBusy = aircraft.status !== "in-flight";
    const cabinFit = evaluateCabinFit({
      aircraftCabinConfig: aircraft.cabinLayout,
      routeCabinDemand: adjustedDemand,
      routeDistanceKm: route.distanceKm
    });
    let score = cabinFit.score;
    if (rangeMargin < 0) score = 0;
    else if (rangeMargin < Math.max(250, route.distanceKm * 0.08)) score -= 18;
    if (!correctBase) score -= 28;
    if (!notBusy) score -= 12;
    if (aircraft.weeklySchedules.length > 10) score -= 10;
    if (model.type === "widebody" && route.distanceKm < 1500 && demandStrength(adjustedDemand, airportsById[route.originAirportId], airportsById[route.destinationAirportId], route.distanceKm) < 55) {
      score -= 16;
    }
    if (model.type === "narrowbody" && route.distanceKm > 5500) score -= 18;
    return {
      aircraft,
      model,
      canOperate: rangeMargin >= 0 && correctBase && notBusy,
      score: Math.max(0, Math.min(100, score)),
      cabinFit
    };
  });
}

function routeWarnings({
  route,
  adjustedDemand,
  bestAircraftScore,
  aircraftScores,
  estimatedWeeklyProfit
}: {
  route: Route;
  adjustedDemand: CabinDemand;
  bestAircraftScore: ReturnType<typeof getAircraftFitScores>[number] | undefined;
  aircraftScores: ReturnType<typeof getAircraftFitScores>;
  estimatedWeeklyProfit?: number;
}) {
  const warnings = new Set<string>();
  if (route.distanceKm < 800 && adjustedDemand.first === 0) warnings.add("Short-haul routes do not support meaningful First Class demand");
  if (!bestAircraftScore) warnings.add("No suitable aircraft available");
  if (aircraftScores.every((item) => item.model.rangeKm < route.distanceKm)) warnings.add("No owned aircraft has enough range");
  if (estimatedWeeklyProfit !== undefined && estimatedWeeklyProfit < 0) warnings.add("Weak route");
  if (bestAircraftScore && route.distanceKm < 2500 && bestAircraftScore.aircraft.cabinLayout.first > 4) warnings.add("This aircraft has too many First Class seats for a short-haul route");
  bestAircraftScore?.cabinFit.warnings.forEach((warning) => warnings.add(warning));
  return Array.from(warnings);
}

function routeSuggestions({
  route,
  adjustedDemand,
  bestAircraftScore,
  recommendedAircraftIds,
  riskLevel,
  strategicValue
}: {
  route: Route;
  adjustedDemand: CabinDemand;
  bestAircraftScore: ReturnType<typeof getAircraftFitScores>[number] | undefined;
  recommendedAircraftIds: string[];
  riskLevel: RouteRiskLevel;
  strategicValue: RouteStrategicValue;
}) {
  const suggestions = new Set<string>();
  if (recommendedAircraftIds.length > 0 && riskLevel !== "high") suggestions.add("Strong route opportunity");
  if (!bestAircraftScore) suggestions.add("Buy or move a suitable aircraft before opening this route");
  if (route.distanceKm < 800 && adjustedDemand.first === 0) suggestions.add("Use economy-focused regional or narrow-body aircraft");
  if (route.distanceKm > 5500 && strategicValue === "high") suggestions.add("Prioritize long-haul aircraft with premium and cargo capacity");
  if (bestAircraftScore) {
    suggestions.add(`${bestAircraftScore.model.model} ${bestAircraftScore.score >= 72 ? "fits this route well because range and capacity match demand" : "can operate this route, but review capacity and cabin mix before scheduling"}`);
  }
  bestAircraftScore?.cabinFit.suggestions.forEach((suggestion) => suggestions.add(suggestion));
  return Array.from(suggestions);
}

function estimateRevenueFromDemand(route: Route) {
  const prices = route.pricing ?? route.recommendedPricing ?? { ...route.estimatedTicketPrices, cargo: route.estimatedCargoRatePerTon };
  const weeklyLoad = 0.55;
  return Math.round(
    (route.estimatedDemand.first * prices.first +
      route.estimatedDemand.business * prices.business +
      route.estimatedDemand.premiumEconomy * prices.premiumEconomy +
      route.estimatedDemand.economy * prices.economy +
      route.estimatedDemand.cargoTons * prices.cargo) *
      weeklyLoad
  );
}

function demandStrength(demand: CabinDemand, origin: Airport, destination: Airport, distance: number) {
  const premium = demand.first * 4 + demand.business * 2.6 + demand.premiumEconomy * 1.55;
  const economy = demand.economy;
  const cargo = demand.cargoTons * 22;
  const hubBonus = origin.sizeTier === "mega" && destination.sizeTier === "mega" ? 14 : origin.sizeTier === "mega" || destination.sizeTier === "mega" ? 7 : 0;
  const distanceBonus = distance > 5500 ? 8 : distance > 2500 ? 4 : 0;
  return Math.min(100, (premium + economy + cargo) / 120 + hubBonus + distanceBonus);
}

function profitStrength(weeklyRevenue: number, weeklyProfit?: number) {
  const revenueScore = weeklyRevenue >= 25000000 ? 92 : weeklyRevenue >= 14000000 ? 82 : weeklyRevenue >= 6500000 ? 68 : weeklyRevenue >= 2500000 ? 50 : 30;
  if (weeklyProfit === undefined) return revenueScore;
  const profitScore = weeklyProfit >= 6000000 ? 92 : weeklyProfit >= 2500000 ? 80 : weeklyProfit >= 750000 ? 66 : weeklyProfit >= 0 ? 48 : 22;
  return revenueScore * 0.45 + profitScore * 0.55;
}

function riskScoreForRoute({
  route,
  demandNumeric,
  bestAircraftScore,
  estimatedWeeklyProfit,
  aircraftCount
}: {
  route: Route;
  demandNumeric: number;
  bestAircraftScore: ReturnType<typeof getAircraftFitScores>[number] | undefined;
  estimatedWeeklyProfit?: number;
  aircraftCount: number;
}): number {
  let risk = 12;
  if (demandNumeric < 45) risk += 20;
  if (!bestAircraftScore) risk += 35;
  if (bestAircraftScore && bestAircraftScore.model.rangeKm - route.distanceKm < Math.max(250, route.distanceKm * 0.08)) risk += 12;
  if (estimatedWeeklyProfit !== undefined && estimatedWeeklyProfit < 0) risk += 22;
  if (route.distanceKm > 9000) risk += 10;
  if (aircraftCount <= 1) risk += 12;
  return clampScore(risk);
}

function strategicScoreForRoute(origin: Airport, destination: Airport, distance: number, demandNumeric: number): number {
  let score = demandNumeric * 0.35;
  if (origin.sizeTier === "mega") score += 18;
  if (destination.sizeTier === "mega") score += 18;
  if (origin.sizeTier === "large" || destination.sizeTier === "large") score += 8;
  if (distance > 5500) score += 14;
  else if (distance > 2500) score += 7;
  return clampScore(score);
}

function strategicValueFromScore(score: number): RouteStrategicValue {
  if (score >= 70) return "high";
  if (score >= 42) return "medium";
  return "low";
}

function overallScoreFor({
  demandScore,
  profitScore,
  aircraftFitScore,
  riskScore,
  strategicScore
}: {
  demandScore: number;
  profitScore: number;
  aircraftFitScore: number;
  riskScore: number;
  strategicScore: number;
}) {
  // Central route score formula. Deterministic weighted blend: demand and profit lead,
  // aircraft fit matters heavily, strategic value helps, and risk lowers the final score.
  return clampScore(
    demandScore * 0.3 +
      profitScore * 0.3 +
      aircraftFitScore * 0.25 +
      strategicScore * 0.1 +
      (100 - riskScore) * 0.05
  );
}

export function scoreToGrade(score: number): RouteGrade {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  return "D";
}

function scoreToRiskLevel(riskScore: number): RouteRiskLevel {
  if (riskScore < 35) return "low";
  if (riskScore < 70) return "medium";
  return "high";
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function routeScoreReasons({
  route,
  adjustedDemand,
  demandScore,
  profitScore,
  aircraftFitScore,
  riskLevel,
  strategicValue,
  bestAircraftScore,
  recommendedAircraftIds,
  estimatedWeeklyRevenue
}: {
  route: Route;
  adjustedDemand: CabinDemand;
  demandScore: number;
  profitScore: number;
  aircraftFitScore: number;
  riskLevel: RouteRiskLevel;
  strategicValue: RouteStrategicValue;
  bestAircraftScore: ReturnType<typeof getAircraftFitScores>[number] | undefined;
  recommendedAircraftIds: string[];
  estimatedWeeklyRevenue: number;
}) {
  const reasons: string[] = [];
  if (demandScore >= 75) reasons.push("Strong passenger demand for this route");
  else if (demandScore < 50) reasons.push("Passenger demand is limited for this route");
  if (route.distanceKm < 800 && adjustedDemand.first === 0) reasons.push("Short-haul route: First Class demand is not expected");
  if (profitScore >= 75) reasons.push("Estimated weekly revenue is strong compared with route distance");
  if (aircraftFitScore >= 72 && recommendedAircraftIds.length >= 2) reasons.push("At least two aircraft can operate this route");
  else if (!bestAircraftScore) reasons.push("No suitable aircraft is currently available from this base");
  if (bestAircraftScore) reasons.push(`${bestAircraftScore.model.model} is the best current aircraft fit for this route`);
  if (riskLevel === "medium") reasons.push("Risk is medium because aircraft availability or operating margin is limited");
  if (riskLevel === "high") reasons.push("Risk is high because aircraft fit, range, or profitability is weak");
  if (strategicValue === "high") reasons.push("Strategic value is high because this connects major or long-haul markets");
  if (estimatedWeeklyRevenue <= 2500000) reasons.push("Revenue potential is modest, so start with conservative capacity");
  return reasons.slice(0, 6);
}

function evaluationSortScore(evaluation: RouteEvaluation) {
  return evaluation.overallScore * 100000000 + evaluation.estimatedWeeklyRevenue;
}

function routeConnects(originA: string, destinationA: string, originB: string, destinationB: string) {
  return (
    (originA === originB && destinationA === destinationB) ||
    (originA === destinationB && destinationA === originB)
  );
}
