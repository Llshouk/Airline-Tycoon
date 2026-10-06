import { aircraftById } from "@/data/aircraft";
import { airportsById } from "@/data/airports";
import { weeklyAirportIssues } from "@/lib/airportOperations";
import { createId } from "@/lib/ids";
import { generateWeeklyEvents, mergeGeneratedEvents } from "@/lib/recurringFlights";
import { calculateScheduleBlock, createUniqueFlightNumber, findDuplicateFlightNumber, isAllowedScheduleMinute, minutesToTime,
  nextFlightNumber, normalizeScheduleTime, timeToMinutes, validateFlightNumber, validateWeeklySchedule } from "@/lib/schedule";
import { WEEK_MS } from "@/lib/time";
import type { GameState, ScheduleItem, WeeklySchedule } from "@/types/game";

export type WeeklyScheduleInput = Omit<WeeklySchedule, "id" | "createdGameTime" | "recurrenceRule" | "createdAt" | "updatedAt" | "blockMinutes" | "turnaroundMinutes"> & {
  replaceWeeklyScheduleId?: string; scheduleBaseAirportId?: string;
};

export function prepareWeeklySchedule(game: GameState | null, input: WeeklyScheduleInput): { ok: boolean; message: string; game?: GameState } {
  if (!game) return { ok: false, message: "Start or load a game before saving a timetable." };
  const aircraft = game.fleet.find((item) => item.id === input.aircraftId);
  const route = game.routes.find((item) => item.id === input.routeId);
  if (!aircraft || !route) {
    const message = !aircraft ? "Select an aircraft." : "Select a route.";
    return { ok: false, message };
  }
  const model = aircraftById[aircraft.modelId];
  if (!model) {
    const message = "Aircraft model data is missing.";
    return { ok: false, message };
  }
  const scheduleBaseAirportId = input.scheduleBaseAirportId ?? route.originAirportId;
  if (!game.baseAirports.includes(scheduleBaseAirportId)) {
    const message = "No base airport available.";
    return { ok: false, message };
  }
  if (route.originAirportId !== scheduleBaseAirportId) {
    const message = "Schedule save failed: this route does not belong to the selected base.";
    return { ok: false, message };
  }
  if (aircraft.homeBaseAirportId !== scheduleBaseAirportId) {
    const message = "Schedule save failed: this aircraft is not based at the selected airport.";
    return { ok: false, message };
  }
  const normalizedOutbound = validateFlightNumber(input.outboundFlightNumber);
  const normalizedReturn = input.isRoundTrip ? validateFlightNumber(input.returnFlightNumber ?? "") : null;
  if (!/^\d{2}:\d{2}$/.test(input.departureTimeLocal)) {
    const message = "Choose a valid departure time.";
    return { ok: false, message };
  }
  if (!isAllowedScheduleMinute(Number(input.departureTimeLocal.split(":")[1] ?? 0))) {
    const message = "Departure minutes must be 00, 05, 10, 15, 20, 25, 30, 35, 40, 45, 50, or 55.";
    return { ok: false, message };
  }
  const normalizedDepartureTime = normalizeScheduleTime(input.departureTimeLocal);
  const curfew = game.airportRulesEnabled && weeklyAirportIssues({
    route, model, daysOfWeek: input.daysOfWeek, departureTimeLocal: normalizedDepartureTime,
    isRoundTrip: input.isRoundTrip, referenceGameTimeMs: game.currentGameTimeMs
  }).find((issue) => issue.blocking);
  if (curfew) {
    const message = "Airport curfew: " + airportsById[curfew.airportId].iata + " " + curfew.localTime;
    return { ok: false, message };
  }
  const existingForValidation = aircraft.schedule.filter((item) => item.weeklyScheduleId !== input.replaceWeeklyScheduleId);
  const allWeeklySchedules = game.fleet.flatMap((fleetAircraft) => fleetAircraft.weeklySchedules);
  const duplicateFlightNumber = findDuplicateFlightNumber({
    outboundFlightNumber: input.outboundFlightNumber,
    returnFlightNumber: input.returnFlightNumber,
    isRoundTrip: input.isRoundTrip,
    schedules: allWeeklySchedules,
    currentScheduleId: input.replaceWeeklyScheduleId
  });
  if (duplicateFlightNumber) {
    const message = "Flight number already exists. Please use a unique flight number.";
    return { ok: false, message };
  }
  const validationMessage = validateWeeklySchedule({
    aircraft,
    route,
    daysOfWeek: input.daysOfWeek,
    departureTimeLocal: normalizedDepartureTime,
    outboundFlightNumber: input.outboundFlightNumber,
    returnFlightNumber: input.returnFlightNumber,
    isRoundTrip: input.isRoundTrip,
    existingSchedules: existingForValidation
  });
  if (validationMessage) {
    return { ok: false, message: validationMessage };
  }
  const retainedWeeklySchedules = aircraft.weeklySchedules.filter((item) => item.id !== input.replaceWeeklyScheduleId);
  const retainedSchedule = aircraft.schedule.filter((item) => item.weeklyScheduleId !== input.replaceWeeklyScheduleId ||
    item.status === "completed" || item.status === "cancelled" || item.status === "in-flight");
  if (!input.replaceWeeklyScheduleId && retainedWeeklySchedules.length === 0 && aircraft.currentAirportId !== route.originAirportId) {
    const message = `Position ${aircraft.registration} at ${airportsById[route.originAirportId].iata} before starting this service.`;
    return { ok: false, message };
  }
  const block = calculateScheduleBlock(route, aircraft);
  const nowIso = new Date().toISOString();
  const existingSchedule = input.replaceWeeklyScheduleId
    ? aircraft.weeklySchedules.find((item) => item.id === input.replaceWeeklyScheduleId)
    : undefined;

  const weeklySchedule: WeeklySchedule = {
    aircraftId: input.aircraftId,
    routeId: input.routeId,
    outboundFlightNumber: normalizedOutbound.flightNumber,
    returnFlightNumber: input.isRoundTrip ? normalizedReturn?.flightNumber ?? nextFlightNumber(normalizedOutbound.flightNumber) : undefined,
    daysOfWeek: input.daysOfWeek,
    departureTimeLocal: normalizedDepartureTime,
    isRoundTrip: input.isRoundTrip,
    blockMinutes: input.isRoundTrip ? block.roundTripBlockMinutes : block.oneWayBlockMinutes,
    turnaroundMinutes: block.turnaroundMinutes,
    id: existingSchedule?.id ?? createId("weekly"),
    createdGameTime: game.currentGameTimeMs,
    recurrenceRule: `WEEKLY:${input.daysOfWeek.join(",")}@${normalizedDepartureTime}`,
    createdAt: existingSchedule?.createdAt ?? nowIso,
    updatedAt: nowIso
  };
  const testAircraft = {
    ...aircraft,
    schedule: retainedSchedule,
    weeklySchedules: [...retainedWeeklySchedules, weeklySchedule]
  };
  const generated = generateWeeklyEvents(testAircraft, game.routes, game.currentGameTimeMs, game.currentGameTimeMs + WEEK_MS);
  const candidateSchedule = mergeGeneratedEvents(
    retainedSchedule.filter((item) => item.status === "scheduled" || item.status === "in-flight"),
    generated
  );
  const conflict = findScheduleConflict(candidateSchedule, aircraft.currentAirportId);
  if (conflict) {
    return { ok: false, message: conflict };
  }

  const nextFleet = game.fleet.map((item) =>
    item.id === aircraft.id
      ? {
          ...testAircraft,
          schedule: mergeGeneratedEvents(retainedSchedule, generated)
        }
      : item
  );
  const updatedGame = { ...game, fleet: nextFleet };
  return { ok: true, message: "Timetable saved.", game: updatedGame };
}

