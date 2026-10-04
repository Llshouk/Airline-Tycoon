import { GAME_BALANCE, GAME_REVENUE_MULTIPLIER, PRICE_ELASTICITY } from "@/config/gameBalance";
import { getDifficultyConfig, type DifficultyConfig } from "@/config/difficulty";
import { airportsById } from "@/data/airports";
import { calculateRouteEconomics, calculateScheduleFrequency } from "@/lib/economics/routeEconomics";
import { nightPassengerDemandMultiplier } from "@/lib/airportOperations";
import { DAY_MS, WEEK_MS, timeOfDayMs, weekStartMs } from "@/lib/time";
import type { AircraftInstance, AircraftModel, CabinDemand, CabinLayout, CabinPrices, Route, RoutePricing, WeeklySchedule } from "@/types/game";

type PriceDemandClass = keyof RoutePricing;

export function estimateTicketPrices(distanceKm: number): CabinPrices {
  const economy = Math.round(55 + distanceKm * 0.115 + Math.min(distanceKm, 10000) * 0.012);
  return {
    economy,
    premiumEconomy: Math.round(economy * 1.8),
    business: Math.round(economy * 3.5),
    first: Math.round(economy * 6)
  };
}

export function estimateCargoRatePerTon(distanceKm: number) {
  return Math.round(220 + distanceKm * 0.32);
}

export function routePricingFromDefaults(route: Pick<Route, "estimatedTicketPrices" | "estimatedCargoRatePerTon">) {
  return {
    ...route.estimatedTicketPrices,
    cargo: route.estimatedCargoRatePerTon
  };
}

export function estimateRouteOpeningCost(distanceKm: number) {
  return Math.round(2000000 + distanceKm * 2000);
}

export function estimateFlightFinancials(
  route: Route,
  model: AircraftModel,
  aircraft: Pick<AircraftInstance, "cabinLayout"> | CabinLayout,
  seed: number,
  difficultyConfig?: DifficultyConfig,
  operations?: { departureGameTimeMs: number; originAirportId: string }
) {
  const difficulty = difficultyConfig ?? getDifficultyConfig("easy");
  const cabinLayout = "cabinLayout" in aircraft ? aircraft.cabinLayout : aircraft;
  const adjustedDemand = estimatePriceAdjustedDemand(route);
  const nightMultiplier = nightPassengerDemandMultiplier(route.distanceKm, operations?.originAirportId ?? route.originAirportId, operations?.departureGameTimeMs);
  const timedDemand = { ...adjustedDemand };
  for (const cabin of ["first", "business", "premiumEconomy", "economy"] as const) {
    timedDemand[cabin] = Math.round(timedDemand[cabin] * nightMultiplier);
  }
  const prices = route.pricing ?? routePricingFromDefaults(route);
  const simulation = difficulty.difficulty === "simulation";
  const longHaulBonus = route.distanceKm >= 5500
    ? (simulation ? GAME_BALANCE.simulationLongHaulRevenueBonus : GAME_BALANCE.longHaulRevenueBonus)
    : 1;
  // Easy has a smaller gameplay bonus; Simulation retains its sandbox bonus.
  // Realistic remains unboosted. Historical settlements are never recalculated.
  const revenueMultiplier =
    difficulty.difficulty === "realistic"
      ? 1
      : (simulation ? GAME_BALANCE.simulationRevenueMultiplier : GAME_REVENUE_MULTIPLIER) * longHaulBonus * difficulty.revenueMultiplier;
  const economics = calculateRouteEconomics({
    distanceKm: route.distanceKm,
    aircraftRangeKm: model.rangeKm,
    cruiseSpeedKmh: model.cruiseSpeedKmh,
    fuelCostPerKm: model.fuelCostPerKm,
    aircraftType: model.type,
    originAirportTier: airportsById[operations?.originAirportId ?? route.originAirportId]?.sizeTier,
    destinationAirportTier: airportsById[operations?.originAirportId === route.destinationAirportId ? route.originAirportId : route.destinationAirportId]?.sizeTier,
    cabinLayout,
    demand: timedDemand,
    pricing: prices,
    loadFactor: GAME_BALANCE.minLoadFactor + deterministicNoise(seed) * (GAME_BALANCE.maxLoadFactor - GAME_BALANCE.minLoadFactor),
    cargoLoadFactor: 0.78 + deterministicNoise(seed + 17) * 0.2,
    revenueMultiplier
  });

  const revenue = Math.round(economics.estimatedRevenuePerFlight);
  const cost = Math.round(economics.estimatedTotalCostPerFlight);
  return {
    soldSeats: economics.soldSeats,
    adjustedDemand: timedDemand,
    passengerCount: economics.passengerCount,
    cargoTons: economics.cargoTons,
    revenue,
    cost,
    profit: revenue - cost,
    economics,
    nightDemandMultiplier: nightMultiplier
  };
}

