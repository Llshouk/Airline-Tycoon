import { DAY_MS, dayStartMs, weekStartMs } from "@/lib/time";
import { FINANCE_VALUE_KEYS, type CashCategory, type FinanceEvent, type FinanceValues, type FinancialDay, type FinancialHistory, type OperatingSummary, type RecentOperatingDay } from "@/types/finance";
import type { GameState } from "@/types/game";

export const REPORT_DAYS = 90;
export const DIAGNOSTIC_DAYS = 7;

export function emptyFinanceValues(): FinanceValues {
  return Object.fromEntries(FINANCE_VALUE_KEYS.map((key) => [key, 0])) as FinanceValues;
}

function number(value: unknown, signed = false) {
  return typeof value === "number" && Number.isFinite(value) ? (signed ? value : Math.max(0, value)) : 0;
}
function money(value: unknown) { return Math.round(number(value, true)); }

function normalizeValues(raw: Partial<FinanceValues>): FinanceValues {
  const values = emptyFinanceValues();
  for (const key of FINANCE_VALUE_KEYS) {
    values[key] = number(raw[key], key === "adjustments" || key === "earlierSettlements");
    if (key !== "cargoTons" && key !== "cargoCapacity") values[key] = Math.round(values[key]);
  }
  return values;
}

export function revenueOf(values: FinanceValues) { return values.passengerRevenue + values.cargoRevenue; }
export function costOf(values: FinanceValues) { return values.fuelCost + values.crewCost + values.airportCost + values.maintenanceReserve; }
export function profitOf(values: FinanceValues) { return revenueOf(values) - costOf(values) - values.extraMaintenance; }
export function cashChangeOf(values: FinanceValues) {
  return profitOf(values) - values.aircraftPurchases - values.routeOpening - values.basePurchases +
    values.subsidies + values.contractRewards + values.adjustments + values.earlierSettlements;
}

export function createFinancialHistory(now: number, openingCash: number): FinancialHistory {
  return { trackingStartedGameTimeMs: now, retainedFromGameTimeMs: dayStartMs(now),
    openingCash: money(openingCash), days: [], recentOperations: [] };
}

function normalizeSummaries(raw: Record<string, OperatingSummary> | undefined) {
  return Object.fromEntries(Object.entries(raw ?? {}).filter(([, value]) => value && typeof value === "object").map(([id, value]) =>
    [id, { flights: Math.floor(number(value.flights)), revenue: money(value.revenue), cost: money(value.cost),
      profit: money(value.profit), lastFlightGameTimeMs: number(value.lastFlightGameTimeMs) }]
  ));
}

export function normalizeFinancialHistory(raw: FinancialHistory | undefined, now: number, currentCash: number): FinancialHistory {
  if (!raw || !Number.isFinite(raw.trackingStartedGameTimeMs) || raw.trackingStartedGameTimeMs > now ||
    !Number.isFinite(raw.retainedFromGameTimeMs) || raw.retainedFromGameTimeMs > now) return createFinancialHistory(now, currentCash);
  const history: FinancialHistory = {
    trackingStartedGameTimeMs: raw.trackingStartedGameTimeMs,
    retainedFromGameTimeMs: dayStartMs(raw.retainedFromGameTimeMs),
    openingCash: money(raw.openingCash),
    days: [],
    recentOperations: []
  };
  const days = new Map<number, FinancialDay>();
  for (const value of (Array.isArray(raw.days) ? raw.days : []).slice(-REPORT_DAYS)) {
    if (!value || !Number.isFinite(value.dayStartGameTimeMs) || value.dayStartGameTimeMs > now || value.dayStartGameTimeMs < history.retainedFromGameTimeMs) continue;
    const day = dayStartMs(value.dayStartGameTimeMs);
    days.set(day, { ...normalizeValues(value), dayStartGameTimeMs: day });
  }
  history.days = [...days.values()];
  history.recentOperations = (Array.isArray(raw.recentOperations) ? raw.recentOperations : []).slice(-DIAGNOSTIC_DAYS)
    .filter((value) => value && Number.isFinite(value.dayStartGameTimeMs) && value.dayStartGameTimeMs <= now)
    .map((value) => ({ dayStartGameTimeMs: dayStartMs(value.dayStartGameTimeMs),
      aircraft: normalizeSummaries(value.aircraft), routes: normalizeSummaries(value.routes) }));
  const pruned = pruneHistory(history, now);
  // Imported/testing adjustments must reconcile cash, never masquerade as sales.
  const difference = money(currentCash) - (pruned.openingCash + pruned.days.reduce((sum, day) => sum + cashChangeOf(day), 0));
  return difference ? applyFinanceEvents(pruned, [{ kind: "cash", gameTimeMs: now, category: "adjustments", delta: difference }], now) : pruned;
}

