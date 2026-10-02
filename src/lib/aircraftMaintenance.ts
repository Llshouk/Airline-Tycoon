import { DAY_MS } from "@/lib/time";
import type { AircraftInstance, AircraftLifecycle, AircraftModel, MaintenanceKind } from "@/types/game";

const HOUR_MS = 60 * 60 * 1000;

// Gameplay assumptions, not certified real-world airworthiness limits.
// TODO: Add verified model-specific reliability and service intervals when data is available.
export const MAINTENANCE_RULES = {
  serviceHours: 500,
  serviceCycles: 250,
  serviceDays: 90,
  dueCondition: 70,
  groundingCondition: 30,
  wearPerHour: 0.035,
  wearPerCycle: 0.045,
  baseReliability: 99.5,
  maxTechnicalDelayMinutes: 90
} as const;

function nonnegative(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

/** One compatibility boundary for purchase, local/cloud restoration and simulation. */
export function normalizeAircraftLifecycle(aircraft: Pick<AircraftInstance, "lifecycle" | "totalFlights">, now: number): AircraftLifecycle {
  const raw = aircraft.lifecycle;
  const acquiredGameTimeMs = Math.min(now, nonnegative(raw?.acquiredGameTimeMs, now));
  const lastServiceGameTimeMs = Math.max(acquiredGameTimeMs, Math.min(now, nonnegative(raw?.lastServiceGameTimeMs, now)));
  const task = raw?.maintenance;
  const maintenance = task && (task.kind === "inspection" || task.kind === "service") &&
    Number.isFinite(task.startedGameTimeMs) && Number.isFinite(task.completesGameTimeMs) &&
    task.startedGameTimeMs >= acquiredGameTimeMs && task.completesGameTimeMs > task.startedGameTimeMs
    ? {
        ...task,
        totalCost: nonnegative(task.totalCost),
        reserveUsed: nonnegative(task.reserveUsed),
        cashCost: nonnegative(task.cashCost)
      }
    : undefined;
  return {
    acquiredGameTimeMs,
    flightHours: nonnegative(raw?.flightHours),
    flightCycles: Math.floor(nonnegative(raw?.flightCycles, nonnegative(aircraft.totalFlights))),
    condition: Math.min(100, nonnegative(raw?.condition, 100)),
    lastServiceGameTimeMs,
    hoursSinceService: nonnegative(raw?.hoursSinceService),
    cyclesSinceService: Math.floor(nonnegative(raw?.cyclesSinceService)),
    reserveBalance: nonnegative(raw?.reserveBalance),
    totalMaintenanceCost: nonnegative(raw?.totalMaintenanceCost),
    totalMaintenanceCashCost: nonnegative(raw?.totalMaintenanceCashCost),
    maintenance
  };
}

export function getMaintenanceStatus(lifecycle: AircraftLifecycle, now: number) {
  if (lifecycle.maintenance && now < lifecycle.maintenance.completesGameTimeMs) return "maintenance" as const;
  if (lifecycle.condition <= MAINTENANCE_RULES.groundingCondition) return "grounded" as const;
  const intervalUsage = Math.max(
    lifecycle.hoursSinceService / MAINTENANCE_RULES.serviceHours,
    lifecycle.cyclesSinceService / MAINTENANCE_RULES.serviceCycles,
    Math.max(0, now - lifecycle.lastServiceGameTimeMs) / (DAY_MS * MAINTENANCE_RULES.serviceDays)
  );
  if (intervalUsage >= 1 || lifecycle.condition <= MAINTENANCE_RULES.dueCondition) return "due" as const;
  if (intervalUsage >= 0.8 || lifecycle.condition <= 80) return "soon" as const;
  return "healthy" as const;
}

export function aircraftAgeYears(lifecycle: AircraftLifecycle, now: number) {
  return Math.max(0, now - lifecycle.acquiredGameTimeMs) / (365.25 * DAY_MS);
}

/** Reliability is a percent; technical disruption probability is bounded to 0.5-20%. */
export function aircraftReliability(lifecycle: AircraftLifecycle, now: number) {
  const status = getMaintenanceStatus({ ...lifecycle, maintenance: undefined }, now);
  const overduePenalty = status === "due" || status === "grounded" ? 2 : 0;
  return Math.max(80, Math.min(MAINTENANCE_RULES.baseReliability,
    MAINTENANCE_RULES.baseReliability - (100 - lifecycle.condition) * 0.12 -
    Math.min(30, aircraftAgeYears(lifecycle, now)) * 0.12 -
    Math.min(2, lifecycle.hoursSinceService / MAINTENANCE_RULES.serviceHours) * 0.4 -
    Math.min(2, lifecycle.cyclesSinceService / MAINTENANCE_RULES.serviceCycles) * 0.4 - overduePenalty
  ));
}

export function recordAircraftFlight(lifecycle: AircraftLifecycle, durationMs: number, reserve: number): AircraftLifecycle {
  const hours = nonnegative(durationMs) / HOUR_MS;
  return {
    ...lifecycle,
    flightHours: lifecycle.flightHours + hours,
    flightCycles: lifecycle.flightCycles + 1,
    hoursSinceService: lifecycle.hoursSinceService + hours,
    cyclesSinceService: lifecycle.cyclesSinceService + 1,
    condition: Math.max(0, lifecycle.condition - hours * MAINTENANCE_RULES.wearPerHour - MAINTENANCE_RULES.wearPerCycle),
    reserveBalance: lifecycle.reserveBalance + nonnegative(reserve)
  };
}

export function quoteMaintenance(model: AircraftModel, lifecycle: AircraftLifecycle, kind: MaintenanceKind) {
  // TODO: Support future bookings and base workshop capacity; V1.5 starts work immediately on the ground.
  const sizeFactor = model.type === "widebody" ? 1.6 : 1;
  const labourCost = Math.round((kind === "inspection" ? 12_000 : 65_000) * sizeFactor);
  const partsCost = Math.round((100 - lifecycle.condition) * (kind === "inspection" ? 200 : 1_800) * sizeFactor);
  const totalCost = labourCost + partsCost;
  // Reserve was already charged in V1.4 flight cost; only the shortfall is new cash/profit cost.
  const reserveUsed = Math.min(totalCost, lifecycle.reserveBalance);
  return {
    labourCost,
    partsCost,
    totalCost,
    reserveUsed,
    cashCost: totalCost - reserveUsed,
    durationMs: (kind === "inspection" ? 2 : model.type === "widebody" ? 12 : 8) * HOUR_MS,
    resultingCondition: kind === "service" ? 100 : Math.min(100, lifecycle.condition + 8)
  };
}

export function beginAircraftMaintenance(lifecycle: AircraftLifecycle, model: AircraftModel, kind: MaintenanceKind, now: number): AircraftLifecycle {
  const quote = quoteMaintenance(model, lifecycle, kind);
  return {
    ...lifecycle,
    reserveBalance: lifecycle.reserveBalance - quote.reserveUsed,
    totalMaintenanceCost: lifecycle.totalMaintenanceCost + quote.totalCost,
    totalMaintenanceCashCost: lifecycle.totalMaintenanceCashCost + quote.cashCost,
    maintenance: {
      kind,
      startedGameTimeMs: now,
      completesGameTimeMs: now + quote.durationMs,
      totalCost: quote.totalCost,
      reserveUsed: quote.reserveUsed,
      cashCost: quote.cashCost
    }
  };
}

export function completeAircraftMaintenance(lifecycle: AircraftLifecycle, now: number): AircraftLifecycle {
  const task = lifecycle.maintenance;
  if (!task || now < task.completesGameTimeMs) return lifecycle;
  return {
    ...lifecycle,
    condition: task.kind === "service" ? 100 : Math.min(100, lifecycle.condition + 8),
    lastServiceGameTimeMs: task.kind === "service" ? task.completesGameTimeMs : lifecycle.lastServiceGameTimeMs,
    hoursSinceService: task.kind === "service" ? 0 : lifecycle.hoursSinceService,
    cyclesSinceService: task.kind === "service" ? 0 : lifecycle.cyclesSinceService,
    maintenance: undefined
  };
}

/** Deterministic per-flight outcome; a reload or an extra tick cannot reroll it. */
export function technicalDelayMinutes(flightId: string, lifecycle: AircraftLifecycle, departureGameTime: number) {
  let hash = 2166136261;
  for (let index = 0; index < flightId.length; index += 1) hash = Math.imul(hash ^ flightId.charCodeAt(index), 16777619);
  const chance = (hash >>> 0) / 4294967296;
  if (chance >= (100 - aircraftReliability(lifecycle, departureGameTime)) / 100) return 0;
  return 15 + ((hash >>> 8) % (MAINTENANCE_RULES.maxTechnicalDelayMinutes - 14));
}
