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
  overallGrade: RouteGrade;
  demandScore: RouteGrade;
  profitScore: RouteGrade;
  aircraftFitScore: RouteGrade;
  riskLevel: RouteRiskLevel;
  strategicValue: RouteStrategicValue;
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
  const demandNumeric = demandStrength(adjustedDemand, origin, destination, route.distanceKm);
  const demandScore = gradeFromScore(demandNumeric);
  const profitScore = gradeFromScore(profitStrength(estimatedWeeklyRevenue, estimatedWeeklyProfit));
  const aircraftFitScore = gradeFromScore(bestAircraftScore?.score ?? 0);
  const strategicValue = strategicValueForRoute(origin, destination, route.distanceKm, demandNumeric);
  const riskLevel = riskForRoute({ route, demandNumeric, bestAircraftScore, estimatedWeeklyProfit, aircraftCount: recommendedAircraftIds.length });
  const warnings = routeWarnings({ route, adjustedDemand, bestAircraftScore, aircraftScores, estimatedWeeklyProfit });
  const suggestions = routeSuggestions({ route, adjustedDemand, bestAircraftScore, recommendedAircraftIds, riskLevel, strategicValue });
  const overallGrade = overallGradeFor({
    demandScore,
    profitScore,
    aircraftFitScore,
    riskLevel,
    strategicValue
  });

  return {
    overallGrade,
    demandScore,
    profitScore,
    aircraftFitScore,
    riskLevel,
    strategicValue,
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
}): { score: RouteGrade; warnings: string[]; suggestions: string[] } {
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

  return { score: gradeFromScore(score), warnings, suggestions };
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
    let score = numericFromGrade(cabinFit.score);
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

function riskForRoute({
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
}): RouteRiskLevel {
  let risk = 0;
  if (demandNumeric < 45) risk += 2;
  if (!bestAircraftScore) risk += 3;
  if (bestAircraftScore && bestAircraftScore.model.rangeKm - route.distanceKm < Math.max(250, route.distanceKm * 0.08)) risk += 1;
  if (estimatedWeeklyProfit !== undefined && estimatedWeeklyProfit < 0) risk += 2;
  if (route.distanceKm > 9000) risk += 1;
  if (aircraftCount <= 1) risk += 1;
  if (risk >= 4) return "high";
  if (risk >= 2) return "medium";
  return "low";
}

function strategicValueForRoute(origin: Airport, destination: Airport, distance: number, demandNumeric: number): RouteStrategicValue {
  if ((origin.sizeTier === "mega" && destination.sizeTier === "mega") || (distance > 5500 && demandNumeric >= 70)) return "high";
  if (origin.sizeTier !== "regional" || destination.sizeTier !== "regional" || demandNumeric >= 55) return "medium";
  return "low";
}

function overallGradeFor({
  demandScore,
  profitScore,
  aircraftFitScore,
  riskLevel,
  strategicValue
}: {
  demandScore: RouteGrade;
  profitScore: RouteGrade;
  aircraftFitScore: RouteGrade;
  riskLevel: RouteRiskLevel;
  strategicValue: RouteStrategicValue;
}) {
  let score = numericFromGrade(demandScore) * 0.28 + numericFromGrade(profitScore) * 0.32 + numericFromGrade(aircraftFitScore) * 0.28;
  score += strategicValue === "high" ? 8 : strategicValue === "medium" ? 3 : 0;
  score -= riskLevel === "high" ? 22 : riskLevel === "medium" ? 8 : 0;
  return gradeFromScore(score);
}

function gradeFromScore(score: number): RouteGrade {
  if (score >= 88) return "A+";
  if (score >= 76) return "A";
  if (score >= 60) return "B";
  if (score >= 42) return "C";
  return "D";
}

function numericFromGrade(grade: RouteGrade) {
  if (grade === "A+") return 94;
  if (grade === "A") return 82;
  if (grade === "B") return 66;
  if (grade === "C") return 48;
  return 24;
}

function evaluationSortScore(evaluation: RouteEvaluation) {
  return numericFromGrade(evaluation.overallGrade) * 100000000 + evaluation.estimatedWeeklyRevenue;
}

function routeConnects(originA: string, destinationA: string, originB: string, destinationB: string) {
  return (
    (originA === originB && destinationA === destinationB) ||
    (originA === destinationB && destinationA === originB)
  );
}
