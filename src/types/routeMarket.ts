import type { CabinClass, CabinDemand, SeatCabinLayout } from "@/types/game";

export type FlightBooking = {
  modelVersion: 2;
  soldSeats: SeatCabinLayout;
  passengerCount: number;
  cargoTons: number;
  revenue: number;
  cost: number;
  profit: number;
  passengerRevenue: number;
  costs: [number, number, number, number];
  passengerCapacity: number;
  cargoCapacity: number;
  nightDemandMultiplier: number;
  // Seat experience and price/value are frozen with the departure booking.
  experienceScores?: Record<CabinClass, number>;
};
export type MarketWindow = {
  key: string;
  endsGameTimeMs: number;
  // Reference-price demand equivalents prevent price changes resetting the pool.
  consumed: CabinDemand;
  bookedFlightIds: string[];
};
export type RouteMarketState = { schemaVersion: 1; windows: MarketWindow[] };
