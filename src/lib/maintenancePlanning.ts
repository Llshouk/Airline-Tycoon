import { aircraftById } from "@/data/aircraft";
import { quoteMaintenance, normalizeAircraftLifecycle } from "@/lib/aircraftMaintenance";
import type { AircraftInstance, MaintenanceKind, ScheduleItem } from "@/types/game";

export function maintenanceAnchorFlights(aircraft: AircraftInstance) {
  return aircraft.schedule.filter((flight) => flight.status === "scheduled" || flight.status === "in-flight")
    .sort((a, b) => a.departureGameTime - b.departureGameTime);
}

export function maintenancePreview(aircraft: AircraftInstance, kind: MaintenanceKind, now: number, afterFlightId?: string) {
  const model = aircraftById[aircraft.modelId];
  const anchor = afterFlightId ? aircraft.schedule.find((flight) => flight.id === afterFlightId &&
    (flight.status === "scheduled" || flight.status === "in-flight")) : undefined;
  if (!model || (afterFlightId && !anchor)) return null;
  const quote = quoteMaintenance(model, normalizeAircraftLifecycle(aircraft, now), kind);
  const start = anchor ? Math.max(now, anchor.readyGameTime) : now;
  const end = start + quote.durationMs;
  const airportId = anchor?.destinationAirportId ?? aircraft.currentAirportId;
  const cancelled: { flight: ScheduleItem; reason: "maintenance" | "position" }[] = [];
  let resume: ScheduleItem | undefined;
  for (const flight of maintenanceAnchorFlights(aircraft)) {
    if (flight.status === "in-flight" || flight.id === anchor?.id) continue;
    const departure = flight.scheduledDepartureGameTime ?? flight.departureGameTime;
    if (departure < start) continue;
    if (departure < end) cancelled.push({ flight, reason: "maintenance" });
    else if (flight.originAirportId !== airportId) cancelled.push({ flight, reason: "position" });
    else { resume = flight; break; }
  }
  return { quote, start, end, airportId, cancelled, resume };
}