function pruneHistory(history: FinancialHistory, now: number): FinancialHistory {
  const from = Math.max(history.retainedFromGameTimeMs, dayStartMs(now) - (REPORT_DAYS - 1) * DAY_MS);
  return {
    ...history,
    retainedFromGameTimeMs: from,
    openingCash: history.openingCash + history.days.filter((day) => day.dayStartGameTimeMs < from).reduce((sum, day) => sum + cashChangeOf(day), 0),
    days: history.days.filter((day) => day.dayStartGameTimeMs >= from).sort((a, b) => a.dayStartGameTimeMs - b.dayStartGameTimeMs),
    recentOperations: history.recentOperations.filter((day) => day.dayStartGameTimeMs >= dayStartMs(now) - (DIAGNOSTIC_DAYS - 1) * DAY_MS)
      .sort((a, b) => a.dayStartGameTimeMs - b.dayStartGameTimeMs)
  };
}

export function applyFinanceEvents(history: FinancialHistory, events: readonly FinanceEvent[], now: number): FinancialHistory {
  const days = new Map(history.days.map((value) => [value.dayStartGameTimeMs, { ...value }]));
  const recent = new Map(history.recentOperations.map((value) => [value.dayStartGameTimeMs,
    { ...value, aircraft: { ...value.aircraft }, routes: { ...value.routes } }]));
  let openingCash = history.openingCash;
  for (const event of events) {
    if (!Number.isFinite(event.gameTimeMs) || event.gameTimeMs > now) continue;
    const beforeTracking = event.gameTimeMs < history.trackingStartedGameTimeMs;
    const dayTime = dayStartMs(Math.max(event.gameTimeMs, history.trackingStartedGameTimeMs));
    const delta = event.kind === "flight" ? event.entry.profit : money(event.delta);
    if (dayTime < history.retainedFromGameTimeMs) { openingCash += delta; continue; }
    const day = days.get(dayTime) ?? { ...emptyFinanceValues(), dayStartGameTimeMs: dayTime };
    if (beforeTracking) {
      day.earlierSettlements += delta;
    } else if (event.kind === "cash") {
      if (event.category === "adjustments") day.adjustments += delta;
      else if (event.category === "subsidies" || event.category === "contractRewards") day[event.category] += Math.max(0, delta);
      else day[event.category] += Math.max(0, -delta);
    } else {
      for (const key of Object.keys(event.values) as (keyof typeof event.values)[]) day[key] += event.values[key];
      day.flights += 1;
      day.passengers += event.entry.passengerCount;
      day.cargoTons += event.entry.cargoTons;
      if (dayTime >= dayStartMs(now) - (DIAGNOSTIC_DAYS - 1) * DAY_MS) {
        const operation = recent.get(dayTime) ?? { dayStartGameTimeMs: dayTime, aircraft: {}, routes: {} };
        for (const [collection, id] of [[operation.aircraft, event.entry.aircraftId], [operation.routes, event.entry.routeId]] as const) {
          const old = collection[id] ?? { flights: 0, revenue: 0, cost: 0, profit: 0, lastFlightGameTimeMs: 0 };
          collection[id] = { flights: old.flights + 1, revenue: old.revenue + event.entry.revenue,
            cost: old.cost + event.entry.cost, profit: old.profit + event.entry.profit,
            lastFlightGameTimeMs: Math.max(old.lastFlightGameTimeMs, event.gameTimeMs) };
        }
        recent.set(dayTime, operation);
      }
    }
    days.set(dayTime, day);
  }
  return pruneHistory({ ...history, openingCash, days: [...days.values()], recentOperations: [...recent.values()] }, now);
}