export function estimatePriceAdjustedDemand(route: Route): CabinDemand {
  const recommended = route.recommendedPricing ?? routePricingFromDefaults(route);
  const actual = route.pricing ?? recommended;
  return {
    first: calculatePriceAdjustedDemand(route.estimatedDemand.first, recommended.first, actual.first, "first"),
    business: calculatePriceAdjustedDemand(route.estimatedDemand.business, recommended.business, actual.business, "business"),
    premiumEconomy: calculatePriceAdjustedDemand(
      route.estimatedDemand.premiumEconomy,
      recommended.premiumEconomy,
      actual.premiumEconomy,
      "premiumEconomy"
    ),
    economy: calculatePriceAdjustedDemand(route.estimatedDemand.economy, recommended.economy, actual.economy, "economy"),
    cargoTons: calculatePriceAdjustedDemand(route.estimatedDemand.cargoTons, recommended.cargo, actual.cargo, "cargo")
  };
}

export function calculatePriceAdjustedDemand(baseDemand: number, recommendedPrice: number, actualPrice: number, cabin: PriceDemandClass) {
  if (baseDemand <= 0 || recommendedPrice <= 0) return 0;
  if (actualPrice <= 0) return Math.round(baseDemand * (cabin === "economy" ? 1.35 : 1.2));

  const priceRatio = actualPrice / recommendedPrice;
  const elasticity = PRICE_ELASTICITY[cabin];
  let multiplier = Math.pow(priceRatio, -elasticity);

  if (priceRatio > 2) {
    multiplier *= Math.pow(2 / priceRatio, 1.5);
  }
  if (priceRatio > 4) {
    multiplier *= Math.pow(4 / priceRatio, 2.5);
  }

  const maxDemandBoost = cabin === "economy" ? 1.35 : 1.2;
  const minMultiplier = priceRatio > 4 ? 0 : 0.01;
  return Math.max(0, Math.round(baseDemand * Math.min(Math.max(multiplier, minMultiplier), maxDemandBoost)));
}

export function priceWarning(recommendedPrice: number, actualPrice: number) {
  const ratio = actualPrice / Math.max(1, recommendedPrice);
  if (ratio > 4) return "Unrealistic price: almost no passengers will buy this.";
  if (ratio > 2.5) return "Very high price: demand may collapse.";
  if (ratio > 1.5) return "High price: demand will decrease.";
  if (ratio <= 0.85) return "High demand but lower yield.";
  return null;
}

export function estimateExpectedFlightProfit(route: Route, model: AircraftModel, layout?: CabinLayout, difficultyConfig?: DifficultyConfig) {
  return estimateFlightFinancials(route, model, layout ?? model.suggestedLayout, stableSeed(route.id.length + model.id.length), difficultyConfig);
}

export function estimateFlightRevenue(route: Route, model: AircraftModel, aircraft: Pick<AircraftInstance, "cabinLayout"> | CabinLayout) {
  return estimateExpectedFlightProfit(route, model, "cabinLayout" in aircraft ? aircraft.cabinLayout : aircraft).revenue;
}

export function estimateFlightCost(route: Route, model: AircraftModel, aircraft: Pick<AircraftInstance, "cabinLayout"> | CabinLayout) {
  return estimateExpectedFlightProfit(route, model, "cabinLayout" in aircraft ? aircraft.cabinLayout : aircraft).cost;
}

export function estimateFlightProfit(route: Route, model: AircraftModel, aircraft: Pick<AircraftInstance, "cabinLayout"> | CabinLayout) {
  return estimateExpectedFlightProfit(route, model, "cabinLayout" in aircraft ? aircraft.cabinLayout : aircraft).profit;
}

