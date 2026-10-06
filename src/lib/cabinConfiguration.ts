import { BASE_COMFORT, BASE_PITCH, FITOUT_PER_SEAT, GRADE_COMFORT, GRADE_PRICE, seatProducts } from "@/config/cabinProducts";
import { CABIN_CLASSES, getDefaultCabinConfig, totalPassengerSeats } from "@/lib/cabin";
import type { AircraftModel, CabinClass, CabinLayout } from "@/types/game";
import type { CabinConfiguration, SeatGrade } from "@/types/cabin";

export function cabinLengthInches(model: AircraftModel) {
  const product = seatProducts(model, "economy")[0];
  return model.maxPassengerSeats / product.seatsPerRow * product.minPitch;
}

export function normalizeCabinConfiguration(model: AircraftModel, raw: CabinConfiguration): CabinConfiguration {
  const sections = {} as CabinConfiguration["sections"];
  for (const cabin of CABIN_CLASSES) {
    const value = raw?.sections?.[cabin];
    const products = seatProducts(model, cabin);
    const product = products.find((item) => item.grade === value?.grade) ?? products[0];
    sections[cabin] = { grade: product?.grade ?? "basic",
      pitchInches: product ? clamp(Math.round(finite(value?.pitchInches, product.defaultPitch)), product.minPitch, product.maxPitch) : BASE_PITCH[cabin],
      spacePercent: product ? Math.round(clamp(finite(value?.spacePercent), 0, 100) * 100) / 100 : 0 };
  }
  const total = CABIN_CLASSES.reduce((sum, cabin) => sum + sections[cabin].spacePercent, 0);
  if (total > 100) for (const cabin of CABIN_CLASSES) sections[cabin].spacePercent *= 100 / total;
  const config: CabinConfiguration = { version: 1, sections, cargoTons: Math.max(0, finite(raw?.cargoTons)) };
  config.cargoTons = Math.round(Math.min(config.cargoTons, configuredCargoLimit(model, config)) * 10) / 10;
  return config;
}

export function defaultCabinConfiguration(model: AircraftModel, maximumSeats = false): CabinConfiguration {
  const layout = getDefaultCabinConfig(model);
  const lengths = CABIN_CLASSES.map((cabin) => {
    const product = seatProducts(model, cabin)[0];
    return product ? layout[cabin] / product.seatsPerRow * product.defaultPitch : 0;
  });
  const total = lengths.reduce((sum, value) => sum + value, 0);
  const sections = {} as CabinConfiguration["sections"];
  CABIN_CLASSES.forEach((cabin, index) => {
    sections[cabin] = { grade: "basic", pitchInches: maximumSeats && cabin === "economy" ? seatProducts(model, "economy")[0].minPitch : BASE_PITCH[cabin],
      spacePercent: maximumSeats ? (cabin === "economy" ? 100 : 0) : Math.floor(lengths[index] / Math.max(1, total) * 100) };
  });
  if (!maximumSeats) sections.economy.spacePercent += 100 - CABIN_CLASSES.reduce((sum, cabin) => sum + sections[cabin].spacePercent, 0);
  return normalizeCabinConfiguration(model, { version: 1, sections, cargoTons: layout.cargoTons });
}

export function configuredSection(model: AircraftModel, config: CabinConfiguration, cabin: CabinClass) {
  const section = config.sections[cabin];
  const product = seatProducts(model, cabin).find((item) => item.grade === section.grade);
  const length = cabinLengthInches(model) * section.spacePercent / 100;
  const rows = product ? Math.max(0, Math.min(Math.floor((length + 1e-8) / section.pitchInches),
    Math.floor(model.cabinLimits[cabin].max / product.seatsPerRow))) : 0;
  return { product, length, rows, seats: rows * (product?.seatsPerRow ?? 0) };
}

export function configuredCargoLimit(model: AircraftModel, config: CabinConfiguration) {
  const usedLength = CABIN_CLASSES.reduce((sum, cabin) => sum + configuredSection(model, config, cabin).rows * config.sections[cabin].pitchInches, 0);
  return Math.floor(model.maxCargoTons * (1 - Math.min(1, usedLength / cabinLengthInches(model)) * 0.45) * 10) / 10;
}

export function configuredCabinLayout(model: AircraftModel, config: CabinConfiguration): CabinLayout {
  return { first: configuredSection(model, config, "first").seats, business: configuredSection(model, config, "business").seats,
    premiumEconomy: configuredSection(model, config, "premiumEconomy").seats, economy: configuredSection(model, config, "economy").seats,
    cargoTons: Math.round(Math.min(Math.max(0, finite(config.cargoTons)), configuredCargoLimit(model, config)) * 10) / 10 };
}

export function configuredPurchasePrice(model: AircraftModel, config: CabinConfiguration) {
  const layout = configuredCabinLayout(model, config);
  return Math.round(model.estimatedPriceGBP + layout.cargoTons * 120000 + CABIN_CLASSES.reduce((sum, cabin) =>
    sum + layout[cabin] * FITOUT_PER_SEAT[cabin] * GRADE_PRICE[config.sections[cabin].grade], 0));
}

