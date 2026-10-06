import { aircraftById } from "@/data/aircraft";
import { generateOperationalDelayMinutes } from "@/lib/aircraftOperations";
import { createId } from "@/lib/ids";
import { nextFlightNumber } from "@/lib/schedule";
import { DAY_MS, WEEK_MS, flightWaitMs, turnaroundWaitMs, timeOfDayMs, weekStartMs } from "@/lib/time";
import type { AircraftInstance, DayOfWeek, Route, ScheduleItem } from "@/types/game";

export function generateWeeklyEvents(aircraft: AircraftInstance, routes: Route[], fromGameTime: number, toGameTime: number) {
  const events: ScheduleItem[] = [];
  const start = weekStartMs(fromGameTime) - WEEK_MS;
  const end = weekStartMs(toGameTime) + WEEK_MS;

  for (let week = start; week <= end; week += WEEK_MS) {
    aircraft.weeklySchedules.forEach((weekly) => {
      const route = routes.find((item) => item.id === weekly.routeId);
      const model = aircraftById[aircraft.modelId];
      if (!route || !model) return;
      weekly.daysOfWeek.forEach((day) => {
        const departure = week + day * DAY_MS + timeOfDayMs(weekly.departureTimeLocal);
        if (departure < weekly.createdGameTime || departure < fromGameTime || departure > toGameTime) return;
        const outbound = createFlightItem({
          aircraft,
          route,
          model,
          originAirportId: route.originAirportId,
          destinationAirportId: route.destinationAirportId,
          departureGameTime: departure,
          weeklyScheduleId: weekly.id,
          operatingDay: day,
          flightNumber: weekly.outboundFlightNumber,
          legType: "outbound",
          fixedId: `${weekly.id}-${departure}-out`
        });
        events.push(outbound);
        if (weekly.isRoundTrip) {
          events.push(
            createFlightItem({
              aircraft,
              route,
              model,
              originAirportId: route.destinationAirportId,
              destinationAirportId: route.originAirportId,
              departureGameTime: outbound.readyGameTime,
              weeklyScheduleId: weekly.id,
              operatingDay: day,
              flightNumber: weekly.returnFlightNumber ?? nextFlightNumber(weekly.outboundFlightNumber),
              legType: "return",
              fixedId: `${weekly.id}-${departure}-return`
            })
          );
        }
      });
    });
  }

  return events;
}

export function createFlightItem(input: {
  aircraft: AircraftInstance;
  route: Route;
  model: NonNullable<(typeof aircraftById)[string]>;
  originAirportId: string;
  destinationAirportId: string;
  departureGameTime: number;
  weeklyScheduleId?: string;
  operatingDay?: DayOfWeek;
  flightNumber?: string;
  legType?: "outbound" | "return";
  fixedId?: string;
}): ScheduleItem {
  const arrivalGameTime = input.departureGameTime + flightWaitMs(input.route.distanceKm, input.model.cruiseSpeedKmh);
  return {
    id: input.fixedId ?? createId("flight"),
    weeklyScheduleId: input.weeklyScheduleId,
    routeId: input.route.id,
    aircraftId: input.aircraft.id,
    flightNumber: input.flightNumber,
    legType: input.legType,
    originAirportId: input.originAirportId,
    destinationAirportId: input.destinationAirportId,
    scheduledDepartureGameTime: input.departureGameTime,
    scheduledArrivalGameTime: arrivalGameTime,
    actualDepartureGameTime: input.departureGameTime,
    actualArrivalGameTime: arrivalGameTime,
    baseDelayMinutes: generateOperationalDelayMinutes(input.fixedId ?? `${input.aircraft.id}-${input.departureGameTime}`),
    delayMinutes: 0,
    operationalStatus: "onTime",
    departureGameTime: input.departureGameTime,
    arrivalGameTime,
    readyGameTime: arrivalGameTime + turnaroundWaitMs(input.model.turnaroundMinutes),
    status: "scheduled",
    isRecurring: Boolean(input.weeklyScheduleId),
    operatingDay: input.operatingDay
  };
}

export function mergeGeneratedEvents(existing: ScheduleItem[], generated: ScheduleItem[]) {
  const byId = new Map(existing.map((item) => [item.id, item]));
  generated.forEach((item) => {
    if (!byId.has(item.id)) byId.set(item.id, item);
  });
  return Array.from(byId.values()).sort((a, b) => a.departureGameTime - b.departureGameTime);
}
