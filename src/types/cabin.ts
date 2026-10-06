import type { AircraftInstance, CabinClass } from "@/types/game";

export type SeatGrade = "basic" | "premium" | "luxury";
export type CabinSection = { grade: SeatGrade; pitchInches: number; spacePercent: number };
export type CabinConfiguration = {
  version: 1 | 2;
  sections: Record<CabinClass, CabinSection>;
  cargoTons: number;
};
export type CabinTemplate = { id: string; name: string; modelId: string; configuration: CabinConfiguration };
export type SeatProduct = {
  grade: SeatGrade;
  arrangement: string;
  seatsPerRow: number;
  widthInches: number;
  minPitch: number;
  maxPitch: number;
  defaultPitch: number;
};
export type CabinExperienceDay = {
  day: number;
  cabins: Record<CabinClass, { passengers: number; scoreTotal: number }>;
};
export type PassengerExperience = { version: 1; days: CabinExperienceDay[] };
export type CabinAircraft = Pick<AircraftInstance, "cabinLayout" | "cabinConfiguration" | "passengerExperience">;
