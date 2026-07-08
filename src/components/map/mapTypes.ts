import type { GeoPoint } from "@/lib/mapRoutePath";

export type MapProviderType = "leaflet2d" | "globe3d" | "google" | "apple";

export type MapEngine = "2d" | "globe3d";

export type MapAirportMarker = {
  id: string;
  iata: string;
  name: string;
  city?: string;
  country?: string;
  lat: number;
  lng: number;
  markerType: "base" | "opened" | "unopened";
};

export type MapRouteLine = {
  id: string;
  originIata: string;
  destinationIata: string;
  origin: GeoPoint;
  destination: GeoPoint;
  points: GeoPoint[];
  status?: "active" | "preview";
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
};

export type MapLegendLabels = {
  title: string;
  base: string;
  opened: string;
  unopened: string;
};
