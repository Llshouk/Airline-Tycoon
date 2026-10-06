import { ROUTE_MARKET } from "@/config/routeMarket";
import { aircraftById } from "@/data/aircraft";
import { estimateFlightFinancials, routePricingFromDefaults } from "@/lib/economy";
import { splitRoundedCost } from "@/lib/financialReports";
import { DEMAND_KEYS, emptyDemand, marketWindow, priceDemandMultiplier, referenceWindowDemand } from "@/lib/marketDemand";
import { DAY_MS } from "@/lib/time";
import type { AircraftInstance, CabinDemand, GameState, Route, ScheduleItem } from "@/types/game";
import type { FlightBooking, RouteMarketState } from "@/types/routeMarket";

export function normalizeRouteMarket(raw: RouteMarketState | undefined, now: number): RouteMarketState {
  const windows = raw?.schemaVersion === 1 && Array.isArray(raw.windows) ? raw.windows : [];
  return { schemaVersion: 1, windows: windows.filter((window) => window && typeof window.key === "string" &&
    Number.isFinite(window.endsGameTimeMs) && window.endsGameTimeMs >= now - ROUTE_MARKET.retainedDays * DAY_MS &&
    window.endsGameTimeMs <= now + DAY_MS).map((window) => {
      const consumed = emptyDemand();
      for (const key of DEMAND_KEYS) consumed[key] = Number.isFinite(window.consumed?.[key]) ? Math.max(0, window.consumed[key]) : 0;
      return { ...window, consumed,
        bookedFlightIds: [...new Set((Array.isArray(window.bookedFlightIds) ? window.bookedFlightIds : []).filter((id) => typeof id === "string"))] };
    }) };
}

export function bookingFromFinancials(result: ReturnType<typeof estimateFlightFinancials>, aircraft: AircraftInstance): FlightBooking {
  return { modelVersion: 2, soldSeats: { first: result.soldSeats.first, business: result.soldSeats.business,
    premiumEconomy: result.soldSeats.premiumEconomy, economy: result.soldSeats.economy },
    passengerCount: result.passengerCount, cargoTons: result.cargoTons, revenue: result.revenue, cost: result.cost, profit: result.profit,
    passengerRevenue: Math.min(result.revenue, Math.round(result.economics.revenue.passengerRevenue)),
    costs: splitRoundedCost(result.cost, [result.economics.estimatedFuelCostPerFlight, result.economics.estimatedCrewCostPerFlight,
      result.economics.estimatedAirportCostPerFlight, result.economics.estimatedMaintenanceReservePerFlight]) as FlightBooking["costs"],
    passengerCapacity: result.economics.passengerCapacity, cargoCapacity: aircraft.cabinLayout.cargoTons,
    nightDemandMultiplier: result.nightDemandMultiplier };
}

type Supply = { aircraftId: string; departure: number; key: string; layout: CabinDemand };

/** One allocator per simulation transaction; the saved ledger is never mutated in place. */
export function createMarketAllocator(game: GameState) {
  const windows = new Map(normalizeRouteMarket(game.routeMarket, game.currentGameTimeMs).windows.map((window) => [window.key, window]));
  const routes = new Map(game.routes.map((route) => [route.id, route]));
  const supply = new Map<string, Map<string, Supply>>();
  const indexed = new Map<string, Supply>();
  const aircraftFlights = new Map<string, Set<string>>();
  function replaceAircraft(aircraft: AircraftInstance) {
    const previous = aircraftFlights.get(aircraft.id) ?? new Set<string>();
    const current = new Set<string>();
    for (const item of aircraft.schedule) {
      const route = routes.get(item.routeId);
      if (!route || item.status === "cancelled" || item.status === "completed" || item.booking || item.operationalStatus === "grounded") continue;
      current.add(item.id);
      const old = indexed.get(item.id);
      if (old && old.departure === item.departureGameTime && old.layout === aircraft.cabinLayout) continue;
      if (old) supply.get(old.key)?.delete(item.id);
      const value = { aircraftId: aircraft.id, departure: item.departureGameTime,
        key: marketWindow(route, item.originAirportId, item.departureGameTime).key, layout: aircraft.cabinLayout };
      indexed.set(item.id, value);
      if (!supply.has(value.key)) supply.set(value.key, new Map());
      supply.get(value.key)!.set(item.id, value);
    }
    for (const id of previous) if (!current.has(id)) {
      const old = indexed.get(id);
      if (old) supply.get(old.key)?.delete(id);
      indexed.delete(id);
    }
    aircraftFlights.set(aircraft.id, current);
  }
  game.fleet.forEach(replaceAircraft);

  function book(aircraft: AircraftInstance, item: ScheduleItem, route: Route): FlightBooking {
    const descriptor = marketWindow(route, item.originAirportId, item.departureGameTime);
    const window = windows.get(descriptor.key) ?? { ...descriptor, consumed: emptyDemand(), bookedFlightIds: [] };
    const base = referenceWindowDemand(route, item.originAirportId, item.departureGameTime);
    const recommended = route.recommendedPricing ?? routePricingFromDefaults(route);
    const prices = route.pricing ?? recommended;
    const allocated = emptyDemand();
    const candidates = [...(supply.get(descriptor.key)?.entries() ?? [])].filter(([id, value]) =>
      id !== item.id && value.departure >= item.departureGameTime && !window.bookedFlightIds.includes(id));
    for (const key of DEMAND_KEYS) {
      const cabin = key === "cargoTons" ? "cargo" : key;
      const multiplier = priceDemandMultiplier(recommended[cabin], prices[cabin], cabin, route.distanceKm);
      const own = Math.max(0, aircraft.cabinLayout[key]);
      const remainingSupply = own + candidates.reduce((sum, [, candidate]) => sum + Math.max(0, candidate.layout[key]), 0);
      const remaining = Math.max(0, base[key] - window.consumed[key]) * multiplier;
      const share = remainingSupply ? own / remainingSupply : 0;
      allocated[key] = key === "cargoTons" ? Math.floor(remaining * share * 10) / 10 : Math.floor(remaining * share);
    }
    const result = estimateFlightFinancials(route, aircraftById[aircraft.modelId], aircraft, item.departureGameTime + item.arrivalGameTime,
      game.difficultyConfig, { departureGameTimeMs: item.departureGameTime, originAirportId: item.originAirportId, allocatedDemand: allocated });
    if (!window.bookedFlightIds.includes(item.id)) {
      for (const key of DEMAND_KEYS) {
        const cabin = key === "cargoTons" ? "cargo" : key;
        const multiplier = priceDemandMultiplier(recommended[cabin], prices[cabin], cabin, route.distanceKm);
        const sold = key === "cargoTons" ? result.cargoTons : result.soldSeats[key];
        if (multiplier > 0) window.consumed[key] += sold / multiplier;
      }
      window.bookedFlightIds.push(item.id);
      windows.set(descriptor.key, window);
    }
    supply.get(indexed.get(item.id)?.key ?? descriptor.key)?.delete(item.id);
    indexed.delete(item.id);
    return bookingFromFinancials(result, aircraft);
  }
  return { book, replaceAircraft,
    state: (now: number) => normalizeRouteMarket({ schemaVersion: 1, windows: [...windows.values()] }, now) };
}
