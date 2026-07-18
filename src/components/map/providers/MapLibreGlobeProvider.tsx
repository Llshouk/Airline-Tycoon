"use client";

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeatureCollection, LineString, Point, Position } from "geojson";
import { applyDarkGlobeBackdrop, applyGlobeVisualStyle, DARK_GLOBE_BACKDROP, DEFAULT_GLOBE_VISUAL_STYLE } from "@/components/map/maplibreGlobeStyle";
import { getGlobeSatelliteStyle } from "@/components/map/maplibreGlobeSatelliteStyle";
import { splitPolylineAtAntimeridian } from "@/lib/mapRoutePath";
import type { MapAircraftMarker, MapAirportMarker, MapGlobeFailureReason, MapRouteLine } from "@/components/map/mapTypes";

const AIRCRAFT_IMAGE_ID = "aircraft-icon";
const AIRPORT_SOURCE_ID = "airports-source";
const ROUTE_SOURCE_ID = "routes-source";
const AIRCRAFT_SOURCE_ID = "aircraft-source";
const AIRPORT_LAYERS = ["airport-base-layer", "airport-opened-layer", "airport-unopened-layer"] as const;

export type MapLibreGlobeProviderProps = {
  airports: MapAirportMarker[];
  routes: MapRouteLine[];
  aircraft: MapAircraftMarker[];
  selectedRouteId: string | null;
  selectedAirportId?: string | null;
  baseAirportId: string;
  labels: {
    resetView: string;
    focusBase: string;
    performance: string;
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
  labels,
  onSelectAirport,
  onSelectRoute,
  onSelectAircraft,
  onError
}: MapLibreGlobeProviderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);
  const fallbackReportedRef = useRef(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const onErrorRef = useRef(onError);
  const onSelectAirportRef = useRef(onSelectAirport);
  const onSelectRouteRef = useRef(onSelectRoute);
  const onSelectAircraftRef = useRef(onSelectAircraft);
  const [isReady, setIsReady] = useState(false);

  const airportGeoJson = useMemo(() => buildAirportGeoJson(airports, selectedAirportId), [airports, selectedAirportId]);
  const routeGeoJson = useMemo(() => buildRouteGeoJson(routes, selectedRouteId), [routes, selectedRouteId]);
  const aircraftGeoJson = useMemo(() => buildAircraftGeoJson(aircraft), [aircraft]);

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
    let baseLayerListenersAdded = false;
    let aircraftLayerListenersAdded = false;
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

      const handleStyleLoad = () => {
        try {
          map.setProjection({ type: "globe" });
          applyGlobeVisualStyle(map, DEFAULT_GLOBE_VISUAL_STYLE);
          applyDarkGlobeBackdrop(map);
          const mapWithFog = map as maplibregl.Map & { setFog?: (fog: Record<string, string | number>) => void };
          mapWithFog.setFog?.({
            color: "#dcecf4",
            "high-color": "#f7fbfc",
            "horizon-blend": 0.04,
            "space-color": DARK_GLOBE_BACKDROP,
            "star-intensity": 0
          });
        } catch (error) {
          console.error("[MapLibre Globe] Failed to apply globe projection", error);
          reportFatalError();
        }
      };

      const handleLoad = () => {
        if (disposed) return;
        try {
          addAirlineSourcesAndLayers(map);
          AIRPORT_LAYERS.forEach((layerId) => {
            map.on("click", layerId, handleAirportClick);
            map.on("mouseenter", layerId, handleAirportEnter);
            map.on("mouseleave", layerId, handlePointerLeave);
          });
          map.on("click", "route-hit-layer", handleRouteClick);
          map.on("mouseenter", "route-hit-layer", handlePointerEnter);
          map.on("mouseleave", "route-hit-layer", handlePointerLeave);
          baseLayerListenersAdded = true;
          loadedRef.current = true;
          setIsReady(true);
          void addAircraftImage(map)
            .then(() => {
              if (disposed) return;
              map.on("click", "aircraft-layer", handleAircraftClick);
              map.on("mouseenter", "aircraft-layer", handlePointerEnter);
              map.on("mouseleave", "aircraft-layer", handlePointerLeave);
              aircraftLayerListenersAdded = true;
            })
            .catch((error) => console.error("[MapLibre Globe] Aircraft icon could not be loaded", error));
        } catch (error) {
          console.error("[MapLibre Globe] Initialisation failed", error);
          reportFatalError();
        }
      };

      const handleMapError = (event: maplibregl.ErrorEvent) => {
        console.error("[MapLibre Globe] Map error", event.error);
        // Tile errors after a successful load are recoverable. A style failure before
        // load is not, so only that case returns players to the stable 2D map.
        if (!loadedRef.current) reportFatalError();
      };

      const handleAirportClick = (event: maplibregl.MapLayerMouseEvent) => {
        const id = event.features?.[0]?.properties?.id;
        if (typeof id === "string") onSelectAirportRef.current(id);
      };
      const handleRouteClick = (event: maplibregl.MapLayerMouseEvent) => {
        const id = event.features?.[0]?.properties?.id;
        if (typeof id === "string") onSelectRouteRef.current(id);
      };
      const handleAircraftClick = (event: maplibregl.MapLayerMouseEvent) => {
        const id = event.features?.[0]?.properties?.id;
        if (typeof id === "string") onSelectAircraftRef.current(id);
      };
      const handleAirportEnter = (event: maplibregl.MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature) return;
        map.getCanvas().style.cursor = "pointer";
        popupRef.current?.remove();
        popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 })
          .setLngLat(event.lngLat)
          .setDOMContent(createAirportPopup(feature.properties ?? {}))
          .addTo(map);
      };
      const handlePointerEnter = () => {
        map.getCanvas().style.cursor = "pointer";
      };
      const handlePointerLeave = () => {
        map.getCanvas().style.cursor = "";
        popupRef.current?.remove();
        popupRef.current = null;
      };

      map.on("style.load", handleStyleLoad);
      map.on("load", handleLoad);
      map.on("error", handleMapError);
      resizeObserver = new ResizeObserver(() => map.resize());
      resizeObserver.observe(container);

      return () => {
        disposed = true;
        loadedRef.current = false;
        setIsReady(false);
        resizeObserver?.disconnect();
        popupRef.current?.remove();
        popupRef.current = null;
        if (baseLayerListenersAdded) {
          AIRPORT_LAYERS.forEach((layerId) => {
            map.off("click", layerId, handleAirportClick);
            map.off("mouseenter", layerId, handleAirportEnter);
            map.off("mouseleave", layerId, handlePointerLeave);
          });
          map.off("click", "route-hit-layer", handleRouteClick);
          map.off("mouseenter", "route-hit-layer", handlePointerEnter);
          map.off("mouseleave", "route-hit-layer", handlePointerLeave);
        }
        if (aircraftLayerListenersAdded) {
          map.off("click", "aircraft-layer", handleAircraftClick);
          map.off("mouseenter", "aircraft-layer", handlePointerEnter);
          map.off("mouseleave", "aircraft-layer", handlePointerLeave);
        }
        map.off("style.load", handleStyleLoad);
        map.off("load", handleLoad);
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
  }, [aircraftGeoJson, isReady]);

  const resetView = useCallback(() => {
    mapRef.current?.flyTo({ center: [0, 20], zoom: 1.35, pitch: 0, bearing: 0, duration: 1000 });
  }, []);

  const focusBase = useCallback(() => {
    const baseAirport = airports.find((airport) => airport.id === baseAirportId);
    if (!baseAirport || !isValidCoordinate(baseAirport.lat, baseAirport.lng)) return;
    mapRef.current?.flyTo({ center: [baseAirport.lng, baseAirport.lat], zoom: 3.5, duration: 1200 });
  }, [airports, baseAirportId]);

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
            status: route.status ?? "opened"
          },
          geometry: { type: "LineString" as const, coordinates: segment.map((point): Position => [point.lng, point.lat]) }
        }));
    })
  };
}

