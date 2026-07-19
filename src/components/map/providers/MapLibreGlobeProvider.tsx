"use client";

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeatureCollection, LineString, Point, Position } from "geojson";
import { applyDarkGlobeBackdrop, applyGlobeVisualStyle, DARK_GLOBE_BACKDROP, DEFAULT_GLOBE_VISUAL_STYLE } from "@/components/map/maplibreGlobeStyle";
import { applyBrightSatelliteEarth, applyCountryLabels, applyLightOceanTint, getGlobeSatelliteStyle, updateCountryLabelLanguage } from "@/components/map/maplibreGlobeSatelliteStyle";
import { normalizeLongitude, splitPolylineAtAntimeridian } from "@/lib/mapRoutePath";
import type { MapAircraftMarker, MapAirportMarker, MapGlobeFailureReason, MapRouteLine } from "@/components/map/mapTypes";

const AIRCRAFT_IMAGE_ID = "aircraft-icon";
const AIRPORT_SOURCE_ID = "airports-source";
const ROUTE_SOURCE_ID = "routes-source";
const AIRCRAFT_SOURCE_ID = "aircraft-source";
const AIRCRAFT_HIT_LAYER_ID = "aircraft-hit-layer";
const AIRCRAFT_SELECTED_HALO_LAYER_ID = "aircraft-selected-halo-layer";
const AIRPORT_LAYERS = [
  "airport-base-layer",
  "airport-opened-layer",
  "airport-unopened-layer",
  "airport-selected-base-layer",
  "airport-selected-opened-layer",
  "airport-selected-unopened-layer"
] as const;
const OPTIONAL_SOURCE_IDS = new Set(["openfreemap-vector"]);
const OPTIONAL_LAYER_PREFIXES = ["country-label-", "airline-globe-ocean-tint"];
const CORE_INITIALISATION_TIMEOUT_MS = 12000;
const BASE_AIRPORT_RADIUS = ["interpolate", ["linear"], ["zoom"], 0, 8.5, 2, 10, 4, 11.5, 7, 14];
const OPENED_AIRPORT_RADIUS = ["interpolate", ["linear"], ["zoom"], 0, 6.8, 2, 8, 4, 9.5, 7, 11.5];
const UNOPENED_AIRPORT_RADIUS = ["interpolate", ["linear"], ["zoom"], 0, 4.2, 2, 5, 4, 6.2, 7, 8];
const BASE_AIRPORT_HALO_RADIUS = ["interpolate", ["linear"], ["zoom"], 0, 12.5, 2, 14.5, 4, 16.5, 7, 19];
const OPENED_AIRPORT_HALO_RADIUS = ["interpolate", ["linear"], ["zoom"], 0, 10, 2, 11.5, 4, 13.5, 7, 16];
const SELECTED_AIRPORT_SIZE_BONUS = 4;
const AIRCRAFT_ICON_SIZE = [
  "interpolate", ["linear"], ["zoom"],
  0, ["interpolate", ["linear"], ["get", "size"], 36, 0.6, 58, 0.8],
  1.5, ["interpolate", ["linear"], ["get", "size"], 36, 0.72, 58, 0.94],
  3, ["interpolate", ["linear"], ["get", "size"], 36, 0.88, 58, 1.14],
  5, ["interpolate", ["linear"], ["get", "size"], 36, 1.08, 58, 1.4],
  7, ["interpolate", ["linear"], ["get", "size"], 36, 1.28, 58, 1.68]
];
const SELECTED_AIRCRAFT_ICON_SIZE = [
  "interpolate", ["linear"], ["zoom"],
  0, ["interpolate", ["linear"], ["get", "size"], 36, 0.71, 58, 0.94],
  1.5, ["interpolate", ["linear"], ["get", "size"], 36, 0.85, 58, 1.11],
  3, ["interpolate", ["linear"], ["get", "size"], 36, 1.04, 58, 1.35],
  5, ["interpolate", ["linear"], ["get", "size"], 36, 1.27, 58, 1.65],
  7, ["interpolate", ["linear"], ["get", "size"], 36, 1.51, 58, 1.98]
];
const AIRPORT_CIRCLE_VIEWPORT_PAINT = {
  "circle-pitch-alignment": "viewport",
  "circle-pitch-scale": "viewport"
} as const;

type GlobeInteractionLabels = {
  focus: string;
  focusAirport: string;
  focusRoute: string;
  focusAircraft: string;
  close: string;
  baseAirport: string;
  openedAirport: string;
  unopenedAirport: string;
  primaryBase: string;
  inFlight: string;
  delayed: string;
  onTime: string;
  assignedAircraft: string;
  weeklyFlights: string;
  remaining: string;
  complete: string;
  distance: string;
  routeStatus: string;
  opened: string;
  kilometres: string;
  minutes: string;
  hours: string;
};

type SelectedGlobeObject = { type: "airport" | "route" | "aircraft"; id: string } | null;

export type MapLibreGlobeProviderProps = {
  airports: MapAirportMarker[];
  routes: MapRouteLine[];
  aircraft: MapAircraftMarker[];
  selectedRouteId: string | null;
  selectedAirportId?: string | null;
  baseAirportId: string;
  language: "en" | "zh";
  labels: {
    resetView: string;
    focusBase: string;
    performance: string;
    interaction: GlobeInteractionLabels;
  };
  onSelectAirport: (airportId: string) => void;
  onSelectRoute: (routeId: string) => void;
  onSelectAircraft: (aircraftId: string) => void;
  onError: (reason: MapGlobeFailureReason) => void;
};

