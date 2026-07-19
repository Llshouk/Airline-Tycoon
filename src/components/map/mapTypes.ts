import type { GeoPoint } from "@/lib/mapRoutePath";

export type MapProviderType = "leaflet2d" | "globe3d" | "google" | "apple";

export type MapEngine = "2d" | "globe3d";
export type GlobeQuality = "auto" | "high" | "reduced";
export type EffectiveGlobeQuality = "standard" | Exclude<GlobeQuality, "auto">;
export type MapGlobeFailureReason = "unsupported" | "initialisation" | "render";

export type MapAirportMarker = {
  id: string;
  iata: string;
  name: string;
  city?: string;
  country?: string;
  lat: number;
  lng: number;
  markerType: "base" | "opened" | "unopened";
  isPrimaryBase?: boolean;
};

export type MapRouteLine = {
  id: string;
  originIata: string;
  destinationIata: string;
  origin: GeoPoint;
  destination: GeoPoint;
  points: GeoPoint[];
  status?: "active" | "preview";
  distanceKm?: number;
  assignedAircraftCount?: number;
  weeklyFlightCount?: number;
  isOpen?: boolean;
};

export type MapAircraftMarker = {
  id: string;
  registration: string;
  model: string;
  lat: number;
  lng: number;
  heading: number;
  size: number;
  iconType: string;
  status?: string;
  routeId?: string;
  title?: string;
  flightNumber?: string;
  originIata?: string;
  destinationIata?: string;
  progress?: number;
  remainingMinutes?: number;
  delayMinutes?: number;
  operationalStatus?: string;
};

export type MapLegendLabels = {
  title: string;
  base: string;
  opened: string;
  unopened: string;
};
