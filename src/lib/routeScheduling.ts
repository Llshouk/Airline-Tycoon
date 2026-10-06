import { aircraftById } from "@/data/aircraft";
import { airportsById } from "@/data/airports";
import { getMaintenanceStatus, normalizeAircraftLifecycle } from "@/lib/aircraftMaintenance";
import { estimateCargoRatePerTon, estimateRouteOpeningCost, estimateTicketPrices } from "@/lib/economy";
import { estimateDemand } from "@/lib/demand";
import { distanceKm, routeIdFor } from "@/lib/geo";
import { maintenancePreview } from "@/lib/maintenancePlanning";
import { generateWeeklyEvents, mergeGeneratedEvents } from "@/lib/recurringFlights";
import { calculateScheduleBlock, createUniqueFlightNumber, timeToMinutes } from "@/lib/schedule";
import { prepareWeeklySchedule } from "@/lib/scheduleActions";
import { DAY_MS, WEEK_MS, dayOfWeekForGameTime, weekStartMs } from "@/lib/time";
import type { AircraftInstance, GameState, Route } from "@/types/game";

export type RouteOpeningPreview = { route: Route; cost: number };
export type RouteAircraftStatus = "available" | "range" | "base" | "grounded" | "maintenance" | "position" | "full" | "curfew";
export type RouteAircraftAvailability = { aircraft: AircraftInstance; status: RouteAircraftStatus; departureGameTime?: number };

export function createRouteOpeningPreview(originId: string, destinationId: string): RouteOpeningPreview | null {
  const origin = airportsById[originId];
  const destination = airportsById[destinationId];
  if (!origin || !destination || originId === destinationId) return null;
  const distance = distanceKm(origin, destination);
  const estimatedTicketPrices = estimateTicketPrices(distance);
  const estimatedCargoRatePerTon = estimateCargoRatePerTon(distance);
  const recommendedPricing = { ...estimatedTicketPrices, cargo: estimatedCargoRatePerTon };
  return { cost: estimateRouteOpeningCost(distance), route: {
    id: routeIdFor(originId, destinationId), originAirportId: originId, originBaseAirportId: originId,
    originIata: origin.iata, destinationAirportId: destinationId, destinationIata: destination.iata,
    distanceKm: distance, estimatedDemand: estimateDemand(origin, destination, distance), estimatedTicketPrices,
    estimatedCargoRatePerTon, recommendedPricing, pricing: recommendedPricing, isOpen: false
  } };
}

export function routeAircraftAvailability(game: GameState, route: Route): RouteAircraftAvailability[] {
  const schedules = game.fleet.flatMap((aircraft) => aircraft.weeklySchedules);
  const outboundFlightNumber = createUniqueFlightNumber("AV101", schedules);
  const returnFlightNumber = createUniqueFlightNumber("AV102", schedules);
  const previewGame = { ...game, routes: [...game.routes.filter((item) => item.id !== route.id), { ...route, isOpen: true }] };
  return game.fleet.map((aircraft): RouteAircraftAvailability => {
    const model = aircraftById[aircraft.modelId];
    const row = (status: RouteAircraftStatus, departureGameTime?: number) => ({ aircraft, status, departureGameTime });
    if (!model || model.rangeKm < route.distanceKm) return row("range");
    if (aircraft.homeBaseAirportId !== route.originAirportId) return row("base");
    const lifecycle = normalizeAircraftLifecycle(aircraft, game.currentGameTimeMs);
    const maintenance = getMaintenanceStatus(lifecycle, game.currentGameTimeMs);
    if (maintenance === "grounded") return row("grounded");
    if (lifecycle.maintenance) return row("maintenance");
    if (!aircraft.weeklySchedules.length && aircraft.currentAirportId !== route.originAirportId &&
      !aircraft.schedule.some((item) => item.status === "in-flight" && item.destinationAirportId === route.originAirportId)) return row("position");

    const duration = calculateScheduleBlock(route, aircraft).roundTripBlockMinutes * 60_000;
    if (duration > WEEK_MS) return row("full");
    const start = game.currentGameTimeMs;
    const end = start + WEEK_MS;
    // Nominal recurring slots remain occupied even if one dated flight was cancelled.
    const generated = generateWeeklyEvents(aircraft, game.routes, start - WEEK_MS, end + WEEK_MS);
    const existing = aircraft.schedule.filter((item) => item.status !== "cancelled" || !item.weeklyScheduleId);
    const calendar = mergeGeneratedEvents(existing, generated).filter((item) => item.status !== "cancelled" && item.readyGameTime > start)
      .sort((a, b) => a.departureGameTime - b.departureGameTime);
    const occupied = calendar.map((item) => ({ start: item.departureGameTime, end: item.readyGameTime }));
    const reservation = lifecycle.reservation;
    if (reservation?.state === "scheduled") {
      const plan = maintenancePreview(aircraft, reservation.kind, start, reservation.afterFlightId);
      if (plan) occupied.push({ start: plan.start, end: plan.end });
    }
    occupied.sort((a, b) => a.start - b.start);
    const gaps: { start: number; end: number }[] = [];
    let cursor = start;
    for (const interval of occupied) {
      if (interval.start > cursor) gaps.push({ start: cursor, end: Math.min(interval.start, end + duration) });
      cursor = Math.max(cursor, interval.end);
      if (cursor >= end + duration) break;
    }
    if (cursor < end + duration) gaps.push({ start: cursor, end: end + duration });

    let status: RouteAircraftStatus = "full";
    for (const gap of gaps) {
      for (let departure = Math.ceil(gap.start / 300_000) * 300_000; departure < end && departure + duration <= gap.end; departure += 300_000) {
        if (recurringConflict(aircraft, game.routes, departure, duration)) continue;
        const previous = calendar.filter((item) => item.arrivalGameTime <= departure).slice(-1)[0];
        if ((previous?.destinationAirportId ?? aircraft.currentAirportId) !== route.originAirportId) { status = "position"; break; }
        const departureTimeLocal = new Date(departure).toISOString().slice(11, 16);
        const result = prepareWeeklySchedule(previewGame, { aircraftId: aircraft.id, routeId: route.id,
          daysOfWeek: [dayOfWeekForGameTime(departure)], departureTimeLocal, isRoundTrip: true,
          outboundFlightNumber, returnFlightNumber, scheduleBaseAirportId: route.originAirportId });
        if (result.ok) return row("available", departure);
        if (result.message.startsWith("Airport curfew:")) { status = "curfew"; continue; }
        if (result.message.includes("expected at") || result.message.startsWith("Position ")) status = "position";
      }
    }
    return row(status);
  }).sort((a, b) => Number(b.status === "available") - Number(a.status === "available") || a.aircraft.registration.localeCompare(b.aircraft.registration));
}

function recurringConflict(aircraft: AircraftInstance, routes: Route[], departure: number, duration: number) {
  const minute = (departure - weekStartMs(departure)) / 60_000;
  const end = minute + duration / 60_000;
  for (const schedule of aircraft.weeklySchedules) {
    const route = routes.find((item) => item.id === schedule.routeId);
    if (!route) continue;
    const block = calculateScheduleBlock(route, aircraft);
    const length = schedule.isRoundTrip ? block.roundTripBlockMinutes : block.oneWayBlockMinutes;
    for (const day of schedule.daysOfWeek) for (const offset of [-WEEK_MS, 0, WEEK_MS]) {
      const start = day * DAY_MS / 60_000 + timeToMinutes(schedule.departureTimeLocal) + offset / 60_000;
      if (minute < start + length && end > start) return true;
    }
  }
  return false;
}
