import assert from "node:assert/strict";
import test from "node:test";
import { aircraftById } from "../src/data/aircraft";
import { normalizeAircraftLifecycle } from "../src/lib/aircraftMaintenance";
import { weeklyAirportIssues } from "../src/lib/airportOperations";
import { restoreGameStateFromCloudSave } from "../src/lib/cloudSave";
import { generateWeeklyEvents } from "../src/lib/recurringFlights";
import { maintenancePreview } from "../src/lib/maintenancePlanning";
import { createRouteOpeningPreview, routeAircraftAvailability } from "../src/lib/routeScheduling";
import { prepareWeeklySchedule } from "../src/lib/scheduleActions";
import { buildRoutePolylinePoints, buildRoutePolylineSegments, interpolateRoutePosition } from "../src/lib/mapRoutePath";
import { airportsById } from "../src/data/airports";
import { distanceKm } from "../src/lib/geo";
import { DAY_MS, WEEK_MS, dayOfWeekForGameTime } from "../src/lib/time";
import type { DayOfWeek, GameState, WeeklySchedule } from "../src/types/game";

const now = Date.UTC(2026, 0, 5);
const model = aircraftById["a220-300"];
const candidate = createRouteOpeningPreview("lhr", "ams")!;
function fixture(count = 1) {
  return restoreGameStateFromCloudSave({ saveFormatVersion: 2, airlineName: "Route Check", difficulty: "realistic",
    baseAirportId: "lhr", baseAirports: ["lhr", "hkg"], money: 100000000,
    currentGameTimeMs: now, baseGameTimeMs: now, isPaused: true,
    routes: [{ id: "lhr-cdg", originAirportId: "lhr", destinationAirportId: "cdg", isOpen: true }],
    fleet: Array.from({ length: count }, (_, index) => ({ id: `plane-${index}`, modelId: model.id, registration: `G-RT${index}`,
      homeBaseAirportId: "lhr", currentAirportId: "lhr", cabinLayout: model.suggestedLayout, schedule: [], weeklySchedules: [] })) });
}
function service(id: string, departure: string, days: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6]): WeeklySchedule {
  return { id, aircraftId: "plane-0", routeId: "lhr-cdg", outboundFlightNumber: `RT${id}1`, returnFlightNumber: `RT${id}2`,
    daysOfWeek: days, departureTimeLocal: departure, isRoundTrip: true, blockMinutes: 180, turnaroundMinutes: 40,
    createdGameTime: now - WEEK_MS, createdAt: "2026-01-01", updatedAt: "2026-01-01", recurrenceRule: "WEEKLY" };
}
function fillTimetable(game: GameState, occupiedMinutes = 180) {
  game.routes[0].distanceKm = model.cruiseSpeedKmh * (occupiedMinutes / 2 - model.turnaroundMinutes - 0.1) / 60;
  for (const aircraft of game.fleet) aircraft.weeklySchedules = Array.from({ length: 8 }, (_, index) =>
    ({ ...service(String(index), `${String(index * 3).padStart(2, "0")}:00`), aircraftId: aircraft.id }));
}

test("route picker preserves clicked destination and rejects invalid airport pairs", () => {
  assert.equal(candidate.route.originAirportId, "lhr");
  assert.equal(candidate.route.destinationAirportId, "ams");
  assert.ok(candidate.cost > 0);
  assert.equal(createRouteOpeningPreview("lhr", "lhr"), null);
  assert.equal(createRouteOpeningPreview("missing", "ams"), null);
});

test("availability is a pure preview whose offered slot passes the real timetable validator", () => {
  const game = fixture();
  const before = JSON.stringify(game);
  const row = routeAircraftAvailability(game, candidate.route)[0];
  assert.equal(row.status, "available");
  assert.ok(row.departureGameTime !== undefined);
  const result = prepareWeeklySchedule({ ...game, routes: [...game.routes, { ...candidate.route, isOpen: true }] }, {
    aircraftId: row.aircraft.id, routeId: candidate.route.id, daysOfWeek: [dayOfWeekForGameTime(row.departureGameTime!)],
    departureTimeLocal: new Date(row.departureGameTime!).toISOString().slice(11, 16), isRoundTrip: true,
    outboundFlightNumber: "NEW101", returnFlightNumber: "NEW102" });
  assert.equal(result.ok, true, result.message);
  assert.equal(JSON.stringify(game), before);
});

test("a full timetable and fragmented gaps cannot be advertised as available", () => {
  for (const occupiedMinutes of [180, 140]) {
    const game = fixture();
    fillTimetable(game, occupiedMinutes);
    assert.equal(routeAircraftAvailability(game, candidate.route)[0].status, "full");
  }
});