export function MapLibreGlobeProvider({
  airports,
  routes,
  aircraft,
  selectedRouteId,
  selectedAirportId = null,
  baseAirportId,
  language,
  labels,
  onSelectAirport,
  onSelectRoute,
  onSelectAircraft,
  onError
}: MapLibreGlobeProviderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const coreReadyRef = useRef(false);
  const optionalLabelsReadyRef = useRef(false);
  const fallbackReportedRef = useRef(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const onErrorRef = useRef(onError);
  const onSelectAirportRef = useRef(onSelectAirport);
  const onSelectRouteRef = useRef(onSelectRoute);
  const onSelectAircraftRef = useRef(onSelectAircraft);
  const [isReady, setIsReady] = useState(false);
  const [selectedObject, setSelectedObject] = useState<SelectedGlobeObject>(null);
  const selectedAircraftId = selectedObject?.type === "aircraft" ? selectedObject.id : null;

  const airportGeoJson = useMemo(() => buildAirportGeoJson(airports, selectedAirportId), [airports, selectedAirportId]);
  const routeGeoJson = useMemo(() => buildRouteGeoJson(routes, selectedRouteId), [routes, selectedRouteId]);
  const aircraftGeoJson = useMemo(() => buildAircraftGeoJson(aircraft, selectedAircraftId), [aircraft, selectedAircraftId]);

  useEffect(() => {
    onErrorRef.current = onError;
    onSelectAirportRef.current = onSelectAirport;
    onSelectRouteRef.current = onSelectRoute;
    onSelectAircraftRef.current = onSelectAircraft;
  }, [onError, onSelectAirport, onSelectRoute, onSelectAircraft]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let coreInitialisationTimeout: number | null = null;
    let baseLayerListenersAdded = false;
    let aircraftLayerListenersAdded = false;
    const reportedMapErrors = new Set<string>();
    const reportFatalError = () => {
      if (fallbackReportedRef.current || disposed) return;
      fallbackReportedRef.current = true;
      onErrorRef.current("initialisation");
    };

    if (!container.clientWidth || !container.clientHeight) {
      reportFatalError();
      return;
    }

    try {
      const map = new maplibregl.Map({
        container,
        style: getGlobeSatelliteStyle(),
        center: [0, 20],
        zoom: 1.35,
        minZoom: 0.6,
        maxZoom: 8,
        pitch: 0,
        bearing: 0,
        canvasContextAttributes: { antialias: true }
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: false }), "bottom-right");

      const initialiseOptionalGlobeLayers = () => {
        if (disposed || !coreReadyRef.current) return;
        try {
          applyLightOceanTint(map);
        } catch (error) {
          console.warn("[MapLibre Globe] Ocean tint unavailable; using satellite imagery only", error);
        }
        try {
          applyCountryLabels(map, language);
          optionalLabelsReadyRef.current = true;
        } catch (error) {
          optionalLabelsReadyRef.current = false;
          console.warn("[MapLibre Globe] Country labels unavailable; continuing without labels", error);
        }
      };

      const handleStyleLoad = () => {
        if (disposed || coreReadyRef.current) return;
        void (async () => {
          try {
            map.setProjection({ type: "globe" });
            applyGlobeVisualStyle(map, DEFAULT_GLOBE_VISUAL_STYLE);
            applyBrightSatelliteEarth(map);
            applyDarkGlobeBackdrop(map);
            const mapWithFog = map as maplibregl.Map & { setFog?: (fog: Record<string, string | number>) => void };
            try {
              mapWithFog.setFog?.({
                color: "#dcecf4",
                "high-color": "#f7fbfc",
                "horizon-blend": 0.04,
                "space-color": DARK_GLOBE_BACKDROP,
                "star-intensity": 0
              });
            } catch (error) {
              console.warn("[MapLibre Globe] Atmosphere polish unavailable; continuing with the base globe", error);
            }

            addAirlineSourcesAndLayers(map);
            await addAircraftImage(map);
            if (disposed) return;

            AIRPORT_LAYERS.forEach((layerId) => {
              map.on("mouseenter", layerId, handleAirportEnter);
              map.on("mouseleave", layerId, handlePointerLeave);
            });
            map.on("mouseenter", "route-hit-layer", handleRouteEnter);
            map.on("mouseleave", "route-hit-layer", handlePointerLeave);
            baseLayerListenersAdded = true;
            map.on("click", handleMapClick);
            map.on("mouseenter", AIRCRAFT_HIT_LAYER_ID, handleAircraftEnter);
            map.on("mouseleave", AIRCRAFT_HIT_LAYER_ID, handlePointerLeave);
            aircraftLayerListenersAdded = true;

            coreReadyRef.current = true;
            setIsReady(true);
            if (coreInitialisationTimeout !== null) window.clearTimeout(coreInitialisationTimeout);
            queueMicrotask(initialiseOptionalGlobeLayers);
          } catch (error) {
            console.error("[MapLibre Globe] Core initialisation failed", error);
            reportFatalError();
          }
        })();
      };

      const handleMapError = (event: maplibregl.ErrorEvent) => {
        const diagnostics = getMapErrorDiagnostics(event, map, coreReadyRef.current);
        const severity = classifyMapLibreError(diagnostics);
        const errorKey = `${severity}:${diagnostics.sourceId ?? "none"}:${diagnostics.tile ?? "none"}:${diagnostics.message ?? "unknown"}`;
        if (!reportedMapErrors.has(errorKey)) {
          reportedMapErrors.add(errorKey);
          const log = severity === "fatal" ? console.error : console.warn;
          log("[MapLibre Globe] Map error", { ...diagnostics, severity });
        }
        if (severity === "fatal") reportFatalError();
      };

      const handleMapClick = (event: maplibregl.MapMouseEvent) => {
        const features = map.queryRenderedFeatures(event.point, { layers: [AIRCRAFT_HIT_LAYER_ID, ...AIRPORT_LAYERS, "route-hit-layer"] });
        const aircraftFeature = features.find((feature) => feature.layer.id === AIRCRAFT_HIT_LAYER_ID);
        const airportFeature = features.find((feature) => AIRPORT_LAYERS.includes(feature.layer.id as (typeof AIRPORT_LAYERS)[number]));
        const routeFeature = features.find((feature) => feature.layer.id === "route-hit-layer");
        const feature = aircraftFeature ?? airportFeature ?? routeFeature;
        const id = feature?.properties?.id;
        clearHoverTooltip();
        if (aircraftFeature && typeof id === "string") {
          onSelectAircraftRef.current(id);
          setSelectedObject({ type: "aircraft", id });
          return;
        }
        if (airportFeature && typeof id === "string") {
          onSelectAirportRef.current(id);
          setSelectedObject({ type: "airport", id });
          return;
        }
        if (routeFeature && typeof id === "string") {
          onSelectRouteRef.current(id);
          setSelectedObject({ type: "route", id });
          return;
        }
        setSelectedObject(null);
      };
      const handleAirportEnter = (event: maplibregl.MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature || !canUseHoverTooltip()) return;
        map.getCanvas().style.cursor = "pointer";
        showHoverTooltip(popupRef, map, event.lngLat, createAirportTooltip(feature.properties ?? {}, labels.interaction));
      };
      const handleRouteEnter = (event: maplibregl.MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature || !canUseHoverTooltip()) return;
        map.getCanvas().style.cursor = "pointer";
        showHoverTooltip(popupRef, map, event.lngLat, createRouteTooltip(feature.properties ?? {}, labels.interaction));
      };
      const handleAircraftEnter = (event: maplibregl.MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature || !canUseHoverTooltip()) return;
        map.getCanvas().style.cursor = "pointer";
        showHoverTooltip(popupRef, map, event.lngLat, createAircraftTooltip(feature.properties ?? {}, labels.interaction));
      };
      const handlePointerLeave = () => {
        map.getCanvas().style.cursor = "";
        clearHoverTooltip();
      };
      const clearHoverTooltip = () => {
        popupRef.current?.remove();
        popupRef.current = null;
      };

      coreInitialisationTimeout = window.setTimeout(() => {
        if (disposed || coreReadyRef.current) return;
        console.error("[MapLibre Globe] Core initialisation timed out", { styleLoaded: map.isStyleLoaded(), coreReady: false });
        reportFatalError();
      }, CORE_INITIALISATION_TIMEOUT_MS);

      map.once("style.load", handleStyleLoad);
      map.on("error", handleMapError);
      resizeObserver = new ResizeObserver(() => map.resize());
      resizeObserver.observe(container);

      return () => {
        disposed = true;
        coreReadyRef.current = false;
        optionalLabelsReadyRef.current = false;
        setIsReady(false);
        if (coreInitialisationTimeout !== null) window.clearTimeout(coreInitialisationTimeout);
        resizeObserver?.disconnect();
        popupRef.current?.remove();
        popupRef.current = null;
        if (baseLayerListenersAdded) {
          AIRPORT_LAYERS.forEach((layerId) => {
            map.off("mouseenter", layerId, handleAirportEnter);
            map.off("mouseleave", layerId, handlePointerLeave);
          });
          map.off("mouseenter", "route-hit-layer", handleRouteEnter);
          map.off("mouseleave", "route-hit-layer", handlePointerLeave);
        }
        if (aircraftLayerListenersAdded) {
          map.off("click", handleMapClick);
          map.off("mouseenter", AIRCRAFT_HIT_LAYER_ID, handleAircraftEnter);
          map.off("mouseleave", AIRCRAFT_HIT_LAYER_ID, handlePointerLeave);
        }
        map.off("style.load", handleStyleLoad);
        map.off("error", handleMapError);
        map.remove();
        mapRef.current = null;
      };
    } catch (error) {
      console.error("[MapLibre Globe] Map creation failed", error);
      reportFatalError();
    }
  }, []);

  useEffect(() => {
    if (!isReady || !mapRef.current || !optionalLabelsReadyRef.current) return;
    try {
      updateCountryLabelLanguage(mapRef.current, language);
    } catch (error) {
      optionalLabelsReadyRef.current = false;
      console.warn("[MapLibre Globe] Country label language update failed; continuing without labels", error);
    }
  }, [isReady, language]);

  useEffect(() => {
    if (!isReady || !mapRef.current) return;
    setGeoJsonSourceData(mapRef.current, AIRPORT_SOURCE_ID, airportGeoJson);
  }, [airportGeoJson, isReady]);

  useEffect(() => {
    if (!isReady || !mapRef.current) return;
    setGeoJsonSourceData(mapRef.current, ROUTE_SOURCE_ID, routeGeoJson);
  }, [routeGeoJson, isReady]);

  useEffect(() => {
    if (!isReady || !mapRef.current) return;
    setGeoJsonSourceData(mapRef.current, AIRCRAFT_SOURCE_ID, aircraftGeoJson);
    if (process.env.NODE_ENV === "development") {
      console.debug("[MapLibre Globe] Aircraft render diagnostics", {
        featureCount: aircraftGeoJson.features.length,
        imageLoaded: mapRef.current.hasImage(AIRCRAFT_IMAGE_ID),
        normalLayerExists: Boolean(mapRef.current.getLayer("aircraft-layer")),
        selectedLayerExists: Boolean(mapRef.current.getLayer("aircraft-selected-layer"))
      });
    }
  }, [aircraftGeoJson, isReady]);

  useEffect(() => {
    setSelectedObject((current) => {
      if (current?.type === "airport") return selectedAirportId && airports.some((airport) => airport.id === selectedAirportId) ? { type: "airport", id: selectedAirportId } : null;
      if (current?.type === "route") return selectedRouteId && routes.some((route) => route.id === selectedRouteId) ? { type: "route", id: selectedRouteId } : null;
      if (current?.type === "aircraft" && !aircraft.some((item) => item.id === current.id)) return null;
      return current;
    });
  }, [aircraft, airports, routes, selectedAirportId, selectedRouteId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedObject(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const resetView = useCallback(() => {
    mapRef.current?.flyTo({ center: [0, 20], zoom: 1.35, pitch: 0, bearing: 0, duration: 1000 });
  }, []);

  const focusBase = useCallback(() => {
    const baseAirport = airports.find((airport) => airport.id === baseAirportId);
    if (!baseAirport || !isValidCoordinate(baseAirport.lat, baseAirport.lng)) return;
    mapRef.current?.flyTo({ center: [baseAirport.lng, baseAirport.lat], zoom: 3.5, duration: 1200 });
  }, [airports, baseAirportId]);

  const focusSelectedObject = useCallback(() => {
    const map = mapRef.current;
    if (!map || !selectedObject) return;
    if (selectedObject.type === "airport") {
      const airport = airports.find((item) => item.id === selectedObject.id);
      if (airport) map.easeTo({ center: [airport.lng, airport.lat], zoom: Math.max(map.getZoom(), 3), duration: 900 });
      return;
    }
    if (selectedObject.type === "aircraft") {
      const item = aircraft.find((candidate) => candidate.id === selectedObject.id);
      if (item) map.easeTo({ center: [item.lng, item.lat], zoom: Math.max(map.getZoom(), 3.5), duration: 900 });
      return;
    }
    const route = routes.find((item) => item.id === selectedObject.id);
    if (!route || route.points.length < 2) return;
    const normalizedPoints = route.points.map((point) => ({ lat: point.lat, lng: normalizeLongitude(point.lng) }));
    const crossesAntimeridian = normalizedPoints.some((point, index) => index > 0 && Math.abs(point.lng - normalizedPoints[index - 1].lng) > 180);
    if (crossesAntimeridian) {
      const midpoint = normalizedPoints[Math.floor(normalizedPoints.length / 2)];
      map.easeTo({ center: [midpoint.lng, midpoint.lat], zoom: Math.max(map.getZoom(), 2.5), duration: 900 });
      return;
    }
    const bounds = normalizedPoints.reduce((result, point) => result.extend([point.lng, point.lat]), new maplibregl.LngLatBounds([normalizedPoints[0].lng, normalizedPoints[0].lat], [normalizedPoints[0].lng, normalizedPoints[0].lat]));
    map.fitBounds(bounds, { padding: 80, maxZoom: 4, duration: 900 });
  }, [aircraft, airports, routes, selectedObject]);

  return (
    <div className="airline-maplibre-globe relative h-full min-h-[560px] overflow-hidden" style={{ backgroundColor: DARK_GLOBE_BACKDROP }}>
      <div ref={containerRef} className="h-full w-full" style={{ backgroundColor: DARK_GLOBE_BACKDROP }} />
      <div aria-hidden="true" className="airline-globe-starfield absolute inset-0 pointer-events-none" />
      <div className="absolute right-3 top-3 z-10 flex gap-2">
        <button type="button" onClick={resetView} className="rounded-md bg-white/95 px-3 py-2 text-xs font-black text-ink shadow-soft">
          {labels.resetView}
        </button>
        <button type="button" onClick={focusBase} className="rounded-md bg-white/95 px-3 py-2 text-xs font-black text-ink shadow-soft">
          {labels.focusBase}
        </button>
      </div>
      <div className="pointer-events-none absolute bottom-3 right-16 z-10 max-w-xs rounded-md border border-slate-300/80 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-600 shadow-soft">
        {labels.performance}
      </div>
      <GlobeInformationCard selected={selectedObject} airports={airports} routes={routes} aircraft={aircraft} labels={labels.interaction} onFocus={focusSelectedObject} onClose={() => setSelectedObject(null)} />
    </div>
  );
}

export function buildAirportGeoJson(airports: MapAirportMarker[], selectedAirportId: string | null = null): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: airports.flatMap((airport) => {
      if (!airport.id || !isValidCoordinate(airport.lat, airport.lng)) return [];
      return [{
        type: "Feature",
        properties: {
          id: airport.id,
          iata: airport.iata,
          name: airport.name,
          city: airport.city ?? "",
          country: airport.country ?? "",
          markerType: airport.markerType,
          isPrimaryBase: Boolean(airport.isPrimaryBase),
          selected: airport.id === selectedAirportId
        },
        geometry: { type: "Point", coordinates: [airport.lng, airport.lat] }
      }];
    })
  };
}

