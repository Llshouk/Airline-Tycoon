import { BASE_COMFORT, EXPERIENCE_DAYS } from "@/config/cabinProducts";
import { CABIN_CLASSES } from "@/lib/cabin";
import { cabinComfort, cabinFareMultiplier } from "@/lib/cabinConfiguration";
import { DAY_MS } from "@/lib/time";
import type { AircraftInstance, AircraftModel, CabinClass, Route } from "@/types/game";
import type { CabinAircraft, CabinExperienceDay, PassengerExperience } from "@/types/cabin";
import type { FlightBooking } from "@/types/routeMarket";

function emptyCabins(): CabinExperienceDay["cabins"] {
  return { first: { passengers: 0, scoreTotal: 0 }, business: { passengers: 0, scoreTotal: 0 },
    premiumEconomy: { passengers: 0, scoreTotal: 0 }, economy: { passengers: 0, scoreTotal: 0 } };
}

export function normalizePassengerExperience(raw: PassengerExperience | undefined, now: number): PassengerExperience | undefined {
  if (raw?.version !== 1 || !Array.isArray(raw.days)) return undefined;
  const today = Math.floor(now / DAY_MS);
  const days = new Map<number, CabinExperienceDay>();
  for (const item of raw.days) {
    if (!item || !Number.isInteger(item.day) || item.day > today || item.day <= today - EXPERIENCE_DAYS) continue;
    const day = days.get(item.day) ?? { day: item.day, cabins: emptyCabins() };
    for (const cabin of CABIN_CLASSES) {
      const value = item.cabins?.[cabin];
      if (!value || !Number.isFinite(value.passengers) || !Number.isFinite(value.scoreTotal) || value.passengers <= 0) continue;
      const passengers = Math.min(1e9, Math.floor(value.passengers));
      day.cabins[cabin].passengers += passengers;
      day.cabins[cabin].scoreTotal += Math.min(passengers * 100, Math.max(0, value.scoreTotal));
    }
    days.set(item.day, day);
  }
  return { version: 1, days: [...days.values()].sort((a, b) => a.day - b.day) };
}

export function passengerExperienceSummary(fleet: Pick<AircraftInstance, "passengerExperience">[], now: number, cabin?: CabinClass) {
  let passengers = 0;
  let scoreTotal = 0;
  for (const aircraft of fleet) for (const day of normalizePassengerExperience(aircraft.passengerExperience, now)?.days ?? []) {
    for (const key of cabin ? [cabin] : CABIN_CLASSES) {
      passengers += day.cabins[key].passengers;
      scoreTotal += day.cabins[key].scoreTotal;
    }
  }
  return { passengers, score: passengers ? Math.round(scoreTotal / passengers * 10) / 10 : null };
}

export function reputationAttractiveness(aircraft: CabinAircraft, cabin: CabinClass, now: number) {
  const summary = passengerExperienceSummary([aircraft], now, cabin);
  if (summary.score === null) return 1;
  const confidence = summary.passengers / (summary.passengers + 300);
  return 1 + Math.max(-0.08, Math.min(0.08, (summary.score - 70) * 0.002 * confidence));
}

export function flightExperienceScores(route: Route, model: AircraftModel, aircraft: CabinAircraft) {
  const duration = route.distanceKm / model.cruiseSpeedKmh;
  const reference = route.recommendedPricing ?? { ...route.estimatedTicketPrices, cargo: route.estimatedCargoRatePerTon };
  const prices = route.pricing ?? reference;
  const scores = {} as Record<CabinClass, number>;
  for (const cabin of CABIN_CLASSES) {
    const comfort = cabinComfort(model, aircraft.cabinConfiguration, cabin, duration);
    const willingness = reference[cabin] * cabinFareMultiplier(model, aircraft.cabinConfiguration, cabin, duration);
    const price = prices[cabin];
    const value = Number.isFinite(price) && price >= 0 ? Math.max(-30, Math.min(15, 22 * Math.log(Math.max(1, willingness) / Math.max(1, price)))) : -30;
    scores[cabin] = Math.round(Math.max(0, Math.min(100, 70 + (comfort - BASE_COMFORT[cabin]) * 0.8 + value)));
  }
  return scores;
}

/** Called only for newly completed, departure-booked flights, never previews. */
export function recordPassengerExperience(raw: PassengerExperience | undefined, booking: FlightBooking, arrival: number, delayMinutes: number) {
  const history = normalizePassengerExperience(raw, arrival);
  if (!booking.experienceScores || booking.passengerCount <= 0) return { history, score: undefined };
  const days = history?.days ?? [];
  const key = Math.floor(arrival / DAY_MS);
  const day = days.find((item) => item.day === key) ?? { day: key, cabins: emptyCabins() };
  if (!days.includes(day)) days.push(day);
  const delayPenalty = Math.min(24, Math.max(0, Number.isFinite(delayMinutes) ? delayMinutes : 0) / 10);
  let count = 0;
  let total = 0;
  for (const cabin of CABIN_CLASSES) {
    const passengers = booking.soldSeats[cabin];
    const baseScore = booking.experienceScores[cabin];
    if (!Number.isFinite(passengers) || passengers <= 0 || !Number.isFinite(baseScore)) continue;
    const score = Math.round(Math.max(0, Math.min(100, baseScore - delayPenalty)));
    day.cabins[cabin].passengers += passengers;
    day.cabins[cabin].scoreTotal += passengers * score;
    count += passengers;
    total += passengers * score;
  }
  return { history: { version: 1 as const, days }, score: count ? Math.round(total / count * 10) / 10 : undefined };
}