test("weekly occupancy survives missing generated events and dated cancellations", () => {
  const game = fixture();
  fillTimetable(game);
  game.fleet[0].schedule = generateWeeklyEvents(game.fleet[0], game.routes, now, now + WEEK_MS)
    .map((flight) => ({ ...flight, status: "cancelled" }));
  assert.equal(routeAircraftAvailability(game, candidate.route)[0].status, "full");
});

test("Sunday-to-Monday flights and turnaround occupy the following week", () => {
  const game = fixture();
  game.routes[0].distanceKm = model.cruiseSpeedKmh * 49.9 / 60;
  game.fleet[0].weeklySchedules = [service("X", "22:00", [6])];
  const row = routeAircraftAvailability(game, candidate.route)[0];
  assert.equal(row.status, "available");
  assert.ok(row.departureGameTime! >= now + 60 * 60_000);
});

test("range, home base, position, grounded and maintenance failures remain distinct", () => {
  const game = fixture(5);
  game.fleet[1].homeBaseAirportId = "hkg";
  game.fleet[2].currentAirportId = "cdg";
  game.fleet[3].lifecycle = { ...normalizeAircraftLifecycle(game.fleet[3], now), condition: 20 };
  game.fleet[4].lifecycle = { ...normalizeAircraftLifecycle(game.fleet[4], now), maintenance: {
    kind: "inspection", startedGameTimeMs: now, completesGameTimeMs: now + DAY_MS,
    totalCost: 1000, reserveUsed: 0, cashCost: 1000 } };
  const rows = routeAircraftAvailability(game, candidate.route);
  assert.deepEqual(rows.map((row) => row.status), ["available", "base", "position", "grounded", "maintenance"]);
  assert.ok(routeAircraftAvailability(game, createRouteOpeningPreview("lhr", "syd")!.route).every((row) => row.status === "range"));
});

test("cancelled dated flights free time, while live one-offs and turnaround occupy it", () => {
  const game = fixture();
  game.fleet[0].schedule = [{ id: "dated", aircraftId: "plane-0", routeId: "lhr-cdg", originAirportId: "lhr",
    destinationAirportId: "lhr", departureGameTime: now, arrivalGameTime: now + 2 * 60 * 60_000,
    readyGameTime: now + 3 * 60 * 60_000, status: "scheduled" }];
  assert.ok(routeAircraftAvailability(game, candidate.route)[0].departureGameTime! >= now + 3 * 60 * 60_000);
  game.fleet[0].schedule[0].status = "cancelled";
  assert.equal(routeAircraftAvailability(game, candidate.route)[0].departureGameTime, now);
});

test("offered round-trip slots respect optional airport curfews", () => {
  const game = fixture();
  game.airportRulesEnabled = true;
  const route = createRouteOpeningPreview("lhr", "fra")!.route;
  const row = routeAircraftAvailability(game, route)[0];
  assert.equal(row.status, "available");
  const issues = weeklyAirportIssues({ route, model, daysOfWeek: [dayOfWeekForGameTime(row.departureGameTime!)],
    departureTimeLocal: new Date(row.departureGameTime!).toISOString().slice(11, 16), isRoundTrip: true, referenceGameTimeMs: now });
  assert.ok(issues.every((issue) => !issue.blocking));
});

test("reserved maintenance occupies a gap without charging cash or cancelling flights in the preview", () => {
  const game = fixture();
  const aircraft = game.fleet[0];
  aircraft.schedule = [{ id: "out", aircraftId: aircraft.id, routeId: "lhr-cdg", originAirportId: "lhr", destinationAirportId: "cdg",
    departureGameTime: now + 60 * 60_000, arrivalGameTime: now + 90 * 60_000, readyGameTime: now + 130 * 60_000, status: "scheduled" },
  { id: "return", aircraftId: aircraft.id, routeId: "lhr-cdg", originAirportId: "cdg", destinationAirportId: "lhr",
    departureGameTime: now + 130 * 60_000, arrivalGameTime: now + 160 * 60_000, readyGameTime: now + 200 * 60_000, status: "scheduled" }];
  aircraft.lifecycle = { ...normalizeAircraftLifecycle(aircraft, now), reservation: { kind: "inspection", state: "scheduled", afterFlightId: "return" } };
  const end = maintenancePreview(aircraft, "inspection", now, "return")!.end;
  const before = JSON.stringify(game);
  const row = routeAircraftAvailability(game, candidate.route)[0];
  assert.equal(row.status, "available");
  assert.ok(row.departureGameTime! >= end);
  assert.equal(JSON.stringify(game), before);
});