export function buildRouteGeoJson(routes: MapRouteLine[], selectedRouteId: string | null): FeatureCollection<LineString> {
  return {
    type: "FeatureCollection",
    features: routes.flatMap((route) => {
      const points = route.points.filter((point) => isValidRouteCoordinate(point.lat, point.lng));
      if (!route.id || points.length < 2) return [];
      return splitPolylineAtAntimeridian(points)
        .filter((segment) => segment.length >= 2)
        .map((segment) => ({
          type: "Feature" as const,
          properties: {
            id: route.id,
            originIata: route.originIata,
            destinationIata: route.destinationIata,
            selected: route.id === selectedRouteId,
            status: route.status ?? "opened",
            distanceKm: route.distanceKm ?? null,
            assignedAircraftCount: route.assignedAircraftCount ?? null,
            weeklyFlightCount: route.weeklyFlightCount ?? null,
            isOpen: Boolean(route.isOpen)
          },
          geometry: { type: "LineString" as const, coordinates: segment.map((point): Position => [point.lng, point.lat]) }
        }));
    })
  };
}

export function buildAircraftGeoJson(aircraft: MapAircraftMarker[], selectedAircraftId: string | null = null): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: aircraft.flatMap((item) => {
      if (!item.id || !isValidCoordinate(item.lat, item.lng) || !Number.isFinite(item.heading)) return [];
      return [{
        type: "Feature",
        properties: {
          id: item.id,
          registration: item.registration,
          model: item.model,
          heading: item.heading,
          size: item.size,
          status: item.status ?? "",
          routeId: item.routeId ?? "",
          flightNumber: item.flightNumber ?? "",
          originIata: item.originIata ?? "",
          destinationIata: item.destinationIata ?? "",
          progress: item.progress ?? null,
          remainingMinutes: item.remainingMinutes ?? null,
          delayMinutes: item.delayMinutes ?? null,
          operationalStatus: item.operationalStatus ?? "",
          selected: item.id === selectedAircraftId
        },
        geometry: { type: "Point", coordinates: [item.lng, item.lat] }
      }];
    })
  };
}

