// Gameplay coefficients, not measured passenger traffic or real airline tariffs.
export const ROUTE_MARKET = {
  version: 2,
  windowHours: 4,
  shortDistanceKm: 250,
  longDistanceStartKm: 3500,
  longDistanceDecayKm: 14000,
  maxPassengerDiscountBoost: 1.6,
  maxCargoDiscountBoost: 1.35,
  retainedDays: 2,
  // Relative local-hour preference. Long-haul blends toward a flatter profile.
  hourlyPreference: [0.32, 0.26, 0.22, 0.22, 0.3, 0.55, 0.95, 1.2, 1.3, 1.2, 1.15, 1.1,
    1.1, 1.1, 1.15, 1.2, 1.3, 1.4, 1.4, 1.25, 1.05, 0.85, 0.6, 0.4],
  elasticity: { first: 0.9, business: 0.85, premiumEconomy: 1.2, economy: 1.55, cargo: 1.1 }
} as const;

export function hourlyPassengerPreference(distanceKm: number, hour: number) {
  const index = ((Math.floor(hour) % 24) + 24) % 24;
  const blend = Math.min(0.65, Math.max(0, distanceKm - 1500) / 11000);
  return ROUTE_MARKET.hourlyPreference[index] * (1 - blend) + 0.95 * blend;
}
