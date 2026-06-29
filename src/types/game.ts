export type AirportSizeTier = "regional" | "large" | "mega";
export type CabinClass = "first" | "business" | "premiumEconomy" | "economy";
export type AircraftStatus = "idle" | "scheduled" | "in-flight";
export type FlightStatus = "scheduled" | "in-flight" | "completed";
export type RouteBand = "short-haul" | "medium-haul" | "long-haul";
export type AircraftVisualVariant = "narrow-body" | "wide-body" | "long-haul-wide-body";
export type TimeMultiplier = 1 | 5 | 10 | 20 | 50 | 100;
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type LeaderboardSort = "valuation" | "profit" | "fleet" | "routes" | "completedFlights";

export interface Airport {
  id: string;
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  sizeTier: AirportSizeTier;
  baseDemandScore: number;
}

export interface AircraftModel {
  id: string;
  manufacturer: string;
  model: string;
  imageUrl?: string;
  imageAlt: string;
  imageCredit?: string;
  type: "narrowbody" | "widebody";
  visualVariant: AircraftVisualVariant;
  recommendedRouteType: RouteBand | "all-rounder";
  rangeKm: number;
  cruiseSpeedKmh: number;
  seatCapacity: number;
  maxPassengerSeats: number;
  maxCargoTons: number;
  cabinLimits: CabinLimits;
  suggestedLayout: CabinLayout;
  firstClassSeats: number;
  businessClassSeats: number;
  premiumEconomySeats: number;
  economySeats: number;
  estimatedPriceGBP: number;
  fuelCostPerKm: number;
  turnaroundMinutes: number;
}

export interface CabinLayout {
  first: number;
  business: number;
  premiumEconomy: number;
  economy: number;
  cargoTons: number;
}

export type SeatCabinLayout = Omit<CabinLayout, "cargoTons">;

export interface CabinLimit {
  min: number;
  max: number;
}

export type CabinLimits = Record<CabinClass, CabinLimit>;

export interface CabinDemand {
  first: number;
  business: number;
  premiumEconomy: number;
  economy: number;
  cargoTons: number;
}

export type CabinPrices = Record<CabinClass, number>;

export type RoutePricing = CabinPrices & {
  cargo: number;
};

export interface Route {
  id: string;
  originAirportId: string;
  destinationAirportId: string;
  distanceKm: number;
  estimatedDemand: CabinDemand;
  estimatedTicketPrices: CabinPrices;
  estimatedCargoRatePerTon: number;
  recommendedPricing?: RoutePricing;
  pricing?: RoutePricing;
  isOpen: boolean;
}

export interface AircraftInstance {
  id: string;
  modelId: string;
  registration: string;
  currentAirportId: string;
  status: AircraftStatus;
  schedule: ScheduleItem[];
  weeklySchedules: WeeklySchedule[];
  cabinLayout: CabinLayout;
  purchasePriceGBP: number;
  totalRevenue: number;
  totalFlights: number;
  passengerCount: number;
  cargoTransportedTons: number;
}

export interface ScheduleItem {
  id: string;
  weeklyScheduleId?: string;
  routeId: string;
  aircraftId: string;
  flightNumber?: string;
  legType?: "outbound" | "return";
  originAirportId: string;
  destinationAirportId: string;
  departureGameTime: number;
  arrivalGameTime: number;
  readyGameTime: number;
  status: FlightStatus;
  isRecurring?: boolean;
  operatingDay?: DayOfWeek;
  revenue?: number;
  cost?: number;
  profit?: number;
  passengerCount?: number;
  cargoTons?: number;
}

export interface WeeklySchedule {
  id: string;
  aircraftId: string;
  routeId: string;
  outboundFlightNumber: string;
  returnFlightNumber?: string;
  daysOfWeek: DayOfWeek[];
  departureTimeLocal: string;
  isRoundTrip: boolean;
  blockMinutes: number;
  turnaroundMinutes: number;
  recurrenceRule: string;
  createdGameTime: number;
  createdAt: string;
  updatedAt: string;
}

export interface FlightLogEntry {
  id: string;
  aircraftId: string;
  aircraftRegistration: string;
  flightNumber?: string;
  routeId: string;
  originAirportId: string;
  destinationAirportId: string;
  completedGameTime: number;
  revenue: number;
  cost: number;
  profit: number;
  passengerCount: number;
  cargoTons: number;
}

export interface GameState {
  airlineName: string;
  baseAirportId: string;
  expandedAirportIds: string[];
  money: number;
  startedAtRealMs: number;
  baseGameTimeMs: number;
  currentGameTimeMs: number;
  timeMultiplier: TimeMultiplier;
  isPaused: boolean;
  fleet: AircraftInstance[];
  routes: Route[];
  flightLog: FlightLogEntry[];
  totalProfit: number;
  completedFlights: number;
  passengerCount: number;
  cargoTransportedTons: number;
  lastTickRealMs: number;
}

export interface ActiveFlightInfo {
  item: ScheduleItem;
  aircraft: AircraftInstance;
  progress: number;
  estimatedProfit: number;
}

export interface LeaderboardEntry {
  id: string;
  airlineName: string;
  isPlayer: boolean;
  valuation: number;
  cash: number;
  totalProfit: number;
  fleetSize: number;
  routes: number;
  completedFlights: number;
  passengerCount: number;
  cargoTransportedTons: number;
  updatedAt: number;
}