function addAirlineSourcesAndLayers(map: maplibregl.Map) {
  if (!map.getSource(AIRPORT_SOURCE_ID)) map.addSource(AIRPORT_SOURCE_ID, { type: "geojson", data: emptyFeatureCollection() });
  if (!map.getSource(ROUTE_SOURCE_ID)) map.addSource(ROUTE_SOURCE_ID, { type: "geojson", data: emptyFeatureCollection() });
  if (!map.getSource(AIRCRAFT_SOURCE_ID)) map.addSource(AIRCRAFT_SOURCE_ID, { type: "geojson", data: emptyFeatureCollection() });

  addLayerIfMissing(map, {
    id: "route-normal-outline-layer",
    type: "line",
    source: ROUTE_SOURCE_ID,
    filter: ["!=", ["get", "selected"], true],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#062832",
      "line-width": ["interpolate", ["linear"], ["zoom"], 0, 4.4, 2, 4.8, 4, 5.4, 7, 6],
      "line-opacity": 0.5,
      "line-blur": 0.5
    }
  });
  addLayerIfMissing(map, {
    id: "route-normal-layer",
    type: "line",
    source: ROUTE_SOURCE_ID,
    filter: ["!=", ["get", "selected"], true],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#45a9c2",
      "line-width": ["interpolate", ["linear"], ["zoom"], 0, 2.4, 2, 2.6, 4, 3, 7, 3.4],
      "line-opacity": 0.96
    }
  });
  addLayerIfMissing(map, {
    id: "route-selected-outline-layer",
    type: "line",
    source: ROUTE_SOURCE_ID,
    filter: ["==", ["get", "selected"], true],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#5b3a0c",
      "line-width": ["interpolate", ["linear"], ["zoom"], 0, 6.4, 2, 6.8, 4, 7.4, 7, 8],
      "line-opacity": 0.55
    }
  });
  addLayerIfMissing(map, {
    id: "route-selected-layer",
    type: "line",
    source: ROUTE_SOURCE_ID,
    filter: ["==", ["get", "selected"], true],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#f0a52b",
      "line-width": ["interpolate", ["linear"], ["zoom"], 0, 4.4, 2, 4.6, 4, 4.8, 7, 5.2],
      "line-opacity": 1
    }
  });
  addLayerIfMissing(map, {
    id: "route-hit-layer",
    type: "line",
    source: ROUTE_SOURCE_ID,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#000000", "line-width": 14, "line-opacity": 0.01 }
  });

  addAirportHaloLayer(map, "airport-base-halo-layer", "base", "#f27a56", BASE_AIRPORT_HALO_RADIUS, 0.22);
  addAirportHaloLayer(map, "airport-opened-halo-layer", "opened", "#65c49c", OPENED_AIRPORT_HALO_RADIUS, 0.18);
  addAirportLayer(map, "airport-base-layer", "base", "#d76745", "#351811", 2.5, BASE_AIRPORT_RADIUS, false);
  addAirportLayer(map, "airport-opened-layer", "opened", "#4f9d7e", "#102d25", 2.5, OPENED_AIRPORT_RADIUS, false);
  addAirportLayer(map, "airport-unopened-layer", "unopened", "#ffffff", "#15242a", 2, UNOPENED_AIRPORT_RADIUS, false);
  addSelectedAirportHaloLayer(map);
  addAirportLayer(map, "airport-selected-base-layer", "base", "#d76745", "#351811", 2.5, BASE_AIRPORT_RADIUS, true);
  addAirportLayer(map, "airport-selected-opened-layer", "opened", "#4f9d7e", "#102d25", 2.5, OPENED_AIRPORT_RADIUS, true);
  addAirportLayer(map, "airport-selected-unopened-layer", "unopened", "#ffffff", "#15242a", 2, UNOPENED_AIRPORT_RADIUS, true);
  addAirportIataLabels(map);
}

