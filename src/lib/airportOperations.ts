import { airportsById } from "@/data/airports";
import { DAY_MS, WEEK_MS, flightWaitMs, timeOfDayMs, turnaroundWaitMs, weekStartMs } from "@/lib/time";
import type { AircraftModel, DayOfWeek, Route } from "@/types/game";

const formatters = new Map<string, Intl.DateTimeFormat>();
export function airportLocalMinutes(airportId: string, time: number) {
  if (!Number.isFinite(time)) return NaN;
  const zone = airportsById[airportId]?.timeZone ?? "UTC";
  if (!formatters.has(zone)) formatters.set(zone, new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }));
  const parts = formatters.get(zone)!.formatToParts(time);
  return Number(parts.find((part) => part.type === "hour")?.value) * 60 +
    Number(parts.find((part) => part.type === "minute")?.value);
}

export function nightPassengerDemandMultiplier(distanceKm: number, airportId: string, departure?: number) {
  if (departure === undefined || !Number.isFinite(departure) || distanceKm > 1500) return 1;
  const minute = airportLocalMinutes(airportId, departure);
  // Gameplay tuning, not measured traffic data. Cargo and long-haul demand are unchanged.
  return minute >= 23 * 60 || minute < 6 * 60 ? 0.85 : 1;
}

export type AirportOperatingIssue = { airportId: string; localTime: string; blocking: boolean };
export function flightAirportIssues(originId: string, destinationId: string, departure: number, arrival: number): AirportOperatingIssue[] {
  return [{ id: originId, time: departure, departure: true }, { id: destinationId, time: arrival, departure: false }]
    .flatMap((leg) => {
      const minute = airportLocalMinutes(leg.id, leg.time);
      const blocking = leg.id === "fra" && (minute >= 23 * 60 || minute < 5 * 60);
      const advisory = leg.id === "lhr" && (leg.departure ? minute >= 23 * 60 || minute < 6 * 60 :
        minute >= 23 * 60 + 30 || minute < 4 * 60 + 30);
      if (!blocking && !advisory) return [];
      return [{ airportId: leg.id, blocking,
        localTime: String(Math.floor(minute / 60)).padStart(2, "0") + ":" + String(minute % 60).padStart(2, "0") }];
    });
}

export function weeklyAirportIssues(input: {
  route: Route; model: AircraftModel; daysOfWeek: DayOfWeek[]; departureTimeLocal: string;
  isRoundTrip: boolean; referenceGameTimeMs: number;
}) {
  const issues: AirportOperatingIssue[] = [];
  const duration = flightWaitMs(input.route.distanceKm, input.model.cruiseSpeedKmh);
  const start = weekStartMs(input.referenceGameTimeMs);
  for (let week = start - WEEK_MS; week <= start + WEEK_MS * 2; week += WEEK_MS) {
    for (const day of input.daysOfWeek) {
      // Existing timetable input is UTC despite its legacy field name; do not shift old saves.
      const departure = week + day * DAY_MS + timeOfDayMs(input.departureTimeLocal);
      if (departure < input.referenceGameTimeMs || departure > input.referenceGameTimeMs + WEEK_MS * 2) continue;
      issues.push(...flightAirportIssues(input.route.originAirportId, input.route.destinationAirportId, departure, departure + duration));
      if (input.isRoundTrip) {
        const returning = departure + duration + turnaroundWaitMs(input.model.turnaroundMinutes);
        issues.push(...flightAirportIssues(input.route.destinationAirportId, input.route.originAirportId, returning, returning + duration));
      }
    }
  }
  return issues;
}
