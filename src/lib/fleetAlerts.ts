import { aircraftById } from "@/data/aircraft";
import { getMaintenanceStatus, normalizeAircraftLifecycle } from "@/lib/aircraftMaintenance";
import { recentOperatingTotals } from "@/lib/financialReports";
import { DAY_MS } from "@/lib/time";
import type { GameState } from "@/types/game";

export const FLEET_ALERT_FILTERS = ["all", "urgent", "service", "loss", "idle", "arranged"] as const;
export type FleetAlertFilter = typeof FLEET_ALERT_FILTERS[number];
export type FleetAlertKind = Exclude<FleetAlertFilter, "all">;
export type FleetAlert = { aircraftId: string; kinds: FleetAlertKind[]; recentFlights: number; recentProfit: number };

export function fleetAlerts(game: GameState): FleetAlert[] {
  const now = game.currentGameTimeMs;
  const totals = recentOperatingTotals(game.financialHistory, now, "aircraft");
  const routes = new Map(game.routes.filter((route) => route.isOpen).map((route) => [route.id, route]));
  return game.fleet.map((aircraft) => {
    const lifecycle = normalizeAircraftLifecycle(aircraft, now);
    const status = getMaintenanceStatus(lifecycle, now);
    const kinds: FleetAlertKind[] = [];
    if (status === "grounded" || lifecycle.reservation?.state === "blocked") kinds.push("urgent");
    if (lifecycle.maintenance || lifecycle.reservation?.state === "scheduled") kinds.push("arranged");
    else if (status === "soon" || status === "due") kinds.push("service");
    const recent = totals[aircraft.id];
    if (recent && recent.flights >= 5 && recent.profit < 0) kinds.push("loss");
    const model = aircraftById[aircraft.modelId];
    const hasUpcoming = aircraft.schedule.some((leg) => {
      const route = routes.get(leg.routeId);
      const valid = model && route && route.distanceKm <= model.rangeKm &&
        ((leg.originAirportId === route.originAirportId && leg.destinationAirportId === route.destinationAirportId) ||
         (leg.originAirportId === route.destinationAirportId && leg.destinationAirportId === route.originAirportId));
      return valid && ((leg.status === "in-flight" && leg.arrivalGameTime >= now) ||
        (leg.status === "scheduled" && leg.operationalStatus !== "grounded" && leg.originAirportId === aircraft.currentAirportId &&
          leg.departureGameTime >= now && leg.departureGameTime <= now + DAY_MS));
    });
    const lastFlight = aircraft.lastCompletedFlightGameTimeMs ?? Math.max(0, ...aircraft.schedule
      .filter((leg) => leg.status === "completed").map((leg) => leg.arrivalGameTime));
    if (model && !lifecycle.maintenance && !lifecycle.reservation && status !== "grounded" &&
      aircraft.status !== "in-flight" && !hasUpcoming && lastFlight <= now - DAY_MS &&
      lifecycle.acquiredGameTimeMs <= now - DAY_MS) kinds.push("idle");
    return { aircraftId: aircraft.id, kinds, recentFlights: recent?.flights ?? 0, recentProfit: recent?.profit ?? 0 };
  });
}