export function buildAircraftGeoJson(aircraft: MapAircraftMarker[]): FeatureCollection<Point> {
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
          routeId: item.routeId ?? ""
        },
        geometry: { type: "Point", coordinates: [item.lng, item.lat] }
      }];
    })
  };
}

function addAirlineSourcesAndLayers(map: maplibregl.Map) {
  map.addSource(AIRPORT_SOURCE_ID, { type: "geojson", data: emptyFeatureCollection() });
  map.addSource(ROUTE_SOURCE_ID, { type: "geojson", data: emptyFeatureCollection() });
  map.addSource(AIRCRAFT_SOURCE_ID, { type: "geojson", data: emptyFeatureCollection() });

  map.addLayer({
    id: "route-normal-layer",
    type: "line",
    source: ROUTE_SOURCE_ID,
    filter: ["!=", ["get", "selected"], true],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#2f7f97", "line-width": 2, "line-opacity": 0.78 }
  });
  map.addLayer({
    id: "route-selected-layer",
    type: "line",
    source: ROUTE_SOURCE_ID,
    filter: ["==", ["get", "selected"], true],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#d88b1f", "line-width": 4, "line-opacity": 1 }
  });
  map.addLayer({
    id: "route-hit-layer",
    type: "line",
    source: ROUTE_SOURCE_ID,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#000000", "line-width": 14, "line-opacity": 0.01 }
  });

  addAirportLayer(map, "airport-base-layer", "base", "#d76745", 6);
  addAirportLayer(map, "airport-opened-layer", "opened", "#4f9d7e", 5);
  addAirportLayer(map, "airport-unopened-layer", "unopened", "#ffffff", 3);
}

