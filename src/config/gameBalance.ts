// V1 uses gameplay-balanced economics rather than exact real-world airline margins.
// Tune these constants to make good route/aircraft/pricing decisions rewarding.
export const ENABLE_GAME_CONSOLE = true;

export const GAME_BALANCE = {
  passengerDemandMultiplier: 1.6,
  premiumDemandMultiplier: 1.35,
  cargoDemandMultiplier: 1.5,
  revenueMultiplier: 3.15,
  longHaulRevenueBonus: 1.2,
  majorHubDemandBonus: 1.25,
  costMultiplier: 0.03,
  minLoadFactor: 0.58,
  maxLoadFactor: 0.96
} as const;

export const GAME_REVENUE_MULTIPLIER = GAME_BALANCE.revenueMultiplier;
export const COST_BALANCE_MULTIPLIER = GAME_BALANCE.costMultiplier;

export const PRICE_ELASTICITY = {
  first: 2.2,
  business: 1.8,
  premiumEconomy: 1.4,
  economy: 1.1,
  cargo: 1.2
} as const;
