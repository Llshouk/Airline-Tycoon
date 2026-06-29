import { aircraftById } from "@/data/aircraft";
import { airportsById } from "@/data/airports";
import { DAY_MS, flightWaitMs, timeOfDayMs, turnaroundWaitMs } from "@/lib/time";
import type { AircraftInstance, DayOfWeek, Route, ScheduleItem, WeeklySchedule } from "@/types/game";

export const DAY_MINUTES = 24 * 60;
export const WEEK_MINUTES = 7 * DAY_MINUTES;

export const weekDays = [
  { id: 0, label: "Monday", short: "Mon" },
  { id: 1, label: "Tuesday", short: "Tue" },
  { id: 2, label: "Wednesday", short: "Wed" },
  { id: 3, label: "Thursday", short: "Thu" },
  { id: 4, label: "Friday", short: "Fri" },
  { id: 5, label: "Saturday", short: "Sat" },
  { id: 6, label: "Sunday", short: "Sun" }
] satisfies { id: DayOfWeek; label: string; short: string }[];

export type ScheduleBlockKind = "flight" | "turnaround" | "preview" | "conflict";

export interface ScheduleBlock {
  id: string;
  day: DayOfWeek;
  startMinute: number;
  endMinute: number;
  kind: ScheduleBlockKind;
  title: string;
  subtitle: string;
  tooltip: string;
  sourceId?: string;
  flightNumber?: string;
}

