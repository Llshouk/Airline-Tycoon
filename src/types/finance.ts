import type { FlightLogEntry } from "@/types/game";

export const FINANCE_VALUE_KEYS = [
  "passengerRevenue", "cargoRevenue", "fuelCost", "crewCost", "airportCost", "maintenanceReserve",
  "extraMaintenance", "aircraftPurchases", "routeOpening", "basePurchases", "subsidies", "adjustments",
  "contractRewards", "earlierSettlements", "flights", "passengers", "cargoTons", "passengerCapacity", "cargoCapacity"
] as const;
export type FinanceValueKey = typeof FINANCE_VALUE_KEYS[number];
export type FinanceValues = Record<FinanceValueKey, number>;
export type CashCategory = "extraMaintenance" | "aircraftPurchases" | "routeOpening" | "basePurchases" | "subsidies" | "adjustments" | "contractRewards";

export type FinancialDay = FinanceValues & { dayStartGameTimeMs: number };
export type OperatingSummary = { flights: number; revenue: number; cost: number; profit: number; lastFlightGameTimeMs: number;
  passengers?: number; cargoTons?: number; passengerCapacity?: number; cargoCapacity?: number;
  passengerRevenue?: number; cargoRevenue?: number; observedFlights?: number };
export type RecentOperatingDay = {
  dayStartGameTimeMs: number;
  aircraft: Record<string, OperatingSummary>;
  routes: Record<string, OperatingSummary>;
};
export type FinancialHistory = {
  trackingStartedGameTimeMs: number;
  retainedFromGameTimeMs: number;
  openingCash: number;
  days: FinancialDay[];
  recentOperations: RecentOperatingDay[];
};
export type FinanceEvent =
  | { kind: "cash"; gameTimeMs: number; category: CashCategory; delta: number }
  | { kind: "flight"; gameTimeMs: number; departureGameTimeMs?: number; entry: FlightLogEntry;
      values: Pick<FinanceValues, "passengerRevenue" | "cargoRevenue" | "fuelCost" | "crewCost" | "airportCost" | "maintenanceReserve" | "passengerCapacity" | "cargoCapacity"> };
