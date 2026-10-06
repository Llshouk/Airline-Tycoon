import { advanceFleetOperations } from "@/lib/fleetOperations";
import { generateWeeklyEvents, mergeGeneratedEvents } from "@/lib/recurringFlights";
import { DAY_MS } from "@/lib/time";
import type { GameState } from "@/types/game";

/** Explicit preview only. Uses the settlement engine on an isolated save, never the live store. */
export function forecastOperations(game: GameState, days = 7) {
  const horizon = game.currentGameTimeMs + Math.max(0, Math.min(21, days)) * DAY_MS;
  const copy = structuredClone(game);
  copy.fleet = copy.fleet.map((aircraft) => ({ ...aircraft, schedule: mergeGeneratedEvents(aircraft.schedule,
    generateWeeklyEvents(aircraft, copy.routes, game.currentGameTimeMs, horizon)
      .filter((flight) => flight.departureGameTime > (aircraft.operationsThroughGameTimeMs ?? game.currentGameTimeMs))) }));
  const result = advanceFleetOperations(copy, game.currentGameTimeMs, horizon);
  const flights = result.events.filter((event) => event.kind === "flight");
  return { asOfGameTimeMs: game.currentGameTimeMs, throughGameTimeMs: horizon, flights, game: result.game };
}
