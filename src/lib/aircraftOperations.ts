import { aircraftById } from "@/data/aircraft";
import type { DifficultyConfig } from "@/config/difficulty";
import { beginAircraftMaintenance, completeAircraftMaintenance, getMaintenanceStatus, normalizeAircraftLifecycle, quoteMaintenance, recordAircraftFlight, technicalDelayMinutes } from "@/lib/aircraftMaintenance";
import { estimateFlightFinancials } from "@/lib/economy";
import { pruneOperationalFlights } from "@/lib/cloudSave";
import { flightWaitMs, turnaroundWaitMs } from "@/lib/time";
import { splitRoundedCost } from "@/lib/financialReports";
import type { FinanceEvent } from "@/types/finance";
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
export function advanceAircraftOperations(aircraft: AircraftInstance, routes: Route[], now: number, difficulty: DifficultyConfig, availableCash = Infinity) {
  const model = aircraftById[aircraft.modelId];
  let lifecycle = normalizeAircraftLifecycle(aircraft, now);
  let currentAirportId = aircraft.currentAirportId;
  let readyGameTime = 0;
  const entries: FlightLogEntry[] = [];
  const financeEvents: FinanceEvent[] = [];
  const schedule: ScheduleItem[] = [];
  let maintenanceCashCost = 0;
  let cash = availableCash;
  let timelineAirportId = currentAirportId;
  let recovering = Boolean(lifecycle.recovery);

  function startReservation(before: number) {
    const plan = lifecycle.reservation;
    if (!model || !plan || plan.state === "blocked" || plan.startsAfterGameTimeMs === undefined ||
      plan.startsAfterGameTimeMs > Math.min(before, now)) return;
    const quote = quoteMaintenance(model, lifecycle, plan.kind);
    if (cash < quote.cashCost) {
      lifecycle = { ...lifecycle, reservation: { ...plan, state: "blocked", error: "cash" } };
      return;
    }
    const start = plan.startsAfterGameTimeMs;
    lifecycle = {
      ...beginAircraftMaintenance(lifecycle, model, plan.kind, start),
      reservation: undefined,
      recovery: { startsGameTimeMs: start, completesGameTimeMs: start + quote.durationMs, airportId: currentAirportId }
    };
    cash -= quote.cashCost;
    maintenanceCashCost += quote.cashCost;
    financeEvents.push({ kind: "cash", gameTimeMs: start, category: "extraMaintenance", delta: -quote.cashCost });
    recovering = true;
  }

  if (lifecycle.reservation && !aircraft.schedule.some((item) => item.id === lifecycle.reservation!.afterFlightId && item.status !== "cancelled")) {
    lifecycle = { ...lifecycle, reservation: { ...lifecycle.reservation, state: "blocked", error: "missing" } };
  }

  for (const original of [...aircraft.schedule].sort((a, b) =>
    (a.scheduledDepartureGameTime ?? a.departureGameTime) - (b.scheduledDepartureGameTime ?? b.departureGameTime))) {
    if (original.status === "cancelled") {
      schedule.push(original);
      continue;
    }
    if (original.status === "completed") {
      readyGameTime = Math.max(readyGameTime, original.readyGameTime);
      if (lifecycle.reservation?.afterFlightId === original.id && lifecycle.reservation.state === "scheduled") {
        lifecycle = { ...lifecycle, reservation: { ...lifecycle.reservation, startsAfterGameTimeMs: original.readyGameTime } };
      }
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
      startReservation(departure);
      const recovery = lifecycle.recovery;
      if (recovering && recovery && ((departure >= recovery.startsGameTimeMs && nominalDeparture < recovery.completesGameTimeMs) ||
        (nominalDeparture >= recovery.completesGameTimeMs && item.originAirportId !== timelineAirportId))) {
        schedule.push({
          ...item, status: "cancelled", operationalStatus: "cancelled",
          cancellationReason: nominalDeparture < recovery.completesGameTimeMs ? "maintenance" : "position",
          actualDepartureGameTime: undefined, actualArrivalGameTime: undefined,
          revenue: 0, cost: 0, profit: 0, passengerCount: 0, cargoTons: 0
        });
        continue;
      }
      const maintenanceEnd = lifecycle.maintenance?.completesGameTimeMs;
      const maintenanceDelayMinutes = maintenanceEnd ? Math.max(0, (maintenanceEnd - departure) / 60_000) : (item.maintenanceDelayMinutes ?? 0);
      departure += maintenanceDelayMinutes * 60_000;
      lifecycle = completeAircraftMaintenance(lifecycle, Math.min(now, departure));
      if (getMaintenanceStatus(lifecycle, Math.min(now, departure)) === "grounded") {
        if (lifecycle.reservation?.state === "scheduled") {
          lifecycle = { ...lifecycle, reservation: { ...lifecycle.reservation, state: "blocked", error: "grounded" } };
        }
        schedule.push({ ...item, operationalStatus: "grounded", actualDepartureGameTime: undefined, actualArrivalGameTime: undefined });
        continue;
      }
      const shouldCheckTechnical = !item.technicalChecked && now >= departure;
      const technicalMinutes = shouldCheckTechnical ? technicalDelayMinutes(item.id, lifecycle, departure) : (item.technicalDelayMinutes ?? 0);
      departure += technicalMinutes * 60_000;
      if (recovering && recovery && departure >= recovery.completesGameTimeMs) {
        recovering = false;
        if (now >= departure) lifecycle = { ...lifecycle, recovery: undefined };
      }
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
    timelineAirportId = item.destinationAirportId;
    if (now >= item.arrivalGameTime) {
      const financials = estimateFlightFinancials(route, model, aircraft, item.departureGameTime + item.arrivalGameTime, difficulty,
        { departureGameTimeMs: item.departureGameTime, originAirportId: item.originAirportId });
      lifecycle = recordAircraftFlight(lifecycle, item.arrivalGameTime - item.departureGameTime, financials.economics.estimatedMaintenanceReservePerFlight);
      currentAirportId = item.destinationAirportId;
      const accounting = {
        revenue: financials.revenue, cost: financials.cost, profit: financials.profit,
        passengerCount: financials.passengerCount, cargoTons: financials.cargoTons
      };
      const entry: FlightLogEntry = {
        id: item.id, aircraftId: aircraft.id, aircraftRegistration: aircraft.registration,
        flightNumber: item.flightNumber, routeId: route.id, originAirportId: item.originAirportId,
        destinationAirportId: item.destinationAirportId, completedGameTime: item.arrivalGameTime, ...accounting
      };
      entries.push(entry);
      const [fuelCost, crewCost, airportCost, maintenanceReserve] = splitRoundedCost(accounting.cost, [
        financials.economics.estimatedFuelCostPerFlight, financials.economics.estimatedCrewCostPerFlight,
        financials.economics.estimatedAirportCostPerFlight, financials.economics.estimatedMaintenanceReservePerFlight
      ]);
      const passengerRevenue = Math.min(accounting.revenue, Math.round(financials.economics.revenue.passengerRevenue));
      financeEvents.push({ kind: "flight", gameTimeMs: item.arrivalGameTime, departureGameTimeMs: item.actualDepartureGameTime ?? item.departureGameTime, entry,
        values: { passengerRevenue, cargoRevenue: accounting.revenue - passengerRevenue, fuelCost, crewCost, airportCost, maintenanceReserve,
          passengerCapacity: financials.economics.passengerCapacity, cargoCapacity: aircraft.cabinLayout.cargoTons } });
      cash += accounting.profit;
      // Persist actual accounting, not the large derived economics/demand preview.
      schedule.push({ ...item, ...accounting, status: "completed", operationalStatus: "arrived" });
      if (lifecycle.reservation?.afterFlightId === item.id && lifecycle.reservation.state === "scheduled") {
        lifecycle = { ...lifecycle, reservation: { ...lifecycle.reservation, startsAfterGameTimeMs: item.readyGameTime } };
      }
    } else if (now >= item.departureGameTime) {
      schedule.push({ ...item, status: "in-flight", operationalStatus: "departed" });
    } else {
      schedule.push(item);
    }
  }

  startReservation(now);
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
      totalProfit: (aircraft.totalProfit ?? 0) + entries.reduce((sum, entry) => sum + entry.profit, 0) - maintenanceCashCost,
      operationsThroughGameTimeMs: now,
      lastCompletedFlightGameTimeMs: entries.reduce((latest, entry) => Math.max(latest, entry.completedGameTime), aircraft.lastCompletedFlightGameTimeMs ?? 0) || undefined,
      passengerCount: aircraft.passengerCount + entries.reduce((sum, entry) => sum + entry.passengerCount, 0),
      cargoTransportedTons: Math.round((aircraft.cargoTransportedTons + entries.reduce((sum, entry) => sum + entry.cargoTons, 0)) * 10) / 10
    },
    entries,
    maintenanceCashCost,
    financeEvents
  };
}