function addAirportIataLabels(map: maplibregl.Map) {
  const baseLayout = {
    "text-field": ["get", "iata"],
    "text-font": ["Noto Sans Bold"],
    "text-size": ["interpolate", ["linear"], ["zoom"], 2, 10, 5, 12],
    "text-offset": [0, 1.35],
    "text-anchor": "top",
    "text-allow-overlap": false,
    "text-ignore-placement": false
  } as const;
  const paint = { "text-color": "#f8fafc", "text-halo-color": "rgba(15, 23, 42, 0.9)", "text-halo-width": 1.25 } as const;
  addLayerIfMissing(map, { id: "airport-iata-base-layer", type: "symbol", source: AIRPORT_SOURCE_ID, minzoom: 2, filter: ["all", ["==", ["get", "markerType"], "base"], ["!=", ["get", "selected"], true]], layout: baseLayout as never, paint: paint as never });
  addLayerIfMissing(map, { id: "airport-iata-opened-layer", type: "symbol", source: AIRPORT_SOURCE_ID, minzoom: 3.5, filter: ["all", ["==", ["get", "markerType"], "opened"], ["!=", ["get", "selected"], true]], layout: baseLayout as never, paint: paint as never });
  addLayerIfMissing(map, { id: "airport-iata-selected-layer", type: "symbol", source: AIRPORT_SOURCE_ID, filter: ["==", ["get", "selected"], true], layout: { ...baseLayout, "text-allow-overlap": true } as never, paint: { ...paint, "text-color": "#fef3c7" } as never });
}

function addAirportLayer(
  map: maplibregl.Map,
  id: string,
  markerType: MapAirportMarker["markerType"],
  color: string,
  strokeColor: string,
  strokeWidth: number,
  radius: unknown[],
  selected: boolean
) {
  addLayerIfMissing(map, {
    id,
    type: "circle",
    source: AIRPORT_SOURCE_ID,
    filter: ["all", ["==", ["get", "markerType"], markerType], [selected ? "==" : "!=", ["get", "selected"], true]],
    paint: {
      ...AIRPORT_CIRCLE_VIEWPORT_PAINT,
      "circle-color": color,
      "circle-radius": (selected ? ["+", radius, SELECTED_AIRPORT_SIZE_BONUS] : radius) as never,
      "circle-stroke-color": selected ? "#f4b942" : strokeColor,
      "circle-stroke-width": selected ? 4 : strokeWidth
    }
  });
}

