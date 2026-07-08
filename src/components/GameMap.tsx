"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { aircraftById } from "@/data/aircraft";
import { airports, airportsById } from "@/data/airports";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useTranslation } from "@/i18n";
import { calculateBearing } from "@/lib/geo";
import { buildRoutePolylineLatLngSegments, interpolateRoutePosition, normalizeLongitude } from "@/lib/mapRoutePath";
import { MapView } from "@/components/map/MapView";
import { LEAFLET_2D_MAP_OPTIONS, LEAFLET_2D_TILE_OPTIONS, PRIMARY_WORLD_BOUNDS } from "@/components/map/providers/LeafletMapProvider";
import type { MapProviderType } from "@/components/map/mapTypes";
import type { AircraftInstance, AircraftModel, Route } from "@/types/game";

export type MapDisplayMode = "all" | "network" | "airports" | "aircraft";
type AircraftIconCategory = "regional" | "narrowBodyTwin" | "wideBodyTwin" | "wideBodyQuad";
type AirportMarkerKind = "base" | "opened" | "unopened";

type Props = {
  baseAirportId: string;
  baseAirportIds?: string[];
  primaryBaseAirportId?: string;
  expandedAirportIds: string[];
  routes: Route[];
  fleet: AircraftInstance[];
  currentGameTimeMs: number;
  selectedAirportId: string | null;
  selectedRouteId: string | null;
  displayMode: MapDisplayMode;
  onSelectAirport: (airportId: string) => void;
  onSelectRoute: (routeId: string) => void;
  onSelectFlight: (flightId: string) => void;
};

declare global {
  interface Window {
    google?: any;
    initAirlineTycoonMap?: () => void;
  }
}

export function GameMap(props: Props) {
  const { t } = useTranslation();
  const isOnline = useOnlineStatus();
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const googleMapRef = useRef<any>(null);
  const leafletMapRef = useRef<any>(null);
  const googleLayersRef = useRef<any[]>([]);
  const leafletLayersRef = useRef<any>(null);
  const googleKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapProvider: MapProviderType = googleKey ? "google" : "leaflet2d";

  useEffect(() => {
    if (!mapElementRef.current) return;
    if (googleKey) {
      initGoogleMap(mapElementRef.current, googleMapRef).then(() => {
        drawGoogleLayers(props, googleMapRef.current, googleLayersRef);
      });
      return;
    }

    let cancelled = false;
    initLeafletMap(mapElementRef.current, leafletMapRef).then((L) => {
      if (cancelled) return;
      drawLeafletLayers(props, L, leafletMapRef.current, leafletLayersRef);
    });

    return () => {
      cancelled = true;
    };
  }, [googleKey]);

  useEffect(() => {
    if (googleKey && googleMapRef.current) {
      drawGoogleLayers(props, googleMapRef.current, googleLayersRef);
    }
    if (!googleKey && leafletMapRef.current) {
      import("leaflet").then((leaflet) => drawLeafletLayers(props, leaflet, leafletMapRef.current, leafletLayersRef));
    }
  }, [props, googleKey]);

  return (
    <MapView
      ref={mapElementRef}
      provider={mapProvider}
      engineLabel={googleKey ? "Google Maps" : "2D Map"}
      isOffline={!isOnline}
      offlineMessage={t("map.offlineFallback")}
      legendLabels={{ title: t("map.legend"), base: t("map.legendBase"), opened: t("map.legendOpened"), unopened: t("map.legendUnopened") }}
    />
  );
}

async function initLeafletMap(element: HTMLDivElement, mapRef: MutableRefObject<any>) {
  const L = await import("leaflet");
  if (mapRef.current) return L;

  mapRef.current = L.map(element, LEAFLET_2D_MAP_OPTIONS);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    ...LEAFLET_2D_TILE_OPTIONS
  }).addTo(mapRef.current);

  return L;
}

