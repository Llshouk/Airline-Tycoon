import { aircraftById } from "@/data/aircraft";
import type { DifficultyConfig } from "@/config/difficulty";
import { completeAircraftMaintenance, getMaintenanceStatus, normalizeAircraftLifecycle, recordAircraftFlight, technicalDelayMinutes } from "@/lib/aircraftMaintenance";
import { estimateFlightFinancials } from "@/lib/economy";
import { pruneOperationalFlights } from "@/lib/cloudSave";
import { flightWaitMs, turnaroundWaitMs } from "@/lib/time";
import type { AircraftInstance, FlightLogEntry, Route, ScheduleItem } from "@/types/game";

export function generateOperationalDelayMinutes(seedText: string) {
  const probabilityNoise = deterministicNoise(seedText, 17);
  if (deterministicNoise(seedText, 29) > 0.3 + (probabilityNoise * 2 - 1) * 0.05) return 0;
  return Math.round(deterministicNoise(seedText, 41) * 180);
}

function deterministicNoise(seedText: string, salt: number) {
  let hash = salt;
  for (let index = 0; index < seedText.length; index += 1) hash = (hash * 31 + seedText.charCodeAt(index)) % 1_000_003;
  return (Math.sin(hash) + 1) / 2;
}

/** Advances one chronological aircraft timeline. Only newly completed flights produce accounting entries. */
export function advanceAircraftOperations(aircraft: AircraftInstance, routes: Route[], now: number, difficulty: DifficultyConfig) {
  const model = aircraftById[aircraft.modelId];
  let lifecycle = normalizeAircraftLifecycle(aircraft, now);
  let currentAirportId = aircraft.currentAirportId;
  let readyGameTime = 0;
  const entries: FlightLogEntry[] = [];
  const schedule: ScheduleItem[] = [];

  for (const original of [...aircraft.schedule].sort((a, b) =>
    (a.scheduledDepartureGameTime ?? a.departureGameTime) - (b.scheduledDepartureGameTime ?? b.departureGameTime))) {
    if (original.status === "completed") {
      readyGameTime = Math.max(readyGameTime, original.readyGameTime);
      schedule.push(original);
      continue;
    }
    const route = routes.find((candidate) => candidate.id === original.routeId);
    if (!route || !model) {
      schedule.push(original);
      continue;
    }
    let item = original;
    if (item.status === "scheduled") {
      const nominalDeparture = item.scheduledDepartureGameTime ?? item.departureGameTime;
      const baseDelayMinutes = item.baseDelayMinutes ?? item.delayMinutes ?? 0;
      let departure = Math.max(nominalDeparture + baseDelayMinutes * 60_000, readyGameTime);
      const maintenanceEnd = lifecycle.maintenance?.completesGameTimeMs;
      const maintenanceDelayMinutes = maintenanceEnd ? Math.max(0, (maintenanceEnd - departure) / 60_000) : (item.maintenanceDelayMinutes ?? 0);
      departure += maintenanceDelayMinutes * 60_000;
      lifecycle = completeAircraftMaintenance(lifecycle, Math.min(now, departure));
      if (getMaintenanceStatus(lifecycle, Math.min(now, departure)) === "grounded") {
        // TODO: Add explicit cancellation/rebooking choices; never silently discard a player's schedule.
        schedule.push({ ...item, operationalStatus: "grounded", actualDepartureGameTime: undefined, actualArrivalGameTime: undefined });
        continue;
      }
      const shouldCheckTechnical = !item.technicalChecked && now >= departure;
      const technicalMinutes = shouldCheckTechnical ? technicalDelayMinutes(item.id, lifecycle, departure) : (item.technicalDelayMinutes ?? 0);
      departure = Math.max(departure + technicalMinutes * 60_000, item.departureGameTime);
      const arrival = departure + flightWaitMs(route.distanceKm, model.cruiseSpeedKmh);
      const delayMinutes = Math.max(0, Math.round((departure - nominalDeparture) / 60_000));
      item = {
        ...item,
        baseDelayMinutes,
        technicalChecked: item.technicalChecked || shouldCheckTechnical,
        technicalDelayMinutes: technicalMinutes,
        maintenanceDelayMinutes,
        scheduledDepartureGameTime: nominalDeparture,
        scheduledArrivalGameTime: item.scheduledArrivalGameTime ?? nominalDeparture + flightWaitMs(route.distanceKm, model.cruiseSpeedKmh),
        departureGameTime: departure,
        arrivalGameTime: arrival,
        actualDepartureGameTime: departure,
        actualArrivalGameTime: arrival,
        readyGameTime: arrival + turnaroundWaitMs(model.turnaroundMinutes),
        delayMinutes,
        operationalStatus: delayMinutes > 0 ? "delayed" : "onTime"
      };
    }
    readyGameTime = Math.max(readyGameTime, item.readyGameTime);
    if (now >= item.arrivalGameTime) {
      const financials = estimateFlightFinancials(route, model, aircraft, item.departureGameTime + item.arrivalGameTime, difficulty);
      lifecycle = recordAircraftFlight(lifecycle, item.arrivalGameTime - item.departureGameTime, financials.economics.estimatedMaintenanceReservePerFlight);
      currentAirportId = item.destinationAirportId;
      const accounting = {
        revenue: financials.revenue, cost: financials.cost, profit: financials.profit,
        passengerCount: financials.passengerCount, cargoTons: financials.cargoTons
      };
      entries.push({
        id: item.id, aircraftId: aircraft.id, aircraftRegistration: aircraft.registration,
        flightNumber: item.flightNumber, routeId: route.id, originAirportId: item.originAirportId,
        destinationAirportId: item.destinationAirportId, completedGameTime: item.arrivalGameTime, ...accounting
      });
      // Persist actual accounting, not the large derived economics/demand preview.
      schedule.push({ ...item, ...accounting, status: "completed", operationalStatus: "arrived" });
    } else if (now >= item.departureGameTime) {
      schedule.push({ ...item, status: "in-flight", operationalStatus: "departed" });
    } else {
      schedule.push(item);
    }
  }

  lifecycle = completeAircraftMaintenance(lifecycle, now);
  const retained = pruneOperationalFlights(schedule, now);
  const maintenanceStatus = getMaintenanceStatus(lifecycle, now);
  const status: AircraftInstance["status"] = retained.some((item) => item.status === "in-flight") ? "in-flight"
    : maintenanceStatus === "maintenance" || maintenanceStatus === "grounded" ? maintenanceStatus
    : retained.some((item) => item.status === "scheduled") ? "scheduled" : "idle";
  return {
    aircraft: {
      ...aircraft, lifecycle, currentAirportId, status, schedule: retained,
      totalFlights: aircraft.totalFlights + entries.length,
      totalRevenue: aircraft.totalRevenue + entries.reduce((sum, entry) => sum + entry.revenue, 0),
      passengerCount: aircraft.passengerCount + entries.reduce((sum, entry) => sum + entry.passengerCount, 0),
      cargoTransportedTons: Math.round((aircraft.cargoTransportedTons + entries.reduce((sum, entry) => sum + entry.cargoTons, 0)) * 10) / 10
    },
    entries
  };
}
