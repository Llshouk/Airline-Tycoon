// V1 uses gameplay-balanced economics rather than exact real-world airline margins.
// Tune these constants to make good route/aircraft/pricing decisions rewarding.
export const ENABLE_GAME_CONSOLE = true;

export const GAME_BALANCE = {
  // V1 uses gameplay-scaled weekly demand so network planning needs multiple aircraft and frequencies.
  routeDemandScale: 12,
  passengerDemandMultiplier: 1.6,
  premiumDemandMultiplier: 1.35,
  cargoDemandMultiplier: 1.5,
  revenueMultiplier: 1.5,
  longHaulRevenueBonus: 1,
  // Preserve the deliberate sandbox income boost separately from Easy balance.
  simulationRevenueMultiplier: 3.15,
  simulationLongHaulRevenueBonus: 1.2,
  majorHubDemandBonus: 1.25,
  longHaulDemandBonus: 1.25,
  minLoadFactor: 0.58,
  maxLoadFactor: 0.96
} as const;

export const GAME_REVENUE_MULTIPLIER = GAME_BALANCE.revenueMultiplier;
