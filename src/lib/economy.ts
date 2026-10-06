import { GAME_BALANCE, GAME_REVENUE_MULTIPLIER } from "@/config/gameBalance";
import { getDifficultyConfig, type DifficultyConfig } from "@/config/difficulty";
import { airportsById } from "@/data/airports";
import { calculateRouteEconomics, calculateScheduleFrequency } from "@/lib/economics/routeEconomics";
import { nightPassengerDemandMultiplier } from "@/lib/airportOperations";
import { demandAtPrice, priceDemandMultiplier, referenceWindowDemand } from "@/lib/marketDemand";
import { cabinExtraOperatingCosts, cabinFareMultiplier } from "@/lib/cabinConfiguration";
import { flightExperienceScores } from "@/lib/passengerExperience";
import type { CabinAircraft } from "@/types/cabin";
import { DAY_MS, WEEK_MS, timeOfDayMs, weekStartMs } from "@/lib/time";
import type { AircraftModel, CabinDemand, CabinLayout, CabinPrices, Route, RoutePricing, WeeklySchedule } from "@/types/game";

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
  aircraft: CabinAircraft | CabinLayout,
  seed: number,
  difficultyConfig?: DifficultyConfig,
  operations?: { departureGameTimeMs: number; originAirportId: string; allocatedDemand?: CabinDemand }
) {
  const difficulty = difficultyConfig ?? getDifficultyConfig("easy");
  const cabinLayout = "cabinLayout" in aircraft ? aircraft.cabinLayout : aircraft;
  const cabinAircraft: CabinAircraft = "cabinLayout" in aircraft ? aircraft : { cabinLayout };
  const duration = route.distanceKm / model.cruiseSpeedKmh;
  const extraCosts = cabinExtraOperatingCosts(model, cabinAircraft.cabinConfiguration, duration);
  const nightMultiplier = nightPassengerDemandMultiplier(route.distanceKm, operations?.originAirportId ?? route.originAirportId, operations?.departureGameTimeMs);
  const timedDemand = operations?.allocatedDemand ?? demandAtPrice(route,
    referenceWindowDemand(route, operations?.originAirportId, operations?.departureGameTimeMs),
    Object.fromEntries(["first", "business", "premiumEconomy", "economy"].map((cabin) =>
      [cabin, cabinFareMultiplier(model, cabinAircraft.cabinConfiguration, cabin as keyof CabinPrices, duration)])) as CabinPrices);
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
    cabinCleaningCost: extraCosts.cleaning,
    cabinMaintenanceReserve: extraCosts.maintenance,
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
    experienceScores: flightExperienceScores(route, model, cabinAircraft),
    nightDemandMultiplier: nightMultiplier
  };
}

export function estimatePriceAdjustedDemand(route: Route): CabinDemand {
  return demandAtPrice(route, route.estimatedDemand);
}

export function calculatePriceAdjustedDemand(baseDemand: number, recommendedPrice: number, actualPrice: number, cabin: PriceDemandClass) {
  return Number.isFinite(baseDemand) ? Math.max(0, Math.floor(baseDemand * priceDemandMultiplier(recommendedPrice, actualPrice, cabin))) : 0;
}

export function priceWarning(recommendedPrice: number, actualPrice: number) {
  const ratio = actualPrice / Math.max(1, recommendedPrice);
  if (ratio > 4) return "Unrealistic price: almost no passengers will buy this.";
  if (ratio > 2.5) return "Very high price: demand may collapse.";
  if (ratio > 1.5) return "High price: demand will decrease.";
  if (ratio <= 0.85) return "High demand but lower yield.";
  return null;
}

export function estimateExpectedFlightProfit(route: Route, model: AircraftModel, layout?: CabinLayout | CabinAircraft, difficultyConfig?: DifficultyConfig) {
  return estimateFlightFinancials(route, model, layout ?? model.suggestedLayout, stableSeed(route.id.length + model.id.length), difficultyConfig);
}

export function estimateFlightRevenue(route: Route, model: AircraftModel, aircraft: CabinAircraft | CabinLayout) {
  return estimateExpectedFlightProfit(route, model, aircraft).revenue;
}

export function estimateFlightCost(route: Route, model: AircraftModel, aircraft: CabinAircraft | CabinLayout) {
  return estimateExpectedFlightProfit(route, model, aircraft).cost;
}

export function estimateFlightProfit(route: Route, model: AircraftModel, aircraft: CabinAircraft | CabinLayout) {
  return estimateExpectedFlightProfit(route, model, aircraft).profit;
}

export function estimateScheduleWeeklyRevenue(input: {
  route: Route;
  model: AircraftModel;
  aircraft: CabinAircraft | CabinLayout;
  daysOfWeek: unknown[];
  isRoundTrip: boolean;
  difficultyConfig?: DifficultyConfig;
}) {
  return estimateScheduleFinancials(input).weeklyRevenue;
}

export function estimateScheduleWeeklyProfit(input: {
  route: Route;
  model: AircraftModel;
  aircraft: CabinAircraft | CabinLayout;
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
  aircraft: CabinAircraft | CabinLayout,
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
  aircraft: CabinAircraft | CabinLayout;
  daysOfWeek: unknown[];
  isRoundTrip: boolean;
  difficultyConfig?: DifficultyConfig;
  departureTimeLocal?: string;
  referenceGameTimeMs?: number;
}) {
  const reference = input.referenceGameTimeMs ?? Date.UTC(2026, 0, 1);
  const days = [...new Set(input.daysOfWeek.filter((day): day is number => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6))];
  const departures = days.map((day) => {
    let time = weekStartMs(reference) + day * DAY_MS + timeOfDayMs(input.departureTimeLocal ?? "12:00");
    if (time < reference) time += WEEK_MS;
    return time;
  });
  const seed = stableSeed(input.route.id.length + input.model.id.length);
  const estimateLeg = (departure: number, originAirportId: string) => estimateFlightFinancials(input.route, input.model, input.aircraft, seed,
    input.difficultyConfig, input.departureTimeLocal ? { departureGameTimeMs: departure, originAirportId } : undefined);
  const estimates = departures.flatMap((departure) => {
    const outbound = estimateLeg(departure, input.route.originAirportId);
    if (!input.isRoundTrip) return [outbound];
    const returning = departure + input.route.distanceKm / input.model.cruiseSpeedKmh * 3_600_000 + input.model.turnaroundMinutes * 60_000;
    return [outbound, estimateLeg(returning, input.route.destinationAirportId)];
  });
  const perFlight = estimates[0] ?? estimateExpectedFlightProfit(input.route, input.model, input.aircraft, input.difficultyConfig);
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
