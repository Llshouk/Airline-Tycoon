import type { Airport } from "@/types/game";

const EARTH_RADIUS_KM = 6371;

export function distanceKm(origin: Airport, destination: Airport) {
  const originLat = toRadians(origin.lat);
  const destinationLat = toRadians(destination.lat);
  const deltaLat = toRadians(destination.lat - origin.lat);
  const deltaLng = toRadians(destination.lng - origin.lng);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(originLat) *
      Math.cos(destinationLat) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

  return Math.round(EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function routeIdFor(originAirportId: string, destinationAirportId: string) {
  return `${originAirportId}-${destinationAirportId}`;
}

export function greatCirclePath(origin: Airport, destination: Airport, segments = 64) {
  // V1 uses a great-circle approximation, not exact operational flight plans or ATC routing.
  const lat1 = toRadians(origin.lat);
  const lng1 = toRadians(origin.lng);
  const lat2 = toRadians(destination.lat);
  const lng2 = toRadians(destination.lng);
  const delta = 2 * Math.asin(Math.sqrt(
    Math.sin((lat2 - lat1) / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2
  ));

  if (delta === 0) return [[origin.lat, origin.lng] as [number, number]];

  return Array.from({ length: segments + 1 }, (_, index) => {
    const fraction = index / segments;
    const a = Math.sin((1 - fraction) * delta) / Math.sin(delta);
    const b = Math.sin(fraction * delta) / Math.sin(delta);
    const x = a * Math.cos(lat1) * Math.cos(lng1) + b * Math.cos(lat2) * Math.cos(lng2);
    const y = a * Math.cos(lat1) * Math.sin(lng1) + b * Math.cos(lat2) * Math.sin(lng2);
    const z = a * Math.sin(lat1) + b * Math.sin(lat2);
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lng = Math.atan2(y, x);
    return [toDegrees(lat), toDegrees(lng)] as [number, number];
  });
}

export function interpolatePosition(origin: Airport, destination: Airport, progress: number) {
  const path = greatCirclePath(origin, destination, 100);
  const bounded = Math.max(0, Math.min(1, progress));
  const exactIndex = bounded * (path.length - 1);
  const lower = Math.floor(exactIndex);
  const upper = Math.min(path.length - 1, lower + 1);
  const mix = exactIndex - lower;
  return {
    lat: path[lower][0] + (path[upper][0] - path[lower][0]) * mix,
    lng: path[lower][1] + (path[upper][1] - path[lower][1]) * mix
  };
}

export function bearingDegrees(origin: Airport, destination: Airport) {
  return calculateBearing(origin.lat, origin.lng, destination.lat, destination.lng);
}

export function calculateBearing(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  const lat1 = toRadians(fromLat);
  const lat2 = toRadians(toLat);
  const deltaLng = toRadians(toLng - fromLng);
  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

export function legacyBearingDegrees(origin: Airport, destination: Airport) {
  const lat1 = toRadians(origin.lat);
  const lat2 = toRadians(destination.lat);
  const deltaLng = toRadians(destination.lng - origin.lng);
  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI;
}
