"use client";

import { useSyncExternalStore } from "react";
import { isBackgroundTick, useGameStore } from "@/store/gameStore";
import type { GameState } from "@/types/game";

// The simulation writes a new game object every second. Operating panels are large and mostly
// show data that changes on events, so they follow the clock at a slower rate and still react
// at once to anything the player does or any flight that settles.
const PANEL_REFRESH_MS = 3000;

let snapshot: GameState | null = null;
let publishedAt = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let connected = false;
const listeners = new Set<() => void>();

function publish() {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  publishedAt = Date.now();
  const next = useGameStore.getState().game;
  if (next === snapshot) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function connect() {
  if (connected) return;
  connected = true;
  snapshot = useGameStore.getState().game;
  useGameStore.subscribe((state, previous) => {
    const game = state.game;
    const before = previous.game;
    if (game === before || listeners.size === 0) return;
    const eventful = !isBackgroundTick() || !game || !before || game.completedFlights !== before.completedFlights ||
      game.money !== before.money || game.gameStatus !== before.gameStatus;
    const wait = PANEL_REFRESH_MS - (Date.now() - publishedAt);
    if (eventful || wait <= 0) publish();
    else if (timer === null) timer = setTimeout(publish, wait);
  });
}

function subscribe(listener: () => void) {
  connect();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function current() {
  // With no panel mounted there is nothing to keep steady, so hand out the live state.
  if (listeners.size === 0) snapshot = useGameStore.getState().game;
  return snapshot;
}

/** Game state for workspace panels: immediate on player actions and settled flights, otherwise refreshed every few seconds. */
export function usePanelGame(): GameState | null {
  return useSyncExternalStore(subscribe, current, () => null);
}