function drawLeafletLayers(props: Props, L: typeof import("leaflet"), map: any, layerRef: MutableRefObject<any>) {
  if (!map) return;
  if (layerRef.current) {
    layerRef.current.remove();
  }
  const layer = L.layerGroup().addTo(map);
  layerRef.current = layer;

  if (shouldShowRoutes(props.displayMode)) {
    props.routes.forEach((route) => {
      const origin = airportsById[route.originAirportId];
      const destination = airportsById[route.destinationAirportId];
      const active = props.selectedRouteId === route.id;
      L.polyline(buildRoutePolylineLatLngSegments(origin, destination), {
        color: active ? "#d76745" : "#18545c",
        weight: active ? 4 : 2,
        opacity: 0.85
      })
        .on("click", () => props.onSelectRoute(route.id))
        .addTo(layer);
    });
  }

  if (shouldShowAircraft(props.displayMode)) {
    props.fleet.forEach((aircraft) => {
      const model = aircraftById[aircraft.modelId];
      const iconCategory = getAircraftIconCategory(model);
      const iconSize = aircraftIconSize(iconCategory);
      aircraft.schedule
        .filter((item) => item.status === "in-flight")
        .forEach((item) => {
          const origin = airportsById[item.originAirportId];
          const destination = airportsById[item.destinationAirportId];
          const progress = (props.currentGameTimeMs - item.departureGameTime) / (item.arrivalGameTime - item.departureGameTime);
          const position = interpolateRoutePosition(origin, destination, progress);
          const nextPosition = interpolateRoutePosition(origin, destination, Math.min(1, progress + 0.01));
          const bearing = calculateBearing(position.lat, position.lng, nextPosition.lat, nextPosition.lng);
          L.marker([position.lat, normalizeLongitude(position.lng)], {
            icon: L.divIcon({
              html: aircraftIconHtml(bearing, iconCategory),
              className: `aircraft-map-icon aircraft-map-icon-${iconCategory}`,
              iconSize: [iconSize, iconSize],
              iconAnchor: [iconSize / 2, iconSize / 2]
            }),
            title: item.flightNumber ? `${item.flightNumber} ${aircraft.registration}` : aircraft.registration
          })
            .on("click", () => {
              props.onSelectFlight(item.id);
              window.setTimeout(() => {
                L.popup({ offset: [0, -10] })
                  .setLatLng([position.lat, normalizeLongitude(position.lng)])
                  .setContent(aircraftDetailsHtml(aircraft, model, item, props.currentGameTimeMs))
                  .openOn(map);
              }, 0);
            })
            .addTo(layer);
        });
    });
  }

  if (shouldShowAirports(props.displayMode)) {
    const networkAirportIds = getNetworkAirportIds(props);
    const baseAirportIds = props.baseAirportIds ?? [props.baseAirportId];
    const primaryBaseAirportId = props.primaryBaseAirportId ?? props.baseAirportId;
    airports.forEach((airport) => {
      const isPrimaryBase = airport.id === primaryBaseAirportId;
      const isSecondaryBase = baseAirportIds.includes(airport.id) && !isPrimaryBase;
      const isBase = isPrimaryBase || isSecondaryBase;
      if (props.displayMode === "network" && !networkAirportIds.has(airport.id)) return;
      if (props.displayMode === "aircraft" && !isBase) return;
      const isExpanded = props.expandedAirportIds.includes(airport.id);
      const markerKind = airportMarkerKind(isBase, isExpanded);
      const pinSize = airportPinSize(isBase, isExpanded);
      const marker = L.marker([airport.lat, normalizeLongitude(airport.lng)], {
        icon: L.divIcon({
          html: airportPinHtml(markerKind),
          className: `airport-marker airport-marker-${markerKind}`,
          iconSize: [pinSize.width, pinSize.height],
          iconAnchor: [pinSize.width / 2, pinSize.height - 1]
        }),
        title: `${airport.iata} ${airport.name}`
      });
      marker.on("click", () => {
        props.onSelectAirport(airport.id);
        window.setTimeout(() => {
          L.popup({ offset: [0, -26] })
            .setLatLng([airport.lat, normalizeLongitude(airport.lng)])
            .setContent(airportDetailsHtml(airport, isPrimaryBase, isSecondaryBase, isExpanded))
            .openOn(map);
        }, 0);
      });
      marker.addTo(layer);
    });
  }
}

async function initGoogleMap(element: HTMLDivElement, mapRef: MutableRefObject<any>) {
  if (mapRef.current) return;
  await loadGoogleMapsScript();
  if (!window.google) return;
  // TODO: Add custom clustering and richer Google map controls once V1 expands past the seed airport set.
  mapRef.current = new window.google.maps.Map(element, {
    center: { lat: 30, lng: 5 },
    zoom: 2,
    minZoom: 2,
    maxZoom: 8,
    restriction: {
      latLngBounds: {
        south: PRIMARY_WORLD_BOUNDS[0][0],
        west: PRIMARY_WORLD_BOUNDS[0][1],
        north: PRIMARY_WORLD_BOUNDS[1][0],
        east: PRIMARY_WORLD_BOUNDS[1][1]
      },
      strictBounds: true
    },
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false
  });
}