export function withCashReport(game: GameState, previousCash: number, category: CashCategory): GameState {
  const history = normalizeFinancialHistory(game.financialHistory, game.currentGameTimeMs, previousCash);
  return { ...game, financialHistory: applyFinanceEvents(history,
    [{ kind: "cash", gameTimeMs: game.currentGameTimeMs, category, delta: game.money - previousCash }], game.currentGameTimeMs) };
}

// Allocate integer accounting categories so their sum equals the cash settlement.
export function splitRoundedCost(total: number, raw: readonly number[]) {
  const sum = raw.reduce((value, part) => value + Math.max(0, part), 0);
  if (!sum) return raw.map(() => 0);
  const scaled = raw.map((part) => Math.max(0, part) / sum * total);
  const values = scaled.map(Math.floor);
  const order = scaled.map((value, index) => ({ index, fraction: value - values[index] })).sort((a, b) => b.fraction - a.fraction);
  for (let remainder = total - values.reduce((value, part) => value + part, 0), index = 0; remainder > 0; remainder--, index++) values[order[index % order.length].index]++;
  return values;
}

export type FinancialPeriod = FinanceValues & {
  startsGameTimeMs: number; endsGameTimeMs: number; openingCash: number; closingCash: number;
  revenue: number; cost: number; profit: number; cashChange: number; partial: boolean; inProgress: boolean;
};

export function financialDays(history: FinancialHistory, now: number): FinancialPeriod[] {
  const values = new Map(history.days.map((day) => [day.dayStartGameTimeMs, day]));
  let cash = history.openingCash;
  const periods: FinancialPeriod[] = [];
  for (let day = history.retainedFromGameTimeMs; day <= dayStartMs(now); day += DAY_MS) {
    const data = { ...emptyFinanceValues(), ...values.get(day) };
    const change = cashChangeOf(data);
    periods.push({ ...data, startsGameTimeMs: day, endsGameTimeMs: day + DAY_MS, openingCash: cash,
      closingCash: cash + change, cashChange: change, revenue: revenueOf(data), cost: costOf(data), profit: profitOf(data),
      partial: day < history.trackingStartedGameTimeMs, inProgress: day + DAY_MS > now });
    cash += change;
  }
  return periods;
}

export function financialWeeks(days: readonly FinancialPeriod[], history: FinancialHistory, now: number): FinancialPeriod[] {
  const weeks = new Map<number, FinancialPeriod>();
  for (const day of days) {
    const start = weekStartMs(day.startsGameTimeMs);
    const previous = weeks.get(start);
    const week: FinancialPeriod = previous ?? { ...emptyFinanceValues(), startsGameTimeMs: start, endsGameTimeMs: start + 7 * DAY_MS,
      openingCash: day.openingCash, closingCash: day.openingCash, revenue: 0, cost: 0, profit: 0, cashChange: 0,
      partial: start < Math.max(history.trackingStartedGameTimeMs, history.retainedFromGameTimeMs), inProgress: start + 7 * DAY_MS > now };
    for (const key of FINANCE_VALUE_KEYS) week[key] += day[key];
    week.revenue += day.revenue; week.cost += day.cost; week.profit += day.profit; week.cashChange += day.cashChange;
    week.closingCash = day.closingCash;
    weeks.set(start, week);
  }
  return [...weeks.values()];
}

export function recentOperatingTotals(history: FinancialHistory | undefined, now: number, group: keyof Pick<RecentOperatingDay, "aircraft" | "routes">) {
  const totals: Record<string, OperatingSummary> = {};
  for (const day of history?.recentOperations ?? []) {
    if (day.dayStartGameTimeMs < dayStartMs(now) - (DIAGNOSTIC_DAYS - 1) * DAY_MS || day.dayStartGameTimeMs > now) continue;
    for (const [id, value] of Object.entries(day[group])) {
      const old = totals[id] ?? { flights: 0, revenue: 0, cost: 0, profit: 0, lastFlightGameTimeMs: 0 };
      totals[id] = { flights: old.flights + value.flights, revenue: old.revenue + value.revenue, cost: old.cost + value.cost,
        profit: old.profit + value.profit, lastFlightGameTimeMs: Math.max(old.lastFlightGameTimeMs, value.lastFlightGameTimeMs) };
    }
  }
  return totals;
}
