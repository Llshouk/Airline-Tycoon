import type { AircraftModel, CabinClass } from "@/types/game";
import type { SeatGrade, SeatProduct } from "@/types/cabin";

export const SEAT_GRADES: SeatGrade[] = ["basic", "premium", "luxury"];
export const BASE_COMFORT: Record<CabinClass, number> = { first: 80, business: 75, premiumEconomy: 72, economy: 68 };
export const BASE_PITCH: Record<CabinClass, number> = { first: 64, business: 42, premiumEconomy: 36, economy: 31 };
export const FITOUT_PER_SEAT: Record<CabinClass, number> = { first: 750000, business: 320000, premiumEconomy: 90000, economy: 18000 };
export const GRADE_PRICE = { basic: 1, premium: 1.4, luxury: 1.9 };
export const GRADE_COMFORT = { basic: 0, premium: 7, luxury: 14 };
export const EXPERIENCE_DAYS = 7;
const productCache = new WeakMap<AircraftModel, Partial<Record<CabinClass, SeatProduct[]>>>();

// Gameplay profiles, not certified engineering layouts. Cabin width is preset,
// and each product reserves aisle/seat space rather than allowing arbitrary widths.
// TODO: replace calibrated space budgets with verified per-model cabin dimensions.
export function seatProducts(model: AircraftModel, cabin: CabinClass): SeatProduct[] {
  const cached = productCache.get(model)?.[cabin];
  if (cached) return cached;
  if (model.cabinLimits[cabin].max <= 0 || (cabin === "first" && model.type === "narrowbody")) return [];
  const wide = model.type === "widebody";
  const economyLayout = !wide ? (model.id === "a220-300" ? "2-3" : "3-3")
    : model.family.includes("777") ? "3-4-3" : model.family.includes("787") || model.family.includes("a350") ? "3-3-3" : "2-4-2";
  const arrangements: Record<CabinClass, string[]> = {
    first: ["1-2-1", "1-2-1", "1-1-1"],
    business: wide ? ["2-2-2", "1-2-1", "1-1-1"] : ["2-2", "2-2", "1-1"],
    premiumEconomy: wide ? ["2-3-2", "2-3-2", "2-2-2"] : ["2-3", "2-3", "2-2"],
    economy: [economyLayout, economyLayout, !wide ? "2-2" : "2-3-2"]
  };
  const widths: Record<CabinClass, number[]> = {
    first: [23, 24, 28], business: [20, 21, 24], premiumEconomy: [18.5, 19, 20], economy: [17.5, 18, 20]
  };
  const ranges: Record<CabinClass, [number, number]> = {
    first: [56, 90], business: [36, 64], premiumEconomy: [33, 44], economy: [28, 38]
  };
  const products = SEAT_GRADES.map((grade, index) => {
    const arrangement = arrangements[cabin][index];
    const minPitch = ranges[cabin][0] + (grade === "luxury" ? 4 : grade === "premium" ? 2 : 0);
    return { grade, arrangement, seatsPerRow: arrangement.split("-").reduce((sum, part) => sum + Number(part), 0),
      widthInches: widths[cabin][index], minPitch, maxPitch: ranges[cabin][1],
      defaultPitch: Math.max(minPitch, BASE_PITCH[cabin] + (grade === "luxury" ? 4 : grade === "premium" ? 2 : 0)) };
  });
  productCache.set(model, { ...productCache.get(model), [cabin]: products });
  return products;
}