export function timeToMinutes(value: string) {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

export function minutesToTime(totalMinutes: number) {
  const bounded = ((Math.round(totalMinutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const hours = Math.floor(bounded / 60);
  const minutes = bounded % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function getDayName(day: DayOfWeek) {
  return weekDays.find((item) => item.id === day)?.label ?? "Monday";
}

export function generateDefaultFlightNumber(airlineName: string, index: number) {
  const letters = airlineName
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]/gi, "")[0])
    .join("")
    .toUpperCase()
    .padEnd(2, "A")
    .slice(0, 2);
  return `${letters}${String(101 + index * 2).padStart(3, "0")}`;
}

export function nextFlightNumber(value: string) {
  const match = value.toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) return `${value.toUpperCase()}R`.slice(0, 8);
  const [, prefix, numeric] = match;
  return `${prefix}${String(Number(numeric) + 1).padStart(numeric.length, "0")}`.slice(0, 8);
}

export function validateFlightNumber(value: string) {
  const flightNumber = value.trim().toUpperCase();
  if (!flightNumber) return { isValid: false, flightNumber, message: "Flight number cannot be empty." };
  if (flightNumber.length < 2 || flightNumber.length > 8) {
    return { isValid: false, flightNumber, message: "Flight number must be 2 to 8 characters." };
  }
  if (!/^[A-Z0-9]+$/.test(flightNumber)) {
    return { isValid: false, flightNumber, message: "Flight number can only use uppercase letters and numbers." };
  }
  return { isValid: true, flightNumber, message: "" };
}

export function calculateScheduleBlock(route: Route, aircraft: AircraftInstance) {
  const model = aircraftById[aircraft.modelId];
  const oneWayMinutes = Math.ceil(flightWaitMs(route.distanceKm, model.cruiseSpeedKmh) / 60000);
  const turnaroundMinutes = model.turnaroundMinutes;
  return {
    oneWayMinutes,
    turnaroundMinutes,
    oneWayBlockMinutes: oneWayMinutes + turnaroundMinutes,
    roundTripBlockMinutes: oneWayMinutes * 2 + turnaroundMinutes * 2
  };
}

export function splitBlockAcrossDays(input: {
  id: string;
  startMinuteOfWeek: number;
  endMinuteOfWeek: number;
  kind: ScheduleBlockKind;
  title: string;
  subtitle: string;
  tooltip: string;
  sourceId?: string;
  flightNumber?: string;
}) {
  const blocks: ScheduleBlock[] = [];
  const spanEnd = Math.max(input.endMinuteOfWeek, input.startMinuteOfWeek + 1);
  for (let cursor = input.startMinuteOfWeek; cursor < spanEnd; ) {
    const wrappedCursor = ((cursor % WEEK_MINUTES) + WEEK_MINUTES) % WEEK_MINUTES;
    const day = Math.floor(wrappedCursor / DAY_MINUTES) as DayOfWeek;
    const dayEnd = cursor + (DAY_MINUTES - (wrappedCursor % DAY_MINUTES));
    const segmentEnd = Math.min(dayEnd, spanEnd);
    blocks.push({
      id: `${input.id}-${cursor}`,
      day,
      startMinute: wrappedCursor % DAY_MINUTES,
      endMinute: ((segmentEnd - cursor) + (wrappedCursor % DAY_MINUTES)),
      kind: input.kind,
      title: input.title,
      subtitle: input.subtitle,
      tooltip: input.tooltip,
      sourceId: input.sourceId,
      flightNumber: input.flightNumber
    });
    cursor = segmentEnd;
  }
  return blocks;
}

export function weeklyEventBlocksFromSchedule(aircraft: AircraftInstance, routes: Route[]) {
  const blocks: ScheduleBlock[] = [];
  const model = aircraftById[aircraft.modelId];

  aircraft.schedule
    .filter((item) => item.status !== "completed")
    .forEach((item) => {
      const route = routes.find((candidate) => candidate.id === item.routeId);
      if (!route) return;
      const day = item.operatingDay ?? 0;
      const departureMinute = Math.round(timeOfDayMs(formatUtcTime(item.departureGameTime)) / 60000);
      const flightMinutes = Math.max(1, Math.round((item.arrivalGameTime - item.departureGameTime) / 60000));
      const turnaroundMinutes = model.turnaroundMinutes;
      const start = day * DAY_MINUTES + departureMinute;
      const title = `${item.flightNumber ?? "FL"} ${airportsById[item.originAirportId].iata}-${airportsById[item.destinationAirportId].iata}`;
      blocks.push(
        ...splitBlockAcrossDays({
          id: `${item.id}-flight`,
          startMinuteOfWeek: start,
          endMinuteOfWeek: start + flightMinutes,
          kind: "flight",
          title,
          subtitle: `${minutesToTime(departureMinute)}-${minutesToTime(departureMinute + flightMinutes)}`,
          tooltip: `${title}\n${aircraft.registration}\n${getDayName(day)} ${minutesToTime(departureMinute)}\nDuration ${flightMinutes}m`,
          sourceId: item.id,
          flightNumber: item.flightNumber
        })
      );
      blocks.push(
        ...splitBlockAcrossDays({
          id: `${item.id}-turnaround`,
          startMinuteOfWeek: start + flightMinutes,
          endMinuteOfWeek: start + flightMinutes + turnaroundMinutes,
          kind: "turnaround",
          title: "Turnaround",
          subtitle: `${turnaroundMinutes}m`,
          tooltip: `${airportsById[item.destinationAirportId].iata} turnaround for ${aircraft.registration}`,
          sourceId: item.id
        })
      );
    });

  return blocks;
}

export function hasScheduleConflict(existingBlocks: ScheduleBlock[], previewBlocks: ScheduleBlock[]) {
  const occupied = existingBlocks.filter((block) => block.kind === "flight" || block.kind === "turnaround");
  const previewOccupied = previewBlocks.filter((block) => block.kind === "preview" || block.kind === "turnaround" || block.kind === "conflict");
  return previewOccupied.some((preview) =>
    occupied.some((block) => block.day === preview.day && preview.startMinute < block.endMinute && preview.endMinute > block.startMinute)
  );
}

export function previewBlocksForWeeklySchedule(input: {
  aircraft: AircraftInstance;
  route: Route;
  daysOfWeek: DayOfWeek[];
  departureTimeLocal: string;
  isRoundTrip: boolean;
  outboundFlightNumber: string;
  returnFlightNumber?: string;
  conflict: boolean;
}) {
  const { oneWayMinutes, turnaroundMinutes } = calculateScheduleBlock(input.route, input.aircraft);
  const departureMinute = timeToMinutes(input.departureTimeLocal);
  const kind: ScheduleBlockKind = input.conflict ? "conflict" : "preview";
  const blocks: ScheduleBlock[] = [];

  input.daysOfWeek.forEach((day) => {
    const outboundStart = day * DAY_MINUTES + departureMinute;
    blocks.push(
      ...splitBlockAcrossDays({
        id: `preview-${day}-out`,
        startMinuteOfWeek: outboundStart,
        endMinuteOfWeek: outboundStart + oneWayMinutes,
        kind,
        title: `${input.outboundFlightNumber} ${airportsById[input.route.originAirportId].iata}-${airportsById[input.route.destinationAirportId].iata}`,
        subtitle: `${minutesToTime(departureMinute)}-${minutesToTime(departureMinute + oneWayMinutes)}`,
        tooltip: `Preview ${input.outboundFlightNumber}`,
        flightNumber: input.outboundFlightNumber
      })
    );
    blocks.push(
      ...splitBlockAcrossDays({
        id: `preview-${day}-out-ta`,
        startMinuteOfWeek: outboundStart + oneWayMinutes,
        endMinuteOfWeek: outboundStart + oneWayMinutes + turnaroundMinutes,
        kind: input.conflict ? "conflict" : "turnaround",
        title: "Turnaround",
        subtitle: `${turnaroundMinutes}m`,
        tooltip: "Preview turnaround"
      })
    );
    if (input.isRoundTrip) {
      const returnStart = outboundStart + oneWayMinutes + turnaroundMinutes;
      blocks.push(
        ...splitBlockAcrossDays({
          id: `preview-${day}-ret`,
          startMinuteOfWeek: returnStart,
          endMinuteOfWeek: returnStart + oneWayMinutes,
          kind,
          title: `${input.returnFlightNumber ?? nextFlightNumber(input.outboundFlightNumber)} ${airportsById[input.route.destinationAirportId].iata}-${airportsById[input.route.originAirportId].iata}`,
          subtitle: `${minutesToTime(departureMinute + oneWayMinutes + turnaroundMinutes)}-${minutesToTime(departureMinute + oneWayMinutes * 2 + turnaroundMinutes)}`,
          tooltip: `Preview return ${input.returnFlightNumber ?? nextFlightNumber(input.outboundFlightNumber)}`,
          flightNumber: input.returnFlightNumber
        })
      );
      blocks.push(
        ...splitBlockAcrossDays({
          id: `preview-${day}-ret-ta`,
          startMinuteOfWeek: returnStart + oneWayMinutes,
          endMinuteOfWeek: returnStart + oneWayMinutes + turnaroundMinutes,
          kind: input.conflict ? "conflict" : "turnaround",
          title: "Turnaround",
          subtitle: `${turnaroundMinutes}m`,
          tooltip: "Preview return turnaround"
        })
      );
    }
  });

  return blocks;
}

export function validateWeeklySchedule(input: {
  aircraft?: AircraftInstance;
  route?: Route;
  daysOfWeek: DayOfWeek[];
  departureTimeLocal: string;
  outboundFlightNumber: string;
  returnFlightNumber?: string;
  isRoundTrip: boolean;
  existingSchedules: ScheduleItem[];
}) {
  if (!input.aircraft) return "Select an aircraft.";
  if (!input.route) return "Select a route.";
  if (!/^\d{2}:\d{2}$/.test(input.departureTimeLocal)) return "Choose a valid departure time.";
  if (input.daysOfWeek.length === 0) return "Select at least one operating day.";
  const outbound = validateFlightNumber(input.outboundFlightNumber);
  if (!outbound.isValid) return outbound.message;
  if (input.isRoundTrip) {
    const inbound = validateFlightNumber(input.returnFlightNumber ?? "");
    if (!inbound.isValid) return `Return ${inbound.message}`;
  }
  if (input.route.distanceKm > aircraftById[input.aircraft.modelId].rangeKm) return "Aircraft range is insufficient for this route.";
  const duplicate = input.existingSchedules.find((item) => {
    const itemMinute = timeToMinutes(formatUtcTime(item.departureGameTime));
    const sameTime = item.operatingDay !== undefined && input.daysOfWeek.includes(item.operatingDay) && itemMinute === timeToMinutes(input.departureTimeLocal);
    return sameTime && (item.flightNumber === outbound.flightNumber || item.flightNumber === input.returnFlightNumber?.trim().toUpperCase());
  });
  if (duplicate) return "Duplicate flight number at the same departure time.";
  return null;
}

export function formatUtcTime(ms: number) {
  const date = new Date(ms);
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

export function weeklyScheduleLabel(schedule: WeeklySchedule) {
  return `${schedule.outboundFlightNumber}${schedule.isRoundTrip && schedule.returnFlightNumber ? `/${schedule.returnFlightNumber}` : ""}`;
}
