import { airportsById } from "@/data/airports";
import { ROUTE_MARKET, hourlyPassengerPreference } from "@/config/routeMarket";
import { DAY_MS, WEEK_MS, flightWaitMs, timeOfDayMs, turnaroundWaitMs, weekStartMs } from "@/lib/time";
import type { AircraftModel, DayOfWeek, Route } from "@/types/game";

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();
const zoneOffsets = new Map<string, Map<number, number | null>>();

function measureZoneOffsetMinutes(zone: string, time: number) {
  if (!zoneFormatters.has(zone)) zoneFormatters.set(zone, new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }));
  const parts: Record<string, number> = {};
  for (const part of zoneFormatters.get(zone)!.formatToParts(time)) if (part.type !== "literal") parts[part.type] = Number(part.value);
  const local = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((local - Math.floor(time / 1000) * 1000) / 60_000);
}

/**
 * Minutes to add to UTC for an IANA zone. Intl formatting is far too slow for the simulation loop,
 * which asks this for every pending flight, so the offset is measured once per zone and UTC day.
 * A day containing a clock change is not cached and is measured exactly each time.
 */
export function zoneOffsetMinutes(zone: string, time: number) {
  if (zone === "UTC") return 0;
  const day = Math.floor(time / DAY_MS);
  let days = zoneOffsets.get(zone);
  if (!days) zoneOffsets.set(zone, days = new Map());
  let cached = days.get(day);
  if (cached === undefined) {
    if (days.size > 4000) days.clear();
    const start = measureZoneOffsetMinutes(zone, day * DAY_MS);
    cached = start === measureZoneOffsetMinutes(zone, (day + 1) * DAY_MS - 1) ? start : null;
    days.set(day, cached);
  }
  return cached ?? measureZoneOffsetMinutes(zone, time);
}

export function airportTimeZone(airportId: string) {
  return airportsById[airportId]?.timeZone ?? "UTC";
}

export function airportLocalMinutes(airportId: string, time: number) {
  if (!Number.isFinite(time)) return NaN;
  const local = time + zoneOffsetMinutes(airportTimeZone(airportId), time) * 60_000;
  return Math.floor((((local % DAY_MS) + DAY_MS) % DAY_MS) / 60_000);
}

const localDateTexts = new Map<number, string>();
/** Local calendar date as YYYY-MM-DD. Saved route-market window keys contain this exact text. */
export function airportLocalDate(airportId: string, time: number) {
  const day = Math.floor((time + zoneOffsetMinutes(airportTimeZone(airportId), time) * 60_000) / DAY_MS);
  let text = localDateTexts.get(day);
  if (text === undefined) {
    if (localDateTexts.size > 4000) localDateTexts.clear();
    localDateTexts.set(day, text = new Date(day * DAY_MS).toISOString().slice(0, 10));
  }
  return text;
}

export function nightPassengerDemandMultiplier(distanceKm: number, airportId: string, departure?: number) {
  if (departure === undefined || !Number.isFinite(departure)) return 1;
  const minute = airportLocalMinutes(airportId, departure);
  // Night penalty is weaker on long-haul, where overnight services are common.
  if (minute < 23 * 60 && minute >= 6 * 60) return 1;
  const start = Math.floor(minute / (ROUTE_MARKET.windowHours * 60)) * ROUTE_MARKET.windowHours;
  const weight = (hour: number) => Array.from({ length: ROUTE_MARKET.windowHours }, (_, index) => hourlyPassengerPreference(distanceKm, hour + index)).reduce((sum, value) => sum + value, 0);
  return Math.min(1, weight(start) / weight(12));
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