function drawGoogleLayers(props: Props, map: any, layersRef: MutableRefObject<any[]>) {
  if (!window.google || !map) return;
  layersRef.current.forEach((layer) => layer.setMap(null));
  layersRef.current = [];

  if (shouldShowRoutes(props.displayMode)) {
    props.routes.forEach((route) => {
      const origin = airportsById[route.originAirportId];
      const destination = airportsById[route.destinationAirportId];
      const active = props.selectedRouteId === route.id;
      buildRoutePolylineLatLngSegments(origin, destination).forEach((segment) => {
        const line = new window.google.maps.Polyline({
          path: segment.map(([lat, lng]) => ({ lat, lng })),
          geodesic: false,
          strokeColor: active ? "#d76745" : "#18545c",
          strokeOpacity: 0.85,
          strokeWeight: active ? 4 : 2,
          map
        });
        line.addListener("click", () => props.onSelectRoute(route.id));
        layersRef.current.push(line);
      });
    });
  }

  if (shouldShowAircraft(props.displayMode)) {
    props.fleet.forEach((aircraft) => {
      const model = aircraftById[aircraft.modelId];
      const iconCategory = getAircraftIconCategory(model);
      aircraft.schedule
        .filter((item) => item.status === "in-flight")
        .forEach((item) => {
          const origin = airportsById[item.originAirportId];
          const destination = airportsById[item.destinationAirportId];
          const progress = (props.currentGameTimeMs - item.departureGameTime) / (item.arrivalGameTime - item.departureGameTime);
          const position = interpolateRoutePosition(origin, destination, progress);
          const nextPosition = interpolateRoutePosition(origin, destination, Math.min(1, progress + 0.01));
          const bearing = calculateBearing(position.lat, position.lng, nextPosition.lat, nextPosition.lng);
          const marker = new window.google.maps.Marker({
            position: { lat: position.lat, lng: normalizeLongitude(position.lng) },
            map,
            title: item.flightNumber ? `${item.flightNumber} ${aircraft.registration}` : aircraft.registration,
            icon: {
              path: aircraftSymbolPath(iconCategory),
              fillColor: "#f6c945",
              fillOpacity: 1,
              strokeColor: "#102026",
              strokeWeight: 2,
              scale: googleAircraftScale(iconCategory),
              rotation: bearing,
              anchor: new window.google.maps.Point(12, 12)
            }
          });
          const infoWindow = new window.google.maps.InfoWindow({
            content: aircraftDetailsHtml(aircraft, model, item, props.currentGameTimeMs)
          });
          marker.addListener("click", () => {
            props.onSelectFlight(item.id);
            infoWindow.open({ anchor: marker, map });
          });
          layersRef.current.push(marker);
        });
    });
  }

  if (shouldShowAirports(props.displayMode)) {
    const networkAirportIds = getNetworkAirportIds(props);
    const baseAirportIds = props.baseAirportIds ?? [props.baseAirportId];
    const primaryBaseAirportId = props.primaryBaseAirportId ?? props.baseAirportId;
    airports.forEach((airport) => {
      const isPrimaryBase = airport.id === primaryBaseAirportId;
      const isSecondaryBase = baseAirportIds.includes(airport.id) && !isPrimaryBase;
      const isBase = isPrimaryBase || isSecondaryBase;
      if (props.displayMode === "network" && !networkAirportIds.has(airport.id)) return;
      if (props.displayMode === "aircraft" && !isBase) return;
      const isExpanded = props.expandedAirportIds.includes(airport.id);
      const markerKind = airportMarkerKind(isBase, isExpanded);
      const infoWindow = new window.google.maps.InfoWindow({
        content: airportDetailsHtml(airport, isPrimaryBase, isSecondaryBase, isExpanded)
      });
      const pinScale = isBase ? 1 : isExpanded ? 0.9 : 0.78;
      const marker = new window.google.maps.Marker({
        position: { lat: airport.lat, lng: normalizeLongitude(airport.lng) },
        map,
        title: `${airport.iata} ${airport.name}`,
        icon: {
          path: "M12 2C7.6 2 4 5.6 4 10c0 5.6 8 12 8 12s8-6.4 8-12c0-4.4-3.6-8-8-8Zm0 11.2A3.2 3.2 0 1 1 12 6.8a3.2 3.2 0 0 1 0 6.4Z",
          fillColor: airportMarkerFill(markerKind),
          fillOpacity: 1,
          strokeColor: markerKind === "unopened" ? "#18545c" : "#102026",
          strokeWeight: 2,
          scale: pinScale,
          anchor: new window.google.maps.Point(12, 22)
        }
      });
      marker.addListener("click", () => {
        props.onSelectAirport(airport.id);
        infoWindow.open({ anchor: marker, map });
      });
      layersRef.current.push(marker);
    });
  }
}

