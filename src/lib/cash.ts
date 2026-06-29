import type { GameState } from "@/types/game";

export function getCurrentCash(game: Pick<GameState, "money">) {
  return game.money;
}

export function updateCash<T extends Pick<GameState, "money">>(game: T, newCash: number): T {
  return {
    ...game,
    money: Math.max(0, Math.round(newCash))
  };
}

export function addCash<T extends Pick<GameState, "money">>(game: T, amount: number): T {
  return updateCash(game, game.money + amount);
}

export function canAfford(game: Pick<GameState, "money">, cost: number) {
  return getCurrentCash(game) >= cost;
}

export function spendCash<T extends Pick<GameState, "money">>(game: T, cost: number): T {
  return updateCash(game, game.money - cost);
}