function addAirportHaloLayer(
  map: maplibregl.Map,
  id: string,
  markerType: MapAirportMarker["markerType"],
  color: string,
  radius: unknown[],
  opacity: number
) {
  addLayerIfMissing(map, {
    id,
    type: "circle",
    source: AIRPORT_SOURCE_ID,
    filter: ["all", ["==", ["get", "markerType"], markerType], ["!=", ["get", "selected"], true]],
    paint: {
      ...AIRPORT_CIRCLE_VIEWPORT_PAINT,
      "circle-color": color,
      "circle-radius": radius as never,
      "circle-opacity": opacity,
      "circle-blur": 0.65
    }
  });
}

function addSelectedAirportHaloLayer(map: maplibregl.Map) {
  const selectedRadius = [
    "case",
    ["==", ["get", "markerType"], "base"], ["+", BASE_AIRPORT_RADIUS, 8],
    ["==", ["get", "markerType"], "opened"], ["+", OPENED_AIRPORT_RADIUS, 8],
    ["+", UNOPENED_AIRPORT_RADIUS, 8]
  ];

  addLayerIfMissing(map, {
    id: "airport-selected-halo-layer",
    type: "circle",
    source: AIRPORT_SOURCE_ID,
    filter: ["==", ["get", "selected"], true],
    paint: {
      ...AIRPORT_CIRCLE_VIEWPORT_PAINT,
      "circle-color": "#f4b942",
      "circle-radius": selectedRadius as never,
      "circle-opacity": 0.25,
      "circle-blur": 0.55
    }
  });
}

async function addAircraftImage(map: maplibregl.Map) {
  if (!map.hasImage(AIRCRAFT_IMAGE_ID)) {
    try {
      map.addImage(AIRCRAFT_IMAGE_ID, await loadTransparentAircraftImage(), { pixelRatio: 2 });
    } catch (error) {
      console.error("[MapLibre Globe] Falling back to generated aircraft icon", error);
      if (!map.hasImage(AIRCRAFT_IMAGE_ID)) map.addImage(AIRCRAFT_IMAGE_ID, createFallbackAircraftImage(), { pixelRatio: 2 });
    }
  }

  addLayerIfMissing(map, {
    id: "aircraft-halo-layer",
    type: "circle",
    source: AIRCRAFT_SOURCE_ID,
    paint: {
      ...AIRPORT_CIRCLE_VIEWPORT_PAINT,
      "circle-color": "#102a3a",
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 7, 2, 9, 4, 12, 7, 16],
      "circle-opacity": 0.2,
      "circle-blur": 0.5
    }
  });
  addLayerIfMissing(map, {
    id: AIRCRAFT_SELECTED_HALO_LAYER_ID,
    type: "circle",
    source: AIRCRAFT_SOURCE_ID,
    filter: ["==", ["get", "selected"], true],
    paint: {
      ...AIRPORT_CIRCLE_VIEWPORT_PAINT,
      "circle-color": "#f4b942",
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 11, 2, 13, 4, 16, 7, 21],
      "circle-opacity": 0.34,
      "circle-blur": 0.55
    }
  });
  addLayerIfMissing(map, {
    id: AIRCRAFT_HIT_LAYER_ID,
    type: "circle",
    source: AIRCRAFT_SOURCE_ID,
    paint: {
      "circle-color": "#000000",
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 16, 2, 19, 4, 23, 7, 28],
      "circle-opacity": 0.01
    }
  });
  addLayerIfMissing(map, {
    id: "aircraft-layer",
    type: "symbol",
    source: AIRCRAFT_SOURCE_ID,
    filter: ["!=", ["get", "selected"], true],
    layout: {
      "icon-image": AIRCRAFT_IMAGE_ID,
      "icon-size": AIRCRAFT_ICON_SIZE as never,
      "icon-rotate": ["get", "heading"],
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true
    }
  });
  try {
    addLayerIfMissing(map, {
      id: "aircraft-selected-layer",
      type: "symbol",
      source: AIRCRAFT_SOURCE_ID,
      filter: ["==", ["get", "selected"], true],
      layout: {
        "icon-image": AIRCRAFT_IMAGE_ID,
        "icon-size": SELECTED_AIRCRAFT_ICON_SIZE as never,
        "icon-rotate": ["get", "heading"],
        "icon-rotation-alignment": "map",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true
      }
    });
  } catch (error) {
    console.warn("[MapLibre Globe] Selected-aircraft highlight unavailable; continuing with normal aircraft icons", error);
  }
}

function setGeoJsonSourceData(map: maplibregl.Map, sourceId: string, data: FeatureCollection) {
  const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
  source?.setData(data);
}

function addLayerIfMissing(map: maplibregl.Map, layer: Parameters<maplibregl.Map["addLayer"]>[0]) {
  if (!map.getLayer(layer.id)) map.addLayer(layer);
}

type GlobeMapErrorSeverity = "fatal" | "optional" | "recoverable";
type GlobeMapErrorDiagnostics = {
  message?: string;
  sourceId?: string;
  tile?: string;
  styleLoaded: boolean;
  coreReady: boolean;
};

function getMapErrorDiagnostics(event: maplibregl.ErrorEvent, map: maplibregl.Map, coreReady: boolean): GlobeMapErrorDiagnostics {
  const details = event as maplibregl.ErrorEvent & {
    sourceId?: unknown;
    source?: { id?: unknown };
    tile?: unknown;
    error?: { message?: unknown; sourceId?: unknown };
  };
  const sourceId = [details.sourceId, details.source?.id, details.error?.sourceId].find((value): value is string => typeof value === "string");
  return {
    message: typeof details.error?.message === "string" ? details.error.message : undefined,
    sourceId,
    tile: describeMapTile(details.tile),
    styleLoaded: Boolean(map.isStyleLoaded()),
    coreReady
  };
}

