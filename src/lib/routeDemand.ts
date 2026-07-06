import type { CabinDemand, CabinLayout, GameState, Route } from "@/types/game";
import { estimatePriceAdjustedDemand } from "@/lib/economy";
import { calculateCabinDemandByDistance } from "@/lib/demand";
import { airportsById } from "@/data/airports";

const CABIN_KEYS = ["first", "business", "premiumEconomy", "economy"] as const;

export type RemainingDemandSummary = {
  route: Route;
  totalDemand: CabinDemand;
  usedDemand: CabinDemand;
  remainingDemand: CabinDemand;
  oversupplyDemand: CabinDemand;
  warnings: string[];
};

export type ScheduleDemandPreview = RemainingDemandSummary & {
  previewDemand: CabinDemand;
  remainingAfterPreview: CabinDemand;
  oversupplyAfterPreview: CabinDemand;
};

export function calculateAdjustedRouteDemand(route: Route) {
  const origin = airportsById[route.originAirportId];
  const destination = airportsById[route.destinationAirportId];
  return calculateCabinDemandByDistance({
    routeDistanceKm: route.distanceKm,
    originAirport: origin,
    destinationAirport: destination,
    baseDemand: estimatePriceAdjustedDemand(route)
  });
}

export function calculateScheduledCapacityForRoute(routeId: string, game: GameState, excludeWeeklyScheduleId?: string): CabinDemand {
  const capacity = emptyDemand();

  game.fleet.forEach((aircraft) => {
    aircraft.weeklySchedules
      .filter((schedule) => schedule.routeId === routeId && schedule.id !== excludeWeeklyScheduleId)
      .forEach((schedule) => {
        addLayoutCapacity(capacity, aircraft.cabinLayout, schedule.daysOfWeek.length * (schedule.isRoundTrip ? 2 : 1));
      });

    aircraft.schedule
      .filter((item) => item.routeId === routeId && !item.weeklyScheduleId && item.status !== "completed")
      .forEach(() => addLayoutCapacity(capacity, aircraft.cabinLayout, 1));
  });

  return roundDemand(capacity);
}

export function calculateRemainingDemand(routeId: string, game: GameState): RemainingDemandSummary | null {
  const route = game.routes.find((item) => item.id === routeId);
  if (!route) return null;

  // Route estimatedDemand is already a 7-day weekly market; do not multiply by seven here.
  const totalDemand = calculateAdjustedRouteDemand(route);
  const usedDemand = calculateScheduledCapacityForRoute(routeId, game);
  const remainingDemand = subtractDemand(totalDemand, usedDemand, "remaining");
  const oversupplyDemand = subtractDemand(usedDemand, totalDemand, "oversupply");
  const warnings = demandWarnings(totalDemand, usedDemand, remainingDemand, oversupplyDemand);

  return { route, totalDemand, usedDemand, remainingDemand, oversupplyDemand, warnings };
}

export function calculatePreviewCapacity(layout: CabinLayout, daysOfWeekCount: number, isRoundTrip: boolean): CabinDemand {
  const capacity = emptyDemand();
  addLayoutCapacity(capacity, layout, daysOfWeekCount * (isRoundTrip ? 2 : 1));
  return roundDemand(capacity);
}

export function calculateRemainingDemandForSchedulePreview(
  routeId: string,
  game: GameState,
  previewLayout: CabinLayout,
  daysOfWeekCount: number,
  isRoundTrip: boolean,
  excludeWeeklyScheduleId?: string
): ScheduleDemandPreview | null {
  const route = game.routes.find((item) => item.id === routeId);
  if (!route) return null;

  const totalDemand = calculateAdjustedRouteDemand(route);
  const usedDemand = calculateScheduledCapacityForRoute(routeId, game, excludeWeeklyScheduleId);
  const previewDemand = calculatePreviewCapacity(previewLayout, daysOfWeekCount, isRoundTrip);
  const usedWithPreview = addDemand(usedDemand, previewDemand);
  const remainingDemand = subtractDemand(totalDemand, usedDemand, "remaining");
  const oversupplyDemand = subtractDemand(usedDemand, totalDemand, "oversupply");
  const remainingAfterPreview = subtractDemand(totalDemand, usedWithPreview, "remaining");
  const oversupplyAfterPreview = subtractDemand(usedWithPreview, totalDemand, "oversupply");
  const warnings = demandWarnings(totalDemand, usedWithPreview, remainingAfterPreview, oversupplyAfterPreview);

  return {
    route,
    totalDemand,
    usedDemand,
    previewDemand,
    remainingDemand,
    oversupplyDemand,
    remainingAfterPreview,
    oversupplyAfterPreview,
    warnings
  };
}

function addLayoutCapacity(target: CabinDemand, layout: CabinLayout, flights: number) {
  CABIN_KEYS.forEach((key) => {
    target[key] += layout[key] * flights;
  });
  target.cargoTons += layout.cargoTons * flights;
}

function addDemand(a: CabinDemand, b: CabinDemand) {
  const result = emptyDemand();
  CABIN_KEYS.forEach((key) => {
    result[key] = a[key] + b[key];
  });
  result.cargoTons = a.cargoTons + b.cargoTons;
  return roundDemand(result);
}

function demandWarnings(total: CabinDemand, used: CabinDemand, remaining: CabinDemand, oversupply: CabinDemand) {
  const warnings: string[] = [];
  const premiumTotal = total.first + total.business + total.premiumEconomy;
  const premiumRemaining = remaining.first + remaining.business + remaining.premiumEconomy;
  const hasOversupply = CABIN_KEYS.some((key) => oversupply[key] > 0) || oversupply.cargoTons > 0;

  if (premiumRemaining > Math.max(10, premiumTotal * 0.25)) warnings.push("Unsatisfied premium demand");
  if (used.economy > 0 && remaining.economy <= Math.max(6, total.economy * 0.15)) warnings.push("Economy demand mostly covered");
  if (remaining.cargoTons > Math.max(2, total.cargoTons * 0.25)) warnings.push("Cargo opportunity remains");
  if (hasOversupply) warnings.push("Oversupplied route");

  return warnings;
}

function subtractDemand(a: CabinDemand, b: CabinDemand, mode: "remaining" | "oversupply") {
  const result = emptyDemand();
  CABIN_KEYS.forEach((key) => {
    result[key] = Math.max(a[key] - b[key], 0);
  });
  result.cargoTons = Math.max(a.cargoTons - b.cargoTons, 0);
  return mode === "remaining" ? roundDemand(result) : roundDemand(result);
}

function emptyDemand(): CabinDemand {
  return { first: 0, business: 0, premiumEconomy: 0, economy: 0, cargoTons: 0 };
}

function roundDemand(demand: CabinDemand): CabinDemand {
  return {
    first: Math.round(demand.first),
    business: Math.round(demand.business),
    premiumEconomy: Math.round(demand.premiumEconomy),
    economy: Math.round(demand.economy),
    cargoTons: Math.round(demand.cargoTons * 10) / 10
  };
}