export function validateCabinConfiguration(model: AircraftModel, config: CabinConfiguration, expectedLayout?: CabinLayout) {
  const errors: string[] = [];
  if (config.version !== 1) errors.push("Invalid cabin configuration version.");
  for (const cabin of CABIN_CLASSES) {
    const section = config.sections?.[cabin];
    const products = seatProducts(model, cabin);
    const product = products.find((item) => item.grade === section?.grade);
    if (!section || !Number.isFinite(section.spacePercent) || section.spacePercent < 0 || section.spacePercent > 100 ||
      !Number.isInteger(section.pitchInches) || (products.length && (!product || section.pitchInches < product.minPitch || section.pitchInches > product.maxPitch)) ||
      (!products.length && (section.spacePercent !== 0 || section.grade !== "basic" || section.pitchInches !== BASE_PITCH[cabin]))) errors.push(`Invalid ${cabin} seat product or space allocation.`);
  }
  if (errors.length) return { isValid: false, errors, purchasePriceGBP: 0, totalSeats: 0, seatEquivalent: 0 };
  const total = CABIN_CLASSES.reduce((sum, cabin) => sum + config.sections[cabin].spacePercent, 0);
  const layout = configuredCabinLayout(model, config);
  const seats = totalPassengerSeats(layout);
  if (total > 100.000001) errors.push("Cabin space exceeds 100%.");
  if (!seats || seats > model.maxPassengerSeats) errors.push("Invalid total passenger capacity.");
  if (!Number.isFinite(config.cargoTons) || config.cargoTons < 0 || config.cargoTons > configuredCargoLimit(model, config) ||
    Math.abs(config.cargoTons * 10 - Math.round(config.cargoTons * 10)) > 1e-6) errors.push("Invalid cargo capacity.");
  if (expectedLayout && [...CABIN_CLASSES, "cargoTons" as const].some((key) => expectedLayout[key] !== layout[key])) errors.push("Seat counts do not match the cabin configuration.");
  return { isValid: errors.length === 0, errors, purchasePriceGBP: configuredPurchasePrice(model, config), totalSeats: seats,
    seatEquivalent: Math.round(total / 100 * model.maxPassengerSeats) };
}

export function setCabinSpace(model: AircraftModel, config: CabinConfiguration, cabin: CabinClass, percent: number) {
  const next = structuredClone(config);
  if (!seatProducts(model, cabin).length) return next;
  const value = clamp(finite(percent), 0, 100);
  const others = CABIN_CLASSES.filter((key) => key !== cabin && seatProducts(model, key).length);
  const oldTotal = others.reduce((sum, key) => sum + next.sections[key].spacePercent, 0);
  next.sections[cabin].spacePercent = value;
  for (const key of others) next.sections[key].spacePercent = oldTotal ? next.sections[key].spacePercent / oldTotal * (100 - value) : 0;
  if (!oldTotal && others.length) next.sections[others.includes("economy") ? "economy" : others[0]].spacePercent = 100 - value;
  return normalizeCabinConfiguration(model, next);
}

export function setSeatProduct(model: AircraftModel, config: CabinConfiguration, cabin: CabinClass, grade: SeatGrade) {
  const product = seatProducts(model, cabin).find((item) => item.grade === grade);
  if (!product) return config;
  return normalizeCabinConfiguration(model, { ...config, sections: { ...config.sections,
    [cabin]: { ...config.sections[cabin], grade, pitchInches: product.defaultPitch } } });
}

export function cabinComfort(model: AircraftModel, config: CabinConfiguration | undefined, cabin: CabinClass, durationHours = 2) {
  if (!config) return BASE_COMFORT[cabin];
  const section = config.sections[cabin];
  const product = seatProducts(model, cabin).find((item) => item.grade === section.grade);
  if (!product) return BASE_COMFORT[cabin];
  const durationWeight = clamp(durationHours / 6, 0.4, 1.4);
  const pitchScore = clamp((section.pitchInches - BASE_PITCH[cabin]) * (cabin === "economy" ? 2 : 0.8), -14, 10) * durationWeight;
  return Math.round(clamp(BASE_COMFORT[cabin] + GRADE_COMFORT[section.grade] + pitchScore +
    Math.min(3, (product.widthInches - seatProducts(model, cabin)[0].widthInches) * 0.8), 20, 98));
}

export function cabinFareMultiplier(model: AircraftModel, config: CabinConfiguration | undefined, cabin: CabinClass, durationHours: number) {
  return clamp(1 + (cabinComfort(model, config, cabin, durationHours) - BASE_COMFORT[cabin]) * 0.012, 0.82, 1.28);
}

export function cabinExtraOperatingCosts(model: AircraftModel, config: CabinConfiguration | undefined, durationHours: number) {
  if (!config) return { cleaning: 0, maintenance: 0 };
  const layout = configuredCabinLayout(model, config);
  let cleaning = 0;
  let maintenance = 0;
  for (const cabin of CABIN_CLASSES) {
    const grade = config.sections[cabin].grade;
    const factor = grade === "luxury" ? 2 : grade === "premium" ? 1 : 0;
    cleaning += layout[cabin] * factor * (cabin === "first" || cabin === "business" ? 8 : 2);
    maintenance += layout[cabin] * factor * Math.max(0, durationHours) * (cabin === "first" || cabin === "business" ? 4 : 0.7);
  }
  return { cleaning: Math.round(cleaning), maintenance: Math.round(maintenance) };
}

function finite(value: number | undefined, fallback = 0) { return Number.isFinite(value) ? value! : fallback; }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