function addAirportLayer(map: maplibregl.Map, id: string, markerType: MapAirportMarker["markerType"], color: string, radius: number) {
  map.addLayer({
    id,
    type: "circle",
    source: AIRPORT_SOURCE_ID,
    filter: ["==", ["get", "markerType"], markerType],
    paint: {
      "circle-color": color,
      "circle-radius": ["case", ["==", ["get", "selected"], true], radius + 3, radius],
      "circle-stroke-color": ["case", ["==", ["get", "selected"], true], "#f4b942", "#102026"],
      "circle-stroke-width": ["case", ["==", ["get", "selected"], true], 2, 1]
    }
  });
}

async function addAircraftImage(map: maplibregl.Map) {
  if (map.hasImage(AIRCRAFT_IMAGE_ID)) return;
  try {
    map.addImage(AIRCRAFT_IMAGE_ID, await loadTransparentAircraftImage(), { pixelRatio: 2 });
  } catch (error) {
    console.error("[MapLibre Globe] Falling back to generated aircraft icon", error);
    map.addImage(AIRCRAFT_IMAGE_ID, createFallbackAircraftImage(), { pixelRatio: 2 });
  }

  map.addLayer({
    id: "aircraft-layer",
    type: "symbol",
    source: AIRCRAFT_SOURCE_ID,
    layout: {
      "icon-image": AIRCRAFT_IMAGE_ID,
      "icon-size": ["interpolate", ["linear"], ["get", "size"], 36, 0.28, 58, 0.44],
      "icon-rotate": ["get", "heading"],
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true
    }
  });
}

function setGeoJsonSourceData(map: maplibregl.Map, sourceId: string, data: FeatureCollection) {
  const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
  source?.setData(data);
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
  context.rotate(-Math.PI / 2);
  context.drawImage(image, -size / 2, -size / 2, size, size);
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

// TODO V1.3.1: optional MapLibre custom Three.js layer
// for glTF aircraft models.