function shouldShowAirports(mode: MapDisplayMode) {
  return mode === "all" || mode === "airports" || mode === "network" || mode === "aircraft";
}

function shouldShowRoutes(mode: MapDisplayMode) {
  return mode === "all" || mode === "network";
}

function shouldShowAircraft(mode: MapDisplayMode) {
  return mode === "all" || mode === "aircraft" || mode === "network";
}

function getNetworkAirportIds(props: Props) {
  const ids = new Set<string>(props.baseAirportIds ?? [props.baseAirportId]);
  props.routes.forEach((route) => {
    ids.add(route.originAirportId);
    ids.add(route.destinationAirportId);
  });
  return ids;
}

function airportPinHtml(kind: AirportMarkerKind) {
  const fill = airportMarkerFill(kind);
  return `
    <span class="airport-pin">
      <svg viewBox="0 0 34 40" aria-hidden="true" focusable="false">
        <path d="M17 1.8C8.8 1.8 2.2 8.4 2.2 16.6 2.2 27 17 38.2 17 38.2S31.8 27 31.8 16.6C31.8 8.4 25.2 1.8 17 1.8Z" fill="${fill}" />
        <circle cx="17" cy="16.4" r="9.4" fill="rgba(255,255,255,0.16)" />
      </svg>
    </span>
  `;
}

function aircraftIconHtml(bearing: number, category: AircraftIconCategory) {
  const asset = getAircraftIconAsset(category);
  const imageRotation = bearing + 90;
  return `
    <span class="aircraft-map-icon-inner">
      <img class="aircraft-map-icon-image" src="${asset}" alt="" style="transform: rotate(${imageRotation}deg);" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
      <svg class="aircraft-map-icon-fallback" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style="display:none; transform: rotate(${bearing}deg);">
        <path d="${aircraftSymbolPath(category)}" />
        ${category === "wideBodyQuad" ? '<circle cx="7.5" cy="13.2" r="1.1" /><circle cx="16.5" cy="13.2" r="1.1" /><circle cx="5.8" cy="15.5" r="0.9" /><circle cx="18.2" cy="15.5" r="0.9" />' : ""}
      </svg>
    </span>
  `;
}

function airportDetailsHtml(airport: (typeof airports)[number], isPrimaryBase: boolean, isSecondaryBase: boolean, isExpanded: boolean) {
  const baseLabel = isPrimaryBase ? "Primary Base" : isSecondaryBase ? "Secondary Base" : "Not base airport";
  return `
    <div class="airport-popup">
      <strong>${airport.name}</strong>
      <span>${airport.iata} / ${airport.icao}</span>
      <span>${airport.city}, ${airport.country}</span>
      <span>Size: ${airport.sizeTier}</span>
      <span>${baseLabel}</span>
      <span>${isExpanded ? "Connected to network" : "Not connected yet"}</span>
    </div>
  `;
}

