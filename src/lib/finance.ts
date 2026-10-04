import type { FlightLogEntry } from "@/types/game";

export const FLIGHT_LOG_SORT_KEYS = ["completedGameTime", "profit", "flightNumber", "passengerCount", "cargoTons", "revenue", "cost"] as const;
export type FlightLogSortKey = typeof FLIGHT_LOG_SORT_KEYS[number];
export type SortDirection = "asc" | "desc";

const flightNumberOrder = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export function sortFlightLog(entries: readonly FlightLogEntry[], key: FlightLogSortKey, direction: SortDirection) {
  return [...entries].sort((left, right) => {
    let comparison: number;
    if (key === "flightNumber") {
      const leftNumber = left.flightNumber?.trim() ?? "";
      const rightNumber = right.flightNumber?.trim() ?? "";
      // Legacy records without a flight number stay last in either direction.
      if (Boolean(leftNumber) !== Boolean(rightNumber)) return leftNumber ? -1 : 1;
      comparison = flightNumberOrder.compare(leftNumber, rightNumber);
    } else {
      comparison = left[key] - right[key];
    }
    return (direction === "asc" ? comparison : -comparison) || right.completedGameTime - left.completedGameTime;
  });
}
