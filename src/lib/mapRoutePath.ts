export type GeoPoint = {
  lat: number;
  lng: number;
};

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

export function buildRoutePolylinePoints(origin: GeoPoint, destination: GeoPoint, steps = 64): GeoPoint[] {
  const safeSteps = Math.max(1, Math.floor(steps));
  const lngDelta = normalizeLongitudeDelta(destination.lng - origin.lng);
  const latDelta = destination.lat - origin.lat;

  return Array.from({ length: safeSteps + 1 }, (_, index) => {
    const t = index / safeSteps;
    return {
      lat: origin.lat + latDelta * t,
      // Keep the longitude unwrapped while building the line. Normalizing each point
      // would create a visual jump at the dateline on flat world-map projections.
      lng: origin.lng + lngDelta * t
    };
  });
}

export function buildRoutePolylineLatLngs(origin: GeoPoint, destination: GeoPoint, steps = 64): [number, number][] {
  return buildRoutePolylinePoints(origin, destination, steps).map((point) => [point.lat, normalizeLongitude(point.lng)]);
}

export function buildRoutePolylineLatLngSegments(origin: GeoPoint, destination: GeoPoint, steps = 64): [number, number][][] {
  const points = buildRoutePolylinePoints(origin, destination, steps);
  const segments: [number, number][][] = [];
  let currentSegment: [number, number][] = [];

  points.forEach((point, index) => {
    const normalizedPoint: [number, number] = [point.lat, normalizeLongitude(point.lng)];
    if (index === 0) {
      currentSegment.push(normalizedPoint);
      return;
    }

    const previous = points[index - 1];
    const previousNormalizedLng = normalizeLongitude(previous.lng);
    const normalizedLng = normalizeLongitude(point.lng);
    const wraps = Math.abs(normalizedLng - previousNormalizedLng) > 180;

    if (wraps) {
      const increasing = point.lng > previous.lng;
      const boundaryLng = increasing ? 180 : -180;
      const oppositeBoundaryLng = increasing ? -180 : 180;
      const boundaryProgress = (boundaryLng - previous.lng) / (point.lng - previous.lng);
      const boundaryLat = previous.lat + (point.lat - previous.lat) * boundaryProgress;
      currentSegment.push([boundaryLat, boundaryLng]);
      segments.push(currentSegment);
      currentSegment = [[boundaryLat, oppositeBoundaryLng], normalizedPoint];
      return;
    }

    currentSegment.push(normalizedPoint);
  });

  if (currentSegment.length > 0) segments.push(currentSegment);
  return segments;
}

export function interpolateRoutePosition(origin: GeoPoint, destination: GeoPoint, progress: number): GeoPoint {
  const bounded = Math.max(0, Math.min(1, progress));
  const lngDelta = normalizeLongitudeDelta(destination.lng - origin.lng);
  return {
    lat: origin.lat + (destination.lat - origin.lat) * bounded,
    lng: normalizeLongitude(origin.lng + lngDelta * bounded)
  };
}
