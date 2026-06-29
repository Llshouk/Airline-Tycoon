import type { AircraftModel } from "@/types/game";
import { normalizeCabinLayout } from "@/lib/cabin";

export const aircraftModels: AircraftModel[] = [
  model(
    "a220-300",
    "Airbus",
    "A220-300",
    "narrowbody",
    "narrow-body",
    "short-haul",
    6390,
    829,
    145,
    11,
    72000000,
    1450,
    40,
    {
      first: [0, 0],
      business: [0, 20],
      premiumEconomy: [0, 28],
      economy: [80, 145],
      suggested: { first: 0, business: 10, premiumEconomy: 18, economy: 105, cargoTons: 6 }
    },
    { imageUrl: "/aircraft/a220-300.jpg", imageAlt: "Airbus A220-300" }
  ),
  model("a320neo", "Airbus", "A320neo", "narrowbody", "narrow-body", "short-haul", 6300, 840, 180, 13, 95000000, 1750, 45, {
    first: [0, 0],
    business: [0, 24],
    premiumEconomy: [0, 32],
    economy: [110, 180],
    suggested: { first: 0, business: 12, premiumEconomy: 24, economy: 132, cargoTons: 7 }
  }),
  model(
    "a321neo",
    "Airbus",
    "A321neo",
    "narrowbody",
    "narrow-body",
    "medium-haul",
    7400,
    840,
    220,
    15,
    112000000,
    2100,
    50,
    {
      first: [0, 0],
      business: [0, 28],
      premiumEconomy: [0, 40],
      economy: [135, 220],
      suggested: { first: 0, business: 16, premiumEconomy: 28, economy: 160, cargoTons: 8 }
    },
    { imageUrl: "/aircraft/a321neo.jpeg" }
  ),
  model("a330-900neo", "Airbus", "A330-900neo", "widebody", "wide-body", "long-haul", 13330, 871, 287, 38, 235000000, 3900, 75, {
    first: [0, 8],
    business: [18, 46],
    premiumEconomy: [18, 70],
    economy: [150, 287],
    suggested: { first: 4, business: 30, premiumEconomy: 44, economy: 198, cargoTons: 22 }
  }),
  model(
    "a350-900",
    "Airbus",
    "A350-900",
    "widebody",
    "long-haul-wide-body",
    "long-haul",
    15000,
    903,
    315,
    44,
    270000000,
    4300,
    80,
    {
      first: [0, 10],
      business: [24, 56],
      premiumEconomy: [24, 76],
      economy: [170, 315],
      suggested: { first: 6, business: 38, premiumEconomy: 52, economy: 219, cargoTons: 28 }
    },
    { imageUrl: "/aircraft/a350-900.png" }
  ),
  model("a350-1000", "Airbus", "A350-1000", "widebody", "long-haul-wide-body", "long-haul", 16100, 903, 369, 50, 315000000, 4850, 85, {
    first: [0, 12],
    business: [28, 66],
    premiumEconomy: [30, 88],
    economy: [200, 369],
    suggested: { first: 8, business: 44, premiumEconomy: 60, economy: 257, cargoTons: 31 }
  }),
  model("737-max-8", "Boeing", "737 MAX 8", "narrowbody", "narrow-body", "short-haul", 6570, 839, 178, 12, 92000000, 1720, 45, {
    first: [0, 0],
    business: [0, 22],
    premiumEconomy: [0, 30],
    economy: [110, 178],
    suggested: { first: 0, business: 12, premiumEconomy: 20, economy: 136, cargoTons: 7 }
  }),
  model("737-max-9", "Boeing", "737 MAX 9", "narrowbody", "narrow-body", "medium-haul", 6570, 839, 193, 13, 103000000, 1900, 48, {
    first: [0, 0],
    business: [0, 24],
    premiumEconomy: [0, 34],
    economy: [120, 193],
    suggested: { first: 0, business: 14, premiumEconomy: 24, economy: 145, cargoTons: 8 }
  }),
  model("787-9", "Boeing", "787-9", "widebody", "long-haul-wide-body", "long-haul", 14140, 903, 296, 36, 250000000, 4100, 80, {
    first: [0, 8],
    business: [24, 52],
    premiumEconomy: [24, 72],
    economy: [160, 296],
    suggested: { first: 4, business: 36, premiumEconomy: 50, economy: 206, cargoTons: 23 }
  }),
  model("787-10", "Boeing", "787-10", "widebody", "wide-body", "long-haul", 11910, 903, 336, 41, 285000000, 4550, 85, {
    first: [0, 10],
    business: [26, 58],
    premiumEconomy: [28, 82],
    economy: [185, 336],
    suggested: { first: 6, business: 38, premiumEconomy: 54, economy: 238, cargoTons: 25 }
  }),
  model("777-300er", "Boeing", "777-300ER", "widebody", "long-haul-wide-body", "long-haul", 13650, 905, 396, 52, 325000000, 6200, 95, {
    first: [0, 14],
    business: [32, 76],
    premiumEconomy: [34, 96],
    economy: [220, 396],
    suggested: { first: 8, business: 48, premiumEconomy: 64, economy: 276, cargoTons: 34 }
  }),
  model("777-9", "Boeing", "777-9", "widebody", "long-haul-wide-body", "long-haul", 13490, 905, 426, 58, 365000000, 6500, 100, {
    first: [0, 16],
    business: [36, 84],
    premiumEconomy: [40, 110],
    economy: [240, 426],
    suggested: { first: 10, business: 54, premiumEconomy: 70, economy: 292, cargoTons: 38 }
  })
];

