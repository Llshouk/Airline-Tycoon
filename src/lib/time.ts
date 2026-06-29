import type { DayOfWeek } from "@/types/game";

export const DEFAULT_GAME_SPEED = 10;
export const GAME_SPEED_OPTIONS = [1, 5, 10, 20, 50, 100] as const;
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

export function flightWaitMs(distanceKm: number, cruiseSpeedKmh: number) {
  const flightTimeHours = distanceKm / cruiseSpeedKmh;
  return flightTimeHours * 60 * 60 * 1000;
}

export function turnaroundWaitMs(turnaroundMinutes: number) {
  return turnaroundMinutes * 60 * 1000;
}

export function formatGameDate(ms: number) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(ms));
}

export function formatDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export function dayStartMs(gameTimeMs: number) {
  const date = new Date(gameTimeMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function weekStartMs(gameTimeMs: number) {
  const start = dayStartMs(gameTimeMs);
  const day = new Date(start).getUTCDay();
  const mondayOffset = (day + 6) % 7;
  return start - mondayOffset * DAY_MS;
}

export function dayOfWeekForGameTime(gameTimeMs: number): DayOfWeek {
  return ((new Date(gameTimeMs).getUTCDay() + 6) % 7) as DayOfWeek;
}

export function timeOfDayMs(value: string) {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 * 60 * 1000 + Number(minutes) * 60 * 1000;
}

export function formatTimeOfDay(gameTimeMs: number) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC"
  }).format(new Date(gameTimeMs));
}
