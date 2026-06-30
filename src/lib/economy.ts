import { COST_BALANCE_MULTIPLIER, GAME_BALANCE, GAME_REVENUE_MULTIPLIER, PRICE_ELASTICITY } from "@/config/gameBalance";
import { getDifficultyConfig, type DifficultyConfig } from "@/config/difficulty";
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
  difficultyConfig?: DifficultyConfig
) {
  const difficulty = difficultyConfig ?? getDifficultyConfig("easy");
  const cabinLayout = "cabinLayout" in aircraft ? aircraft.cabinLayout : aircraft;
  const adjustedDemand = estimatePriceAdjustedDemand(route);
  const prices = route.pricing ?? routePricingFromDefaults(route);
  const soldSeats = estimateSoldSeats(adjustedDemand, cabinLayout, seed);
  const cargoTons = Math.min(cabinLayout.cargoTons, adjustedDemand.cargoTons * (0.78 + deterministicNoise(seed + 17) * 0.2));
  const longHaulBonus = route.distanceKm >= 5500 ? GAME_BALANCE.longHaulRevenueBonus : 1;
  const baseRevenue =
    soldSeats.first * prices.first +
    soldSeats.business * prices.business +
    soldSeats.premiumEconomy * prices.premiumEconomy +
    soldSeats.economy * prices.economy +
    cargoTons * prices.cargo;
  // Easy uses the existing gameplay-balanced revenue model. Simulation stacks an
  // arcade bonus on top. Realistic removes artificial revenue inflation so
  // unprofitable routes can genuinely lose money.
  const revenue =
    difficulty.difficulty === "realistic"
      ? baseRevenue
      : baseRevenue * GAME_REVENUE_MULTIPLIER * longHaulBonus * difficulty.revenueMultiplier;
  const flightTimeHours = route.distanceKm / model.cruiseSpeedKmh;
  const cost =
    (route.distanceKm * model.fuelCostPerKm +
      (10000 + route.distanceKm * 5) +
      flightTimeHours * 3000 +
      route.distanceKm * 20 +
      cargoTons * 35) *
    COST_BALANCE_MULTIPLIER;
  const passengerCount = soldSeats.first + soldSeats.business + soldSeats.premiumEconomy + soldSeats.economy;

  return {
    soldSeats,
    adjustedDemand,
    passengerCount,
    cargoTons: Math.round(cargoTons * 10) / 10,
    revenue: Math.round(revenue),
    cost: Math.round(cost),
    profit: Math.round(revenue - cost)
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
  difficultyConfig?: DifficultyConfig
) {
  return estimateScheduleFinancials({
    route,
    model,
    aircraft,
    daysOfWeek: schedule.daysOfWeek,
    isRoundTrip: schedule.isRoundTrip,
    difficultyConfig
  });
}

export function estimateScheduleFinancials(input: {
  route: Route;
  model: AircraftModel;
  aircraft: Pick<AircraftInstance, "cabinLayout"> | CabinLayout;
  daysOfWeek: unknown[];
  isRoundTrip: boolean;
  difficultyConfig?: DifficultyConfig;
}) {
  const cabinLayout = "cabinLayout" in input.aircraft ? input.aircraft.cabinLayout : input.aircraft;
  const perFlight = estimateExpectedFlightProfit(input.route, input.model, cabinLayout, input.difficultyConfig);
  const legsPerService = input.isRoundTrip ? 2 : 1;
  const weeklyFlights = input.daysOfWeek.length * legsPerService;
  return {
    perFlight,
    weeklyFlights,
    weeklyRevenue: perFlight.revenue * weeklyFlights,
    weeklyCost: perFlight.cost * weeklyFlights,
    weeklyProfit: perFlight.profit * weeklyFlights,
    weeklyPassengerCount: perFlight.passengerCount * weeklyFlights,
    weeklyCargoTons: Math.round(perFlight.cargoTons * weeklyFlights * 10) / 10
  };
}

function estimateSoldSeats(demand: CabinDemand, layout: CabinLayout, seed: number): CabinDemand {
  const loadFactor = GAME_BALANCE.minLoadFactor + deterministicNoise(seed) * (GAME_BALANCE.maxLoadFactor - GAME_BALANCE.minLoadFactor);
  return {
    first: Math.min(layout.first, Math.round(demand.first * loadFactor)),
    business: Math.min(layout.business, Math.round(demand.business * loadFactor)),
    premiumEconomy: Math.min(layout.premiumEconomy, Math.round(demand.premiumEconomy * loadFactor)),
    economy: Math.min(layout.economy, Math.round(demand.economy * loadFactor)),
    cargoTons: 0
  };
}

function deterministicNoise(seed: number) {
  const value = Math.sin(seed * 9999) * 10000;
  return value - Math.floor(value);
}

function stableSeed(value: number) {
  return value * 37 + 11;
}