export const aircraftById = Object.fromEntries(aircraftModels.map((aircraft) => [aircraft.id, aircraft]));

type CabinTuple = [number, number];

function model(
  id: string,
  manufacturer: string,
  aircraftModel: string,
  type: AircraftModel["type"],
  visualVariant: AircraftModel["visualVariant"],
  recommendedRouteType: AircraftModel["recommendedRouteType"],
  rangeKm: number,
  cruiseSpeedKmh: number,
  seatCapacity: number,
  maxCargoTons: number,
  estimatedPriceGBP: number,
  fuelCostPerKm: number,
  turnaroundMinutes: number,
  limits: {
    first: CabinTuple;
    business: CabinTuple;
    premiumEconomy: CabinTuple;
    economy: CabinTuple;
    suggested: AircraftModel["suggestedLayout"];
  },
  image?: {
    imageUrl?: string;
    imageAlt?: string;
    imageCredit?: string;
  }
): AircraftModel {
  // To replace an aircraft image, put the file in public/aircraft/ and set imageUrl to
  // the root-relative runtime path, for example "/aircraft/a320neo.jpg".
  const imageAlt = `${manufacturer} ${aircraftModel}`;
  const imageUrl = image?.imageUrl ?? `/aircraft/${id}.jpg`;
  const baseModel: AircraftModel = {
    id,
    manufacturer,
    model: aircraftModel,
    imageUrl,
    imageAlt: image?.imageAlt ?? imageAlt,
    ...(image?.imageCredit ? { imageCredit: image.imageCredit } : {}),
    type,
    visualVariant,
    recommendedRouteType,
    rangeKm,
    cruiseSpeedKmh,
    seatCapacity,
    maxPassengerSeats: seatCapacity,
    maxCargoTons,
    cabinLimits: {
      first: { min: limits.first[0], max: limits.first[1] },
      business: { min: limits.business[0], max: limits.business[1] },
      premiumEconomy: { min: limits.premiumEconomy[0], max: limits.premiumEconomy[1] },
      economy: { min: limits.economy[0], max: limits.economy[1] }
    },
    suggestedLayout: limits.suggested,
    firstClassSeats: limits.suggested.first,
    businessClassSeats: limits.suggested.business,
    premiumEconomySeats: limits.suggested.premiumEconomy,
    economySeats: limits.suggested.economy,
    estimatedPriceGBP,
    fuelCostPerKm,
    turnaroundMinutes
  };
  const suggestedLayout = normalizeCabinLayout(baseModel, limits.suggested);

  return {
    ...baseModel,
    suggestedLayout,
    firstClassSeats: suggestedLayout.first,
    businessClassSeats: suggestedLayout.business,
    premiumEconomySeats: suggestedLayout.premiumEconomy,
    economySeats: suggestedLayout.economy
  };
}