function classifyMapLibreError({ message = "", sourceId, tile, coreReady }: GlobeMapErrorDiagnostics): GlobeMapErrorSeverity {
  const normalizedMessage = message.toLowerCase();
  const isOptionalLayerError = OPTIONAL_LAYER_PREFIXES.some((prefix) => normalizedMessage.includes(prefix));
  const isOptionalMessage = ["openfreemap", "glyph", "fontstack", "source-layer place", "source-layer water", "country-label"].some((value) => normalizedMessage.includes(value));
  if (sourceId && OPTIONAL_SOURCE_IDS.has(sourceId)) return "optional";
  if (isOptionalLayerError || isOptionalMessage) return "optional";
  if (coreReady || tile || sourceId === "nasa-blue-marble") return "recoverable";
  if (["webgl", "context", "style", "projection", "parse"].some((value) => normalizedMessage.includes(value))) return "fatal";
  return "recoverable";
}

function describeMapTile(tile: unknown) {
  if (typeof tile === "string") return tile;
  if (!tile || typeof tile !== "object") return undefined;
  const record = tile as { tileID?: { canonical?: { z?: unknown; x?: unknown; y?: unknown } } };
  const canonical = record.tileID?.canonical;
  if ([canonical?.z, canonical?.x, canonical?.y].every((value) => typeof value === "number")) return `${canonical?.z}/${canonical?.x}/${canonical?.y}`;
  return "requested";
}

function emptyFeatureCollection(): FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function isValidCoordinate(lat: unknown, lng: unknown): lat is number {
  return typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90 && typeof lng === "number" && Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

function isValidRouteCoordinate(lat: unknown, lng: unknown): lat is number {
  return typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90 && typeof lng === "number" && Number.isFinite(lng);
}

function canUseHoverTooltip() {
  return typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function showHoverTooltip(popupRef: { current: maplibregl.Popup | null }, map: maplibregl.Map, lngLat: maplibregl.LngLat, content: HTMLElement) {
  popupRef.current?.remove();
  popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 }).setLngLat(lngLat).setDOMContent(content).addTo(map);
}

function createTooltip(title: string, lines: string[]) {
  const content = document.createElement("div");
  content.className = "max-w-[220px] text-xs text-slate-700";
  const heading = document.createElement("strong");
  heading.className = "block text-sm text-slate-950";
  heading.textContent = title;
  content.append(heading);
  lines.filter(Boolean).forEach((line) => {
    const detail = document.createElement("p");
    detail.className = "mt-1";
    detail.textContent = line;
    content.append(detail);
  });
  return content;
}

function createAirportTooltip(properties: Record<string, unknown>, labels: GlobeInteractionLabels) {
  const status = airportStatusLabel(stringProperty(properties, "markerType"), labels);
  return createTooltip(`${stringProperty(properties, "iata")} - ${stringProperty(properties, "name")}`.trim(), [[stringProperty(properties, "city"), stringProperty(properties, "country")].filter(Boolean).join(", "), status]);
}

function createRouteTooltip(properties: Record<string, unknown>, labels: GlobeInteractionLabels) {
  const distance = numberProperty(properties, "distanceKm");
  const aircraftCount = numberProperty(properties, "assignedAircraftCount");
  const weeklyFlights = numberProperty(properties, "weeklyFlightCount");
  const summary = [aircraftCount !== null ? `${aircraftCount} ${labels.assignedAircraft}` : "", weeklyFlights !== null ? `${weeklyFlights} ${labels.weeklyFlights}` : ""].filter(Boolean).join(" - ");
  return createTooltip(`${stringProperty(properties, "originIata")} -> ${stringProperty(properties, "destinationIata")}`, [distance === null ? "" : formatMapDistance(distance, labels), summary]);
}

function createAircraftTooltip(properties: Record<string, unknown>, labels: GlobeInteractionLabels) {
  const progress = numberProperty(properties, "progress");
  const delay = numberProperty(properties, "delayMinutes");
  return createTooltip(stringProperty(properties, "flightNumber") || stringProperty(properties, "registration"), [
    [stringProperty(properties, "registration"), stringProperty(properties, "model")].filter(Boolean).join(" - "),
    `${stringProperty(properties, "originIata")} -> ${stringProperty(properties, "destinationIata")}`,
    progress === null ? "" : `${Math.round(progress * 100)}% ${labels.complete}`,
    delay !== null && delay > 0 ? `${labels.delayed} ${formatMapDuration(delay, labels)}` : ""
  ]);
}

