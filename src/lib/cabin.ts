import type { AircraftModel, CabinClass, CabinLayout, Route } from "@/types/game";

export const CABIN_CLASSES: CabinClass[] = ["first", "business", "premiumEconomy", "economy"];

const spaceWeights: Record<CabinClass, number> = {
  first: 2.5,
  business: 1.6,
  premiumEconomy: 1.15,
  economy: 1
};

const visualSpaceWeights: Record<CabinClass, number> = {
  first: 4,
  business: 2.5,
  premiumEconomy: 1.4,
  economy: 1
};

export function layoutSeatEquivalent(layout: CabinLayout) {
  return Math.round(
    layout.first * spaceWeights.first +
      layout.business * spaceWeights.business +
      layout.premiumEconomy * spaceWeights.premiumEconomy +
      layout.economy * spaceWeights.economy
  );
}

export function totalPassengerSeats(layout: CabinLayout) {
  return layout.first + layout.business + layout.premiumEconomy + layout.economy;
}

export function cabinVisualSpaceUnits(layout: CabinLayout, cabin: CabinClass) {
  return Math.max(0, layout[cabin]) * visualSpaceWeights[cabin];
}

export function getVisibleCabinSegments(layout: CabinLayout) {
  const visible = CABIN_CLASSES.map((cabin) => ({
    cabin,
    seats: Math.max(0, layout[cabin]),
    spaceUnits: cabinVisualSpaceUnits(layout, cabin)
  })).filter((segment) => segment.seats > 0 && segment.spaceUnits > 0);
  const totalSpaceUnits = visible.reduce((sum, segment) => sum + segment.spaceUnits, 0);

  return visible.map((segment) => ({
    ...segment,
    widthPercent: totalSpaceUnits > 0 ? (segment.spaceUnits / totalSpaceUnits) * 100 : 0
  }));
}

export function availableCargoTons(model: AircraftModel, layout: CabinLayout) {
  const usedSeatSpace = layoutSeatEquivalent(layout);
  const seatSpaceRatio = Math.min(1, usedSeatSpace / model.maxPassengerSeats);
  return Math.max(0, Math.round(model.maxCargoTons * (1 - seatSpaceRatio * 0.45) * 10) / 10);
}

export function estimateConfiguredPrice(model: AircraftModel, layout: CabinLayout) {
  const premiumFitOut =
    layout.first * 750000 +
    layout.business * 320000 +
    layout.premiumEconomy * 90000 +
    layout.economy * 18000;
  const cargoFitOut = layout.cargoTons * 120000;
  return Math.round(model.estimatedPriceGBP + premiumFitOut + cargoFitOut);
}

export function getDefaultCabinConfig(model: AircraftModel) {
  return normalizeCabinLayout(model, model.suggestedLayout);
}

export function getMaxSeatCabinConfig(model: AircraftModel) {
  const layout = normalizeCabinLayout(model, {
    first: model.cabinLimits.first.min,
    business: model.cabinLimits.business.min,
    premiumEconomy: model.cabinLimits.premiumEconomy.min,
    economy: model.cabinLimits.economy.min,
    cargoTons: 0
  });

  for (const cabin of ["economy", "premiumEconomy", "business", "first"] as CabinClass[]) {
    if (model.type === "narrowbody" && cabin === "first") continue;
    while (layout[cabin] < model.cabinLimits[cabin].max) {
      const candidate = { ...layout, [cabin]: layout[cabin] + 1 };
      if (layoutSeatEquivalent(candidate) > model.maxPassengerSeats) break;
      layout[cabin] = candidate[cabin];
    }
  }

  return normalizeCabinLayout(model, { ...layout, cargoTons: availableCargoTons(model, layout) });
}

export function normalizeCabinLayout(model: AircraftModel, layout: CabinLayout): CabinLayout {
  const normalized: CabinLayout = {
    first: normalizeSeatCount(layout.first),
    business: normalizeSeatCount(layout.business),
    premiumEconomy: normalizeSeatCount(layout.premiumEconomy),
    economy: normalizeSeatCount(layout.economy),
    cargoTons: normalizeCargo(layout.cargoTons)
  };

  if (model.type === "narrowbody") normalized.first = 0;

  CABIN_CLASSES.forEach((cabin) => {
    normalized[cabin] = clamp(normalized[cabin], model.cabinLimits[cabin].min, model.cabinLimits[cabin].max);
  });

  reduceUntilValidSeatSpace(model, normalized);
  normalized.cargoTons = Math.min(normalized.cargoTons, availableCargoTons(model, normalized));
  normalized.cargoTons = Math.round(normalized.cargoTons * 10) / 10;

  return normalized;
}