function findScheduleConflict(items: ScheduleItem[], startingAirportId: string) {
  const future = items.filter((item) => item.status === "scheduled" || item.status === "in-flight")
    .sort((a, b) => a.departureGameTime - b.departureGameTime);
  let expectedAirportId = startingAirportId;
  let readyGameTime = 0;

  for (const item of future) {
    if (item.originAirportId !== expectedAirportId) {
      return `Schedule conflict: ${airportsById[item.originAirportId].iata} departure requires the aircraft, but it is expected at ${airportsById[expectedAirportId]?.iata ?? "another airport"}.`;
    }
    if (item.departureGameTime < readyGameTime) {
      return `Schedule conflict: ${airportsById[item.originAirportId].iata} departure overlaps a previous flight and turnaround.`;
    }
    expectedAirportId = item.destinationAirportId;
    readyGameTime = item.readyGameTime;
  }
  return null;
}

export function copyWeeklySchedules(game: GameState, sourceId: string, aircraftIds: string[], offsetMinutes = 0, approvedIds?: string[]) {
  const source = game.fleet.flatMap((aircraft) => aircraft.weeklySchedules).find((schedule) => schedule.id === sourceId);
  const outcomes: { aircraftId: string; ok: boolean; message: string; departure: string; flights: string }[] = [];
  let next = game;
  for (const [index, aircraftId] of [...new Set(aircraftIds)].sort().entries()) {
    if (!source || source.aircraftId === aircraftId || !Number.isFinite(offsetMinutes) || offsetMinutes < 0 || offsetMinutes > 1440 || offsetMinutes % 5 !== 0 ||
      approvedIds && !approvedIds.includes(aircraftId)) {
      outcomes.push({ aircraftId, ok: false, message: "Invalid timetable copy.", departure: "", flights: "" });
      continue;
    }
    const schedules = next.fleet.flatMap((aircraft) => aircraft.weeklySchedules);
    const outbound = createUniqueFlightNumber(source.outboundFlightNumber, schedules);
    const inbound = source.isRoundTrip ? createUniqueFlightNumber(nextFlightNumber(outbound), [...schedules, { ...source, outboundFlightNumber: outbound }]) : undefined;
    const minute = timeToMinutes(source.departureTimeLocal) + (index + 1) * offsetMinutes;
    const departure = minutesToTime(minute);
    const daysOfWeek = source.daysOfWeek.map((day) => ((day + Math.floor(minute / 1440)) % 7) as typeof day);
    const result = prepareWeeklySchedule(next, { ...source, aircraftId, daysOfWeek, outboundFlightNumber: outbound, returnFlightNumber: inbound, departureTimeLocal: departure });
    if (result.game) next = result.game;
    outcomes.push({ aircraftId, ok: result.ok, message: result.message, departure, flights: [outbound, inbound].filter(Boolean).join("/") });
  }
  return { game: next, outcomes };
}
