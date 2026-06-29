import type { GameState } from "@/types/game";

type LegacyCashFields = {
  cash?: unknown;
  capital?: unknown;
  playerMoney?: unknown;
  airline?: {
    cash?: unknown;
    money?: unknown;
  };
};

export type CashState = Pick<GameState, "money"> & LegacyCashFields;

export function getCurrentCash(game: CashState) {
  return firstValidCashValue(game.money, game.cash, game.capital, game.playerMoney, game.airline?.cash, game.airline?.money);
}

export function normalizeCashAmount(value: unknown) {
  return Math.max(0, Math.round(toFiniteNumber(value) ?? 0));
}

export function updateCash<T extends CashState>(game: T, newCash: number): T {
  return {
    ...game,
    money: normalizeCashAmount(newCash)
  };
}

export function addCash<T extends CashState>(game: T, amount: number): T {
  return updateCash(game, getCurrentCash(game) + normalizeCashAmount(amount));
}

export function canAfford(game: CashState, cost: number) {
  return getCurrentCash(game) >= normalizeCashAmount(cost);
}

export function spendCash<T extends CashState>(game: T, cost: number): T {
  return updateCash(game, getCurrentCash(game) - normalizeCashAmount(cost));
}

function firstValidCashValue(...values: unknown[]) {
  for (const value of values) {
    const numberValue = toFiniteNumber(value);
    if (numberValue !== null) return normalizeCashAmount(numberValue);
  }
  return 0;
}

function toFiniteNumber(value: unknown) {
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numberValue) ? numberValue : null;
}