export function validateCabinLayout(model: AircraftModel, layout: CabinLayout) {
  const errors: string[] = [];
  const warnings: string[] = [];

  CABIN_CLASSES.forEach((cabin) => {
    const seats = layout[cabin];
    const limit = model.cabinLimits[cabin];
    if (!Number.isFinite(seats) || seats < 0) errors.push(`${label(cabin)} cannot be negative.`);
    if (seats < limit.min) errors.push(`${label(cabin)} must be at least ${limit.min} seats.`);
    if (seats > limit.max) errors.push(`${label(cabin)} cannot exceed ${limit.max} seats on this aircraft.`);
  });

  if (layout.cargoTons < 0) errors.push("Cargo capacity cannot be negative.");

  const usedSeatSpace = layoutSeatEquivalent(layout);
  const maxCargo = availableCargoTons(model, layout);
  if (usedSeatSpace > model.maxPassengerSeats) {
    errors.push(`Cabin space exceeds the aircraft limit by ${usedSeatSpace - model.maxPassengerSeats} seat-equivalent units.`);
  }
  if (layout.cargoTons > maxCargo) {
    errors.push(`Configured cargo exceeds available capacity of ${maxCargo.toFixed(1)} tonnes.`);
  }
  if (model.type === "narrowbody" && layout.first > 0) {
    errors.push("First Class is not available on this narrow-body configuration.");
  }
  if (model.type === "narrowbody" && layout.business + layout.premiumEconomy > model.maxPassengerSeats * 0.34) {
    warnings.push("This is a premium-heavy narrow-body layout and may struggle on short-haul demand.");
  }
  if (layout.first > 0 && layout.economy < model.maxPassengerSeats * 0.42) {
    warnings.push("Very premium-heavy layouts need strong long-haul hub demand.");
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    totalSeats: totalPassengerSeats(layout),
    seatEquivalent: usedSeatSpace,
    availableCargoTons: maxCargo,
    purchasePriceGBP: estimateConfiguredPrice(model, layout)
  };
}

export function routeSuitabilityHints(model: AircraftModel, layout: CabinLayout, route?: Route) {
  const hints: string[] = [];
  if (!route) {
    hints.push(model.recommendedRouteType === "short-haul" ? "Good narrow-body route fit" : "Best on medium and long-haul routes");
    return hints;
  }

  if (model.rangeKm < route.distanceKm) hints.push("Aircraft range insufficient");
  if (route.distanceKm > 5500 && model.type === "narrowbody") hints.push("Wide-body recommended");
  if (route.distanceKm < 1500 && model.type === "narrowbody") hints.push("Good narrow-body route");
  if (route.estimatedDemand.business > layout.business * 0.85) hints.push("Strong business demand");
  if (route.estimatedDemand.cargoTons > layout.cargoTons * 0.9) hints.push("Good cargo opportunity");
  if (layout.first > route.estimatedDemand.first * 1.8 || layout.business > route.estimatedDemand.business * 1.8) {
    hints.push("Too much premium capacity for this route");
  }
  if (hints.length === 0) hints.push("Balanced aircraft-route fit");
  return hints;
}

function label(cabin: CabinClass) {
  if (cabin === "premiumEconomy") return "Premium Economy";
  return cabin[0].toUpperCase() + cabin.slice(1);
}

function normalizeSeatCount(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function normalizeCargo(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value * 10) / 10) : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function reduceUntilValidSeatSpace(model: AircraftModel, layout: CabinLayout) {
  const reductionOrder: CabinClass[] = ["economy", "premiumEconomy", "business", "first"];

  while (layoutSeatEquivalent(layout) > model.maxPassengerSeats) {
    const cabin = reductionOrder.find((key) => layout[key] > model.cabinLimits[key].min);
    if (!cabin) break;
    layout[cabin] -= 1;
  }
}
