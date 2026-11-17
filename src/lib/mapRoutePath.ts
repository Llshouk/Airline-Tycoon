export type GeoPoint = {
  lat: number;
  lng: number;
};

const DEFAULT_ROUTE_STEPS = 96;

export function normalizeLongitude(lng: number) {
  let next = lng;
  while (next > 180) next -= 360;
  while (next < -180) next += 360;
  return next;
}

export function normalizeLongitudeDelta(delta: number) {
  if (delta > 180) return delta - 360;
  if (delta < -180) return delta + 360;
  return delta;
}

const toRadians = (degrees: number) => degrees * Math.PI / 180;
const toDegrees = (radians: number) => radians * 180 / Math.PI;

/**
 * A point along the great circle between two places: the shortest path over the globe, which is
 * what a real flight approximates. On a flat map it bows towards the pole instead of running straight.
 * Longitude is returned in -180..180.
 */
export function greatCirclePoint(origin: GeoPoint, destination: GeoPoint, fraction: number): GeoPoint {
  const lat1 = toRadians(origin.lat), lng1 = toRadians(origin.lng);
  const lat2 = toRadians(destination.lat), lng2 = toRadians(destination.lng);
  const angle = 2 * Math.asin(Math.min(1, Math.sqrt(
    Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2)));
  const sine = Math.sin(angle);
  // Identical or exactly opposite points have no single great circle; fall back to a straight blend.
  if (!Number.isFinite(sine) || Math.abs(sine) < 1e-9) {
    return { lat: origin.lat + (destination.lat - origin.lat) * fraction,
      lng: normalizeLongitude(origin.lng + normalizeLongitudeDelta(destination.lng - origin.lng) * fraction) };
  }
  const a = Math.sin((1 - fraction) * angle) / sine;
  const b = Math.sin(fraction * angle) / sine;
  const x = a * Math.cos(lat1) * Math.cos(lng1) + b * Math.cos(lat2) * Math.cos(lng2);
  const y = a * Math.cos(lat1) * Math.sin(lng1) + b * Math.cos(lat2) * Math.sin(lng2);
  const z = a * Math.sin(lat1) + b * Math.sin(lat2);
  return { lat: toDegrees(Math.atan2(z, Math.sqrt(x * x + y * y))), lng: toDegrees(Math.atan2(y, x)) };
}

export function buildRoutePolylinePoints(origin: GeoPoint, destination: GeoPoint, steps = DEFAULT_ROUTE_STEPS): GeoPoint[] {
  const safeSteps = Math.max(1, Math.floor(steps));
  const points: GeoPoint[] = [];
  for (let index = 0; index <= safeSteps; index += 1) {
    const point = index === 0 ? { lat: origin.lat, lng: origin.lng } : greatCirclePoint(origin, destination, index / safeSteps);
    // Keep the longitude unwrapped while building the line. Normalizing each point
    // would create a visual jump at the dateline on flat world-map projections.
    const previous = points[index - 1];
    points.push(previous ? { lat: point.lat, lng: previous.lng + normalizeLongitudeDelta(point.lng - normalizeLongitude(previous.lng)) } : point);
  }
  return points;
}

export function splitPolylineAtAntimeridian(points: GeoPoint[]): GeoPoint[][] {
  const segments: GeoPoint[][] = [];
  let currentSegment: GeoPoint[] = [];

  points.forEach((point, index) => {
    const normalizedPoint = { lat: point.lat, lng: normalizeLongitude(point.lng) };
    if (index === 0) {
      currentSegment.push(normalizedPoint);
      return;
    }

    const previous = points[index - 1];
    const previousNormalizedLng = normalizeLongitude(previous.lng);
    const normalizedLng = normalizeLongitude(point.lng);
    const crossesAntimeridian = Math.abs(normalizedLng - previousNormalizedLng) > 180;

    if (crossesAntimeridian) {
      const movingEast = point.lng > previous.lng;
      const boundaryLng = movingEast ? 180 : -180;
      const oppositeBoundaryLng = movingEast ? -180 : 180;
      const boundaryProgress = (boundaryLng - previous.lng) / (point.lng - previous.lng);
      const boundaryLat = previous.lat + (point.lat - previous.lat) * boundaryProgress;

      currentSegment.push({ lat: boundaryLat, lng: boundaryLng });
      segments.push(currentSegment);
      currentSegment = [{ lat: boundaryLat, lng: oppositeBoundaryLng }, normalizedPoint];
      return;
    }

    currentSegment.push(normalizedPoint);
  });

  if (currentSegment.length > 0) segments.push(currentSegment);
  return segments;
}

export function buildRoutePolylineLatLngs(origin: GeoPoint, destination: GeoPoint, steps = DEFAULT_ROUTE_STEPS): [number, number][] {
  return buildRoutePolylinePoints(origin, destination, steps).map((point) => [point.lat, normalizeLongitude(point.lng)]);
}

export function buildRoutePolylineSegments(origin: GeoPoint, destination: GeoPoint, steps = DEFAULT_ROUTE_STEPS): GeoPoint[][] {
  return splitPolylineAtAntimeridian(buildRoutePolylinePoints(origin, destination, steps));
}

export function buildRoutePolylineLatLngSegments(origin: GeoPoint, destination: GeoPoint, steps = DEFAULT_ROUTE_STEPS): [number, number][][] {
  return buildRoutePolylineSegments(origin, destination, steps).map((segment) => segment.map((point) => [point.lat, point.lng]));
}

export function interpolateRoutePosition(origin: GeoPoint, destination: GeoPoint, progress: number): GeoPoint {
  const bounded = Math.max(0, Math.min(1, progress));
  if (bounded === 0) return { lat: origin.lat, lng: normalizeLongitude(origin.lng) };
  if (bounded === 1) return { lat: destination.lat, lng: normalizeLongitude(destination.lng) };
  return greatCirclePoint(origin, destination, bounded);
}