export function estimateScheduleWeeklyRevenue(input: {
  route: Route;
  model: AircraftModel;
  aircraft: Pick<AircraftInstance, "cabinLayout"> | CabinLayout;
  daysOfWeek: unknown[];
  isRoundTrip: boolean;
  difficultyConfig?: DifficultyConfig;
}) {
  return estimateScheduleFinancials(input).weeklyRevenue;
}

export function estimateScheduleWeeklyProfit(input: {
  route: Route;
  model: AircraftModel;
  aircraft: Pick<AircraftInstance, "cabinLayout"> | CabinLayout;
  daysOfWeek: unknown[];
  isRoundTrip: boolean;
  difficultyConfig?: DifficultyConfig;
}) {
  return estimateScheduleFinancials(input).weeklyProfit;
}

export function estimateWeeklyScheduleFinancials(
  schedule: WeeklySchedule,
  route: Route,
  model: AircraftModel,
  aircraft: Pick<AircraftInstance, "cabinLayout"> | CabinLayout,
  difficultyConfig?: DifficultyConfig,
  referenceGameTimeMs?: number
) {
  return estimateScheduleFinancials({
    route,
    model,
    aircraft,
    daysOfWeek: schedule.daysOfWeek,
    isRoundTrip: schedule.isRoundTrip,
    difficultyConfig,
    departureTimeLocal: schedule.departureTimeLocal,
    referenceGameTimeMs
  });
}

export function estimateScheduleFinancials(input: {
  route: Route;
  model: AircraftModel;
  aircraft: Pick<AircraftInstance, "cabinLayout"> | CabinLayout;
  daysOfWeek: unknown[];
  isRoundTrip: boolean;
  difficultyConfig?: DifficultyConfig;
  departureTimeLocal?: string;
  referenceGameTimeMs?: number;
}) {
  const cabinLayout = "cabinLayout" in input.aircraft ? input.aircraft.cabinLayout : input.aircraft;
  const reference = input.referenceGameTimeMs ?? Date.UTC(2026, 0, 1);
  const days = [...new Set(input.daysOfWeek.filter((day): day is number => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6))];
  const departures = days.map((day) => {
    let time = weekStartMs(reference) + day * DAY_MS + timeOfDayMs(input.departureTimeLocal ?? "12:00");
    if (time < reference) time += WEEK_MS;
    return time;
  });
  const seed = stableSeed(input.route.id.length + input.model.id.length);
  const estimateLeg = (departure: number, originAirportId: string) => estimateFlightFinancials(input.route, input.model, cabinLayout, seed,
    input.difficultyConfig, input.departureTimeLocal ? { departureGameTimeMs: departure, originAirportId } : undefined);
  const estimates = departures.flatMap((departure) => {
    const outbound = estimateLeg(departure, input.route.originAirportId);
    if (!input.isRoundTrip) return [outbound];
    const returning = departure + input.route.distanceKm / input.model.cruiseSpeedKmh * 3_600_000 + input.model.turnaroundMinutes * 60_000;
    return [outbound, estimateLeg(returning, input.route.destinationAirportId)];
  });
  const perFlight = estimates[0] ?? estimateExpectedFlightProfit(input.route, input.model, cabinLayout, input.difficultyConfig);
  const frequency = calculateScheduleFrequency(input.daysOfWeek, input.isRoundTrip);
  const weeklyFlights = frequency.flightsPerWeek;
  return {
    perFlight,
    servicesPerWeek: frequency.servicesPerWeek,
    legsPerService: frequency.legsPerService,
    weeklyFlights,
    weeklyRevenue: estimates.reduce((sum, leg) => sum + leg.revenue, 0),
    weeklyCost: estimates.reduce((sum, leg) => sum + leg.cost, 0),
    weeklyProfit: estimates.reduce((sum, leg) => sum + leg.profit, 0),
    weeklyPassengerCount: estimates.reduce((sum, leg) => sum + leg.passengerCount, 0),
    weeklyCargoTons: Math.round(estimates.reduce((sum, leg) => sum + leg.cargoTons, 0) * 10) / 10,
    nightFlights: estimates.filter((leg) => leg.nightDemandMultiplier < 1).length
  };
}

function deterministicNoise(seed: number) {
  const value = Math.sin(seed * 9999) * 10000;
  return value - Math.floor(value);
}

function stableSeed(value: number) {
  return value * 37 + 11;
}