test("100 aircraft stay independent and a full fleet has no available entries", () => {
  const game = fixture(100);
  fillTimetable(game);
  const before = JSON.stringify(game);
  const start = performance.now();
  const rows = routeAircraftAvailability(game, candidate.route);
  assert.equal(rows.length, 100);
  assert.ok(rows.every((row) => row.status === "full"));
  assert.equal(new Set(rows.map((row) => row.aircraft.id)).size, 100);
  assert.equal(JSON.stringify(game), before);
  assert.ok(performance.now() - start < 2500);
});

test("timetable conflicts are judged on planned times, not on one dated flight's random delay", () => {
  const base = fixture();
  base.routes.push({ ...candidate.route, isOpen: true });
  const first = prepareWeeklySchedule(base, { aircraftId: "plane-0", routeId: "lhr-cdg", daysOfWeek: [1], departureTimeLocal: "08:00",
    isRoundTrip: true, outboundFlightNumber: "RT101", returnFlightNumber: "RT102" });
  assert.equal(first.ok, true, first.message);
  // Push the dated rotation three hours late, as an operational delay does once the engine has processed it.
  const late = 180 * 60_000;
  const delayed: GameState = { ...first.game!, fleet: first.game!.fleet.map((aircraft) => ({ ...aircraft,
    schedule: aircraft.schedule.map((item) => ({ ...item, delayMinutes: 180, departureGameTime: item.departureGameTime + late,
      arrivalGameTime: item.arrivalGameTime + late, readyGameTime: item.readyGameTime + late })) })) };
  const second = (time: string) => prepareWeeklySchedule(delayed, { aircraftId: "plane-0", routeId: candidate.route.id, daysOfWeek: [1],
    departureTimeLocal: time, isRoundTrip: true, outboundFlightNumber: "RT201", returnFlightNumber: "RT202" });
  assert.equal(second("08:30").ok, false, "a rotation planned inside another one must be rejected even while that one is running late");
  assert.equal(second("13:00").ok, true, "a rotation planned after the first one is valid; the engine absorbs the delay");
});

test("map routes follow the great circle, and aircraft stay on the drawn line", () => {
  const lhr = airportsById.lhr, jfk = airportsById.jfk, hnd = airportsById.hnd, lax = airportsById.lax, syd = airportsById.syd;
  const atlantic = buildRoutePolylinePoints(lhr, jfk, 96);
  assert.deepEqual(atlantic[0], { lat: lhr.lat, lng: lhr.lng });
  assert.ok(Math.abs(atlantic[96].lat - jfk.lat) < 1e-6 && Math.abs(atlantic[96].lng - jfk.lng) < 1e-6);
  // A real North Atlantic crossing bows north of both airports instead of running straight between them.
  assert.ok(Math.max(...atlantic.map((point) => point.lat)) > Math.max(lhr.lat, jfk.lat) + 1);
  // The path is no longer than the direct distance the economy already charges for.
  const between = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const rad = Math.PI / 180;
    const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  };
  const length = (points: { lat: number; lng: number }[]) => points.slice(1).reduce((sum, point, index) => sum + between(points[index], point), 0);
  assert.ok(Math.abs(length(atlantic) - distanceKm(lhr, jfk)) < 5);
  // Aircraft icons use the same curve as the line.
  const halfway = interpolateRoutePosition(lhr, jfk, 0.5);
  assert.ok(Math.abs(halfway.lat - atlantic[48].lat) < 1e-6 && Math.abs(halfway.lng - atlantic[48].lng) < 1e-6);
  assert.deepEqual(interpolateRoutePosition(lhr, jfk, 0), { lat: lhr.lat, lng: lhr.lng });
  assert.deepEqual(interpolateRoutePosition(lhr, jfk, 1), { lat: jfk.lat, lng: jfk.lng });
  // Pacific crossings stay continuous while building and split cleanly at the date line.
  for (const [from, to] of [[hnd, lax], [lax, syd], [syd, lax]] as const) {
    const pacific = buildRoutePolylinePoints(from, to, 96);
    assert.ok(pacific.slice(1).every((point, index) => Math.abs(point.lng - pacific[index].lng) < 20), "no jump between neighbouring points");
    const segments = buildRoutePolylineSegments(from, to, 96);
    assert.equal(segments.length, 2);
    assert.ok(segments.flat().every((point) => point.lng >= -180 && point.lng <= 180 && Number.isFinite(point.lat)));
    assert.ok(Math.abs(length(segments[0]) + length(segments[1]) - distanceKm(from, to)) < 10);
  }
  assert.deepEqual(buildRoutePolylinePoints(lhr, lhr, 4).map((point) => point.lat), Array(5).fill(lhr.lat));
});