function GlobeInformationCard({ selected, airports, routes, aircraft, labels, onFocus, onClose }: { selected: SelectedGlobeObject; airports: MapAirportMarker[]; routes: MapRouteLine[]; aircraft: MapAircraftMarker[]; labels: GlobeInteractionLabels; onFocus: () => void; onClose: () => void }) {
  if (!selected) return null;
  const airport = selected.type === "airport" ? airports.find((item) => item.id === selected.id) : undefined;
  const route = selected.type === "route" ? routes.find((item) => item.id === selected.id) : undefined;
  const aircraftItem = selected.type === "aircraft" ? aircraft.find((item) => item.id === selected.id) : undefined;
  if (!airport && !route && !aircraftItem) return null;
  const focusLabel = selected.type === "airport" ? labels.focusAirport : selected.type === "route" ? labels.focusRoute : labels.focusAircraft;
  const routeStats = route ? [
    route.assignedAircraftCount === undefined ? "" : `${route.assignedAircraftCount} ${labels.assignedAircraft}`,
    route.weeklyFlightCount === undefined ? "" : `${route.weeklyFlightCount} ${labels.weeklyFlights}`
  ].filter(Boolean).join(" - ") : "";

  return (
    <section aria-live="polite" className="absolute bottom-0 left-0 z-20 max-h-[45%] w-full overflow-y-auto rounded-t-lg border border-slate-200/70 bg-slate-950/90 p-4 text-sm text-slate-100 shadow-xl backdrop-blur sm:bottom-3 sm:left-3 sm:w-[min(340px,calc(100%-1.5rem))] sm:rounded-lg md:bottom-5 md:left-5 md:max-h-[360px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {airport ? <><h2 className="text-base font-black text-white">{airport.iata}</h2><p className="mt-1 font-semibold">{airport.name}</p><p className="mt-1 text-xs text-slate-300">{[airport.city, airport.country].filter(Boolean).join(", ")}</p><p className="mt-2 text-xs font-bold text-amber-200">{airportStatusLabel(airport.markerType, labels)}{airport.isPrimaryBase ? ` - ${labels.primaryBase}` : ""}</p></> : null}
          {route ? <><h2 className="text-base font-black text-white">{route.originIata} -&gt; {route.destinationIata}</h2>{route.distanceKm === undefined ? null : <p className="mt-2 text-xs text-slate-200">{formatMapDistance(route.distanceKm, labels)}</p>}{routeStats ? <p className="mt-1 text-xs text-slate-200">{routeStats}</p> : null}<p className="mt-1 text-xs font-bold text-amber-200">{labels.routeStatus}: {route.isOpen ? labels.opened : labels.unopenedAirport}</p></> : null}
          {aircraftItem ? <><h2 className="text-base font-black text-white">{aircraftItem.flightNumber || aircraftItem.registration}</h2><p className="mt-1 font-semibold">{aircraftItem.registration} - {aircraftItem.model}</p><p className="mt-1 text-xs text-slate-300">{aircraftItem.originIata} -&gt; {aircraftItem.destinationIata}</p><p className="mt-2 text-xs font-bold text-amber-200">{aircraftStatusLabel(aircraftItem, labels)}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-700"><div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.round((aircraftItem.progress ?? 0) * 100)}%` }} /></div><p className="mt-1 text-xs text-slate-200">{Math.round((aircraftItem.progress ?? 0) * 100)}% {labels.complete} - {labels.remaining} {formatMapDuration(aircraftItem.remainingMinutes, labels)}</p></> : null}
        </div>
        <button type="button" onClick={onClose} aria-label={labels.close} className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-slate-600 text-lg font-black text-white outline-none hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-amber-300">X</button>
      </div>
      <button type="button" onClick={onFocus} className="mt-4 min-h-10 rounded-md bg-amber-300 px-3 py-2 text-xs font-black text-slate-950 outline-none hover:bg-amber-200 focus-visible:ring-2 focus-visible:ring-white">{focusLabel}</button>
    </section>
  );
}

function airportStatusLabel(markerType: string, labels: GlobeInteractionLabels) {
  if (markerType === "base") return labels.baseAirport;
  if (markerType === "opened") return labels.openedAirport;
  return labels.unopenedAirport;
}

function aircraftStatusLabel(aircraft: MapAircraftMarker, labels: GlobeInteractionLabels) {
  if ((aircraft.delayMinutes ?? 0) > 0) return `${labels.delayed} ${formatMapDuration(aircraft.delayMinutes, labels)}`;
  if (aircraft.operationalStatus === "inFlight" || aircraft.operationalStatus === "in-flight") return labels.inFlight;
  return labels.onTime;
}

function formatMapDistance(value: number | undefined | null, labels: GlobeInteractionLabels) {
  return value === undefined || value === null || !Number.isFinite(value) ? "" : `${Math.round(value).toLocaleString("en-US")} ${labels.kilometres}`;
}

function formatMapDuration(value: number | undefined | null, labels: GlobeInteractionLabels) {
  const minutes = Math.max(0, Math.round(value ?? 0));
  if (minutes < 60) return `${minutes} ${labels.minutes}`;
  return `${Math.floor(minutes / 60)} ${labels.hours} ${minutes % 60} ${labels.minutes}`;
}

function numberProperty(properties: Record<string, unknown>, key: string) {
  const value = properties[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function createAirportPopup(properties: Record<string, unknown>) {
  const content = document.createElement("div");
  content.className = "text-sm text-slate-800";
  const title = document.createElement("strong");
  title.textContent = `${stringProperty(properties, "iata")} ${stringProperty(properties, "name")}`.trim();
  const detail = document.createElement("p");
  detail.className = "mt-1";
  detail.textContent = [stringProperty(properties, "city"), stringProperty(properties, "country")].filter(Boolean).join(", ");
  content.append(title, detail);
  return content;
}

function stringProperty(properties: Record<string, unknown>, key: string) {
  const value = properties[key];
  return typeof value === "string" ? value : "";
}

async function loadTransparentAircraftImage(): Promise<ImageData> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("Local aircraft icon was not found"));
    element.src = "/aircraft-icons/twin.png";
  });
  const size = 96;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Aircraft icon canvas is unavailable");

  context.translate(size / 2, size / 2);
  context.rotate(Math.PI / 2);
  // Crop the padded source art while preserving room for heading rotation.
  context.drawImage(image, 17, 27, 48, 45, -46, -43.125, 92, 86.25);
  const imageData = context.getImageData(0, 0, size, size);
  for (let index = 0; index < imageData.data.length; index += 4) {
    const red = imageData.data[index];
    const green = imageData.data[index + 1];
    const blue = imageData.data[index + 2];
    if (red < 120 && green > 100 && green < 180 && blue > 100 && blue < 190) imageData.data[index + 3] = 0;
  }
  return imageData;
}

function createFallbackAircraftImage(): ImageData {
  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Aircraft fallback canvas is unavailable");
  context.fillStyle = "#f6c945";
  context.strokeStyle = "#102026";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(24, 3);
  context.lineTo(31, 21);
  context.lineTo(43, 28);
  context.lineTo(29, 27);
  context.lineTo(28, 44);
  context.lineTo(20, 44);
  context.lineTo(19, 27);
  context.lineTo(5, 28);
  context.lineTo(17, 21);
  context.closePath();
  context.fill();
  context.stroke();
  return context.getImageData(0, 0, size, size);
}

// TODO: optional MapLibre custom Three.js layer
// for glTF aircraft models.
