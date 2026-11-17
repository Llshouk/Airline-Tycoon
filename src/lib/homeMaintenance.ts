import { aircraftById } from "@/data/aircraft";
import { airportsById } from "@/data/airports";
import { MAINTENANCE_RULES, normalizeAircraftLifecycle } from "@/lib/aircraftMaintenance";
import { distanceKm } from "@/lib/geo";
import { flightWaitMs, turnaroundWaitMs } from "@/lib/time";
import type { AircraftInstance, Route, ScheduleItem } from "@/types/game";

// A timetabled return is only worth waiting for if it leaves soon; otherwise ferry home now
// instead of holding the aircraft (and cancelling its other flights) for days.
const MAX_RETURN_WAIT_MS = 12 * 60 * 60 * 1000;

export function maintenanceFerryRoute(flight: ScheduleItem): Route | undefined {
  if (!flight.isMaintenanceFerry) return;
  const origin = airportsById[flight.originAirportId], destination = airportsById[flight.destinationAirportId];
  if (!origin || !destination) return;
  return { id: flight.routeId, originAirportId: origin.id, destinationAirportId: destination.id,
    distanceKm: distanceKm(origin, destination), isOpen: false,
    estimatedDemand: { first: 0, business: 0, premiumEconomy: 0, economy: 0, cargoTons: 0 },
    estimatedTicketPrices: { first: 0, business: 0, premiumEconomy: 0, economy: 0 }, estimatedCargoRatePerTon: 0 };
}

/** Resolve one return leg without changing the recurring timetable or opening a commercial route. */
export function prepareHomeMaintenance(aircraft: AircraftInstance, now: number): AircraftInstance {
  if (!aircraft.lifecycle?.reservation) return aircraft;
  const lifecycle = normalizeAircraftLifecycle(aircraft, now);
  const plan = lifecycle.reservation;
  const model = aircraftById[aircraft.modelId];
  if (plan?.mode !== "home" || lifecycle.maintenance || !model) return aircraft;
  const retryCash = plan.state === "blocked" && plan.error === "cash";
  const active = aircraft.schedule.find((flight) => flight.status === "in-flight");
  const atBase = !active && aircraft.currentAirportId === aircraft.homeBaseAirportId;
  const ready = Math.max(now, active?.readyGameTime ?? 0);
  const previous = aircraft.schedule.find((flight) => flight.id === plan.afterFlightId && flight.status !== "cancelled" &&
    flight.destinationAirportId === aircraft.homeBaseAirportId &&
    (flight.status !== "scheduled" || flight.isMaintenanceFerry ||
      (lifecycle.condition > MAINTENANCE_RULES.groundingCondition && flight.departureGameTime <= ready + MAX_RETURN_WAIT_MS)));
  const update = (afterFlightId?: string, startsAfterGameTimeMs?: number, ferry?: ScheduleItem): AircraftInstance => ({
    ...aircraft, schedule: ferry ? [...aircraft.schedule, ferry] : aircraft.schedule,
    lifecycle: { ...lifecycle, reservation: { ...plan, afterFlightId, startsAfterGameTimeMs, state: "scheduled", error: undefined } }
  });
  if (previous && !retryCash) return update(previous.id, previous.status === "completed" ? previous.readyGameTime : undefined);
  if (atBase) {
    const ready = Math.max(now, ...aircraft.schedule.filter((flight) => flight.status === "completed").map((flight) => flight.readyGameTime));
    return update(undefined, ready);
  }
  if (active?.destinationAirportId === aircraft.homeBaseAirportId) return update(active.id);
  const originId = active?.destinationAirportId ?? aircraft.currentAirportId;
  const returning = lifecycle.condition > MAINTENANCE_RULES.groundingCondition && aircraft.schedule
    .filter((flight) => flight.status === "scheduled" && !flight.isMaintenanceFerry && flight.originAirportId === originId &&
      flight.destinationAirportId === aircraft.homeBaseAirportId && flight.departureGameTime >= ready &&
      flight.departureGameTime <= ready + MAX_RETURN_WAIT_MS)
    .sort((a, b) => a.departureGameTime - b.departureGameTime)[0];
  if (returning) return update(returning.id);
  const origin = airportsById[originId], base = airportsById[aircraft.homeBaseAirportId];
  if (!origin || !base || distanceKm(origin, base) > model.rangeKm) return {
    ...aircraft, lifecycle: { ...lifecycle, reservation: { ...plan, state: "blocked", error: "return" } }
  };
  const prefix = `maintenance-ferry-${aircraft.id}-${plan.requestedGameTimeMs ?? now}-${originId}`;
  let id = prefix, attempt = 0;
  while (aircraft.schedule.some((flight) => flight.id === id)) id = `${prefix}-${++attempt}`;
  const arrival = ready + flightWaitMs(distanceKm(origin, base), model.cruiseSpeedKmh);
  const ferry: ScheduleItem = { id, aircraftId: aircraft.id, routeId: id, flightNumber: "FERRY",
    originAirportId: originId, destinationAirportId: base.id, departureGameTime: ready, arrivalGameTime: arrival,
    scheduledDepartureGameTime: ready, scheduledArrivalGameTime: arrival, readyGameTime: arrival + turnaroundWaitMs(model.turnaroundMinutes),
    status: "scheduled", isMaintenanceFerry: true, baseDelayMinutes: 0, technicalChecked: true, technicalDelayMinutes: 0 };
  return update(id, undefined, ferry);
}

export function nextPostMaintenanceFlight(aircraft: AircraftInstance, now: number) {
  const end = Math.max(now, aircraft.lifecycle?.maintenance?.completesGameTimeMs ?? 0);
  const airport = aircraft.lifecycle?.recovery?.airportId ?? aircraft.currentAirportId;
  return aircraft.schedule.filter((flight) => flight.status === "scheduled" && !flight.isMaintenanceFerry &&
    (flight.scheduledDepartureGameTime ?? flight.departureGameTime) >= end && flight.originAirportId === airport)
    .sort((a, b) => a.departureGameTime - b.departureGameTime)[0];
}
