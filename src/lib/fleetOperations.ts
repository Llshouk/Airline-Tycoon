import { advanceAircraftOperations } from "@/lib/aircraftOperations";
import { applyCompanyGrowth, normalizeCompanyGrowth } from "@/lib/companyGrowth";
import { applyFinanceEvents, normalizeFinancialHistory } from "@/lib/financialReports";
import { createMarketAllocator } from "@/lib/routeMarket";
import type { AircraftInstance, GameState } from "@/types/game";
import type { FinanceEvent } from "@/types/finance";

function nextOperationTime(aircraft: AircraftInstance, after: number) {
  let next = Infinity;
  for (const item of aircraft.schedule) {
    const time = item.status === "in-flight" ? item.arrivalGameTime :
      item.status === "scheduled" && item.operationalStatus !== "grounded" ? item.departureGameTime : Infinity;
    if (time > after) next = Math.min(next, time);
  }
  for (const time of [aircraft.lifecycle?.maintenance?.completesGameTimeMs,
    aircraft.lifecycle?.reservation?.state === "scheduled" ? aircraft.lifecycle.reservation.startsAfterGameTimeMs : undefined]) {
    if (time !== undefined && time > after) next = Math.min(next, time);
  }
  return next;
}

/** Reuses the aircraft engine, but advances departures/arrivals across the fleet in time order. */
export function advanceFleetOperations(input: GameState, from: number, to: number) {
  let game: GameState = { ...input, currentGameTimeMs: from, fleet: [...input.fleet],
    companyGrowth: normalizeCompanyGrowth(input.companyGrowth, { ...input, currentGameTimeMs: from }) };
  const market = createMarketAllocator(game);
  const allEvents: FinanceEvent[] = [];
  const nextTimes = new Map<number, number>();
  const indexes = game.fleet.map((_, index) => index).sort((a, b) => game.fleet[a].id.localeCompare(game.fleet[b].id));
  function advance(indices: number[], time: number) {
    const events: FinanceEvent[] = [];
    const entries = [];
    let cashChange = 0;
    for (const index of indices) {
      const operation = advanceAircraftOperations(game.fleet[index], game.routes, time, game.difficultyConfig,
        game.money + cashChange, market.book);
      game.fleet[index] = operation.aircraft;
      market.replaceAircraft(operation.aircraft);
      events.push(...operation.financeEvents);
      entries.push(...operation.entries);
      cashChange += operation.entries.reduce((sum, entry) => sum + entry.profit, 0) - operation.maintenanceCashCost;
      nextTimes.set(index, nextOperationTime(operation.aircraft, time));
    }
    game = { ...game, currentGameTimeMs: time, money: game.money + cashChange, totalProfit: game.totalProfit + cashChange,
      completedFlights: game.completedFlights + entries.length,
      passengerCount: game.passengerCount + entries.reduce((sum, entry) => sum + entry.passengerCount, 0),
      cargoTransportedTons: Math.round((game.cargoTransportedTons + entries.reduce((sum, entry) => sum + entry.cargoTons, 0)) * 10) / 10,
      flightLog: [...entries.sort((a, b) => b.completedGameTime - a.completedGameTime), ...game.flightLog].slice(0, 60),
      expandedAirportIds: [...new Set([...game.expandedAirportIds, ...entries.map((entry) => entry.destinationAirportId)])] };
    if (events.length) {
      game.financialHistory = applyFinanceEvents(game.financialHistory ?? normalizeFinancialHistory(undefined, from, input.money), events, time);
      // Same-time arrivals are one growth batch: checkpointing must not discard ties.
      game = applyCompanyGrowth(game, events);
      allEvents.push(...events);
    }
  }
  advance(indexes, from);
  for (;;) {
    const next = Math.min(...nextTimes.values());
    if (!Number.isFinite(next) || next > to) break;
    advance(indexes.filter((index) => nextTimes.get(index) === next), next);
  }
  advance(indexes, to);
  game = applyCompanyGrowth({ ...game, routeMarket: market.state(to) }, []);
  return { game, events: allEvents };
}