function aircraftDetailsHtml(
  aircraft: AircraftInstance,
  model: AircraftModel | undefined,
  item: AircraftInstance["schedule"][number],
  currentGameTimeMs: number
) {
  const origin = airportsById[item.originAirportId];
  const destination = airportsById[item.destinationAirportId];
  const imageUrl = getAircraftDisplayImage(aircraft, model);
  const imageAlt = model?.imageAlt ?? `${aircraft.registration} aircraft image`;
  const progress = Math.max(0, Math.min(100, Math.round(((currentGameTimeMs - item.departureGameTime) / (item.arrivalGameTime - item.departureGameTime)) * 100)));
  const eta = new Date(item.arrivalGameTime).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return `
    <div class="airport-popup">
      ${
        imageUrl
          ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(imageAlt)}" style="display:block;width:180px;height:72px;object-fit:contain;background:#fff;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:8px;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" /><span style="display:none;margin-bottom:8px;color:#64748b;font-weight:700;">No aircraft image available</span>`
          : `<span style="display:block;margin-bottom:8px;color:#64748b;font-weight:700;">No aircraft image available</span>`
      }
      <strong>${aircraft.registration}</strong>
      <span>${model ? `${model.manufacturer} ${model.model}` : aircraft.modelId}</span>
      <span>Flight: ${item.flightNumber ?? "-"}</span>
      <span>Origin: ${origin.iata} ${origin.city}</span>
      <span>Destination: ${destination.iata} ${destination.city}</span>
      <span>Route: ${origin.iata} to ${destination.iata}</span>
      <span>Progress: ${progress}%</span>
      <span>ETA: ${eta}</span>
      <span>Status: ${item.status}</span>
      ${item.revenue ? `<span>Revenue: £${Math.round(item.revenue).toLocaleString()}</span>` : ""}
      ${item.profit ? `<span>Profit: £${Math.round(item.profit).toLocaleString()}</span>` : ""}
    </div>
  `;
}

function getAircraftDisplayImage(aircraft: AircraftInstance, model: AircraftModel | undefined) {
  return model?.sideImageUrl ?? (aircraft as AircraftInstance & { imageUrl?: string }).imageUrl ?? model?.imageUrl ?? "";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

function getAircraftIconCategory(model: AircraftModel | undefined): AircraftIconCategory {
  if (!model) return "narrowBodyTwin";
  const name = `${model.manufacturer} ${model.model}`.toLowerCase();
  if (name.includes("a380") || name.includes("747")) return "wideBodyQuad";
  if (model.type === "widebody") return "wideBodyTwin";
  if (model.maxPassengerSeats <= 150) return "regional";
  return "narrowBodyTwin";
}

function aircraftIconSize(category: AircraftIconCategory) {
  if (category === "regional") return 36;
  if (category === "narrowBodyTwin") return 44;
  if (category === "wideBodyTwin") return 52;
  return 58;
}

function airportPinSize(isBase: boolean, isExpanded: boolean) {
  if (isBase) return { width: 22, height: 28 };
  if (isExpanded) return { width: 19, height: 24 };
  return { width: 17, height: 22 };
}

function airportMarkerKind(isBase: boolean, isExpanded: boolean): AirportMarkerKind {
  if (isBase) return "base";
  if (isExpanded) return "opened";
  return "unopened";
}

function airportMarkerFill(kind: AirportMarkerKind) {
  if (kind === "base") return "#d76745";
  if (kind === "opened") return "#4f9d7e";
  return "#ffffff";
}

function getAircraftIconAsset(category: AircraftIconCategory) {
  switch (category) {
    case "regional":
    case "narrowBodyTwin":
    case "wideBodyTwin":
      return "/aircraft-icons/twin.png";
    case "wideBodyQuad":
      return "/aircraft-icons/wide-body-quad.png";
  }
}

function googleAircraftScale(category: AircraftIconCategory) {
  if (category === "regional") return 1.18;
  if (category === "narrowBodyTwin") return 1.38;
  if (category === "wideBodyTwin") return 1.62;
  return 1.8;
}

function aircraftSymbolPath(category: AircraftIconCategory) {
  if (category === "regional") {
    return "M12 2.4 14.1 10.3 20.2 13.2 19.3 15.4 13.8 14.2 14.5 20.4 12 21.6 9.5 20.4 10.2 14.2 4.7 15.4 3.8 13.2 9.9 10.3 12 2.4Z";
  }
  if (category === "wideBodyTwin") {
    return "M12 1.5 15.5 9.7 22.8 12.7 21.8 16.1 14.8 14.5 16.2 21.1 12 22.7 7.8 21.1 9.2 14.5 2.2 16.1 1.2 12.7 8.5 9.7 12 1.5Z";
  }
  if (category === "wideBodyQuad") {
    return "M12 1.1 15.9 9.1 23.2 12.3 22 16.1 15 14.3 16.5 21.4 12 23 7.5 21.4 9 14.3 2 16.1 0.8 12.3 8.1 9.1 12 1.1Z";
  }
  return "M12 2 15 10.2 22 13.5 21 16 14.2 14.4 15.2 21 12 22.4 8.8 21 9.8 14.4 3 16 2 13.5 9 10.2 12 2Z";
}

function loadGoogleMapsScript() {
  if (window.google) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>("script[data-airline-google-maps]");
  if (existing) {
    return new Promise<void>((resolve) => existing.addEventListener("load", () => resolve(), { once: true }));
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.dataset.airlineGoogleMaps = "true";
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps failed to load"));
    document.head.appendChild(script);
  });
}
