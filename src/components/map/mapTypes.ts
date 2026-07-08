import type { GeoPoint } from "@/lib/mapRoutePath";

export type MapProviderType = "leaflet2d" | "globe3d" | "google" | "apple";

export type MapAirportMarker = {
  iata: string;
  name: string;
  lat: number;
  lng: number;
  type: "base" | "opened" | "unopened";
};

export type MapRouteLine = {
  id: string;
  origin: GeoPoint;
  destination: GeoPoint;
  points: GeoPoint[];
  status?: "active" | "preview";
};

export type MapAircraftMarker = {
  id: string;
  lat: number;
  lng: number;
  heading: number;
  size: number;
  iconType: string;
};

export type MapLegendLabels = {
  title: string;
  base: string;
  opened: string;
  unopened: string;
};
