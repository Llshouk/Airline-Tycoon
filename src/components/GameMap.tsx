"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { LayerGroup, Map as LeafletMap, TileLayer } from "leaflet";
import { aircraftById } from "@/data/aircraft";
import { airports, airportsById } from "@/data/airports";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useThrottledMapTime } from "@/hooks/useThrottledMapTime";
import { useTranslation } from "@/i18n";
import { calculateBearing } from "@/lib/geo";
import { hasVisibleLeafletTileCoverage, isVisibleLeafletTileRect } from "@/lib/leafletTileReadiness";
import { buildRoutePolylinePoints, buildRoutePolylineLatLngSegments, interpolateRoutePosition, normalizeLongitude, normalizeLongitudeDelta } from "@/lib/mapRoutePath";
import { getEffectiveGlobeQuality, getGlobeAircraftUpdateInterval, supportsWebGL } from "@/lib/mapPreferences";
import { MapView } from "@/components/map/MapView";
import { GlobeErrorBoundary } from "@/components/map/GlobeErrorBoundary";
import { GlobeLoadingFallback } from "@/components/map/GlobeLoadingFallback";
import { LEAFLET_2D_MAP_OPTIONS, LEAFLET_2D_TILE_OPTIONS, PRIMARY_WORLD_BOUNDS } from "@/components/map/providers/LeafletMapProvider";
import type { MapLibreGlobeProviderProps } from "@/components/map/providers/MapLibreGlobeProvider";
import type { GlobeQuality, MapAircraftMarker, MapAirportMarker, MapEngine, MapGlobeFailureReason, MapProviderType, MapRouteLine } from "@/components/map/mapTypes";
import type { AircraftInstance, AircraftModel, Route } from "@/types/game";

const MapLibreGlobeProvider = dynamic<MapLibreGlobeProviderProps>(
  () => import("@/components/map/providers/MapLibreGlobeProvider").then((module) => module.MapLibreGlobeProvider),
  { ssr: false, loading: () => <GlobeLoadingFallback /> }
);

export type MapDisplayMode = "all" | "network" | "airports" | "aircraft";
type AircraftIconCategory = "regional" | "narrowBodyTwin" | "wideBodyTwin" | "wideBodyQuad";
type AirportMarkerKind = "base" | "opened" | "unopened";
type RouteMapStatistics = { assignedAircraftIds: Set<string>; weeklyFlightCount: number };
type LeafletTileDiagnostics = {
  errorCountRef: MutableRefObject<number>;
  loadCountRef: MutableRefObject<number>;
  errorUrlsRef: MutableRefObject<Set<string>>;
  tileGeneration: number;
  isCurrent: () => boolean;
  onTileLoaded: () => void;
};
type MapTransitionState = "idle" | "preparing-2d" | "preparing-3d";
type LeafletTileReadiness = {
  ready: boolean;
  tileLoadEvents: number;
  tileErrorEvents: number;
  visibleLoadedTiles: number;
  durationMs: number;
};

const LEAFLET_BASE_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

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
  mapEngine?: MapEngine;
  globeQuality?: GlobeQuality;
  onMapEngineFallback?: (reason: MapGlobeFailureReason) => void;
  onSelectAirport: (airportId: string) => void;
  onSelectRoute: (routeId: string) => void;
  onSelectFlight: (flightId: string) => void;
};

type AirportPopupLabels = {
  size: string;
  sizeTiers: Record<(typeof airports)[number]["sizeTier"], string>;
  primaryBase: string;
  secondaryBase: string;
  notBaseAirport: string;
  connectedToNetwork: string;
  notConnectedYet: string;
};

type MapRenderProps = Props & {
  airportPopupLabels: AirportPopupLabels;
};

type GlobeAirportDataInput = Pick<
  Props,
  "baseAirportId" | "baseAirportIds" | "primaryBaseAirportId" | "expandedAirportIds" | "routes" | "displayMode"
>;
type GlobeRouteDataInput = Pick<Props, "routes" | "selectedRouteId" | "displayMode">;
type GlobeAircraftDataInput = Pick<Props, "fleet" | "displayMode">;
type NetworkAirportInput = Pick<Props, "baseAirportId" | "baseAirportIds" | "routes">;

declare global {
  interface Window {
    google?: any;
    initAirlineTycoonMap?: () => void;
  }
}

export function GameMap(props: Props) {
  const { language, t } = useTranslation();
  const airportPopupLabels = useMemo<AirportPopupLabels>(
    () => ({
      size: t("map.airportSize"),
      sizeTiers: {
        regional: t("map.airportSizeRegional"),
        large: t("map.airportSizeLarge"),
        mega: t("map.airportSizeMega")
      },
      primaryBase: t("map.primaryBase"),
      secondaryBase: t("map.secondaryBase"),
      notBaseAirport: t("map.notBaseAirport"),
      connectedToNetwork: t("map.connectedToNetwork"),
      notConnectedYet: t("map.notConnectedYet")
    }),
    [t]
  );
  const isOnline = useOnlineStatus();
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const googleMapRef = useRef<any>(null);
  const leafletMapRef = useRef<any>(null);
  const googleLayersRef = useRef<any[]>([]);
  const leafletLayersRef = useRef<LayerGroup | null>(null);
  const leafletBaseLayerRef = useRef<TileLayer | null>(null);
  const leafletModuleRef = useRef<typeof import("leaflet") | null>(null);
  const leafletInitialisationRef = useRef<Promise<typeof import("leaflet")> | null>(null);
  const leafletTileErrorCountRef = useRef(0);
  const leafletTileLoadCountRef = useRef(0);
  const leafletTileGenerationRef = useRef(0);
  const leafletTileReadinessCancelRef = useRef<(() => void) | null>(null);
  const leafletTileErrorUrlsRef = useRef(new Set<string>());
  const leafletViewportListenersCleanupRef = useRef<(() => void) | null>(null);
  const leafletOverlayRedrawFrameRef = useRef<number | null>(null);
  const previousTwoDProviderRef = useRef<"google" | "leaflet" | null>(null);
  const latestPropsRef = useRef<MapRenderProps>({ ...props, airportPopupLabels });
  const effectiveMapEngineRef = useRef<MapEngine>("2d");
  const mapSwitchGenerationRef = useRef(0);
  const previousEffectiveMapEngineRef = useRef<MapEngine>("2d");
  const globeWasActiveRef = useRef(false);
  const renderMetricsRef = useRef({ renders: 0, routeBuilds: 0, aircraftBuilds: 0, lastReportedAt: 0 });
  const [globeFailed, setGlobeFailed] = useState(false);
  const [hasMountedGlobe, setHasMountedGlobe] = useState(false);
  const [webglChecked, setWebglChecked] = useState(false);
  const [webglSupported, setWebglSupported] = useState(false);
  const [leafletBaseTilesUnavailable, setLeafletBaseTilesUnavailable] = useState(false);
  const [mapTransitionState, setMapTransitionState] = useState<MapTransitionState>("idle");
  const googleKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const selectedMapEngine = props.mapEngine ?? "2d";
  const effectiveGlobeQuality = useMemo(() => getEffectiveGlobeQuality(props.globeQuality ?? "auto"), [props.globeQuality]);
  const effectiveMapEngine = selectedMapEngine === "globe3d" && webglChecked && webglSupported && !globeFailed ? "globe3d" : "2d";
  const usesGoogleMap = Boolean(googleKey);
  const twoDProvider: "google" | "leaflet" = usesGoogleMap ? "google" : "leaflet";
  const mapProvider: MapProviderType = effectiveMapEngine === "globe3d" ? "globe3d" : usesGoogleMap ? "google" : "leaflet2d";
  const isGlobeActive = effectiveMapEngine === "globe3d";
  if (isGlobeActive) globeWasActiveRef.current = true;
  const isPreparingTwoD = mapTransitionState === "preparing-2d" || (globeWasActiveRef.current && !isGlobeActive);
  const shouldRenderGlobe = (hasMountedGlobe || isGlobeActive) && !globeFailed;
  const shouldPrepareGlobeData = hasMountedGlobe || selectedMapEngine === "globe3d";
  latestPropsRef.current = { ...props, airportPopupLabels };
  effectiveMapEngineRef.current = effectiveMapEngine;
  if (process.env.NODE_ENV === "development") renderMetricsRef.current.renders += 1;
  const weeklyScheduleSignature = useMemo(() => getWeeklyScheduleSignature(props.fleet), [props.fleet]);
  const routeStatistics = useMemo(() => buildRouteMapStatistics(props.fleet), [weeklyScheduleSignature]);
  const aircraftStructuralKey = useMemo(() => getGlobeAircraftStructuralKey(props.fleet, props.displayMode), [props.fleet, props.displayMode]);
  const renderedGameTimeMs = useThrottledMapTime(
    props.currentGameTimeMs,
    getGlobeAircraftUpdateInterval(effectiveGlobeQuality),
    isGlobeActive,
    aircraftStructuralKey
  );
  const globeAirports = useMemo(
    () =>
      shouldPrepareGlobeData
        ? buildGlobeAirportData({
            baseAirportId: props.baseAirportId,
            baseAirportIds: props.baseAirportIds,
            primaryBaseAirportId: props.primaryBaseAirportId,
            expandedAirportIds: props.expandedAirportIds,
            routes: props.routes,
            displayMode: props.displayMode
          })
        : [],
    [
      props.baseAirportId,
      props.baseAirportIds,
      props.primaryBaseAirportId,
      props.expandedAirportIds,
      props.routes,
      props.displayMode,
      shouldPrepareGlobeData
    ]
  );
  const globeRoutes = useMemo(
    () => {
      if (process.env.NODE_ENV === "development") renderMetricsRef.current.routeBuilds += 1;
      return shouldPrepareGlobeData
        ? buildGlobeRouteData(
            {
              routes: props.routes,
              selectedRouteId: props.selectedRouteId,
              displayMode: props.displayMode
            },
            routeStatistics
          )
        : [];
    },
    [props.routes, props.selectedRouteId, props.displayMode, routeStatistics, shouldPrepareGlobeData]
  );
  const globeAircraft = useMemo(
    () => {
      if (process.env.NODE_ENV === "development") renderMetricsRef.current.aircraftBuilds += 1;
      return shouldPrepareGlobeData
        ? buildGlobeAircraftData(
            {
              fleet: props.fleet,
              displayMode: props.displayMode
            },
            renderedGameTimeMs
          )
        : [];
    },
    [props.fleet, props.displayMode, renderedGameTimeMs, shouldPrepareGlobeData]
  );
  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || effectiveMapEngine !== "globe3d") return;
    const now = Date.now();
    if (now - renderMetricsRef.current.lastReportedAt < 5000) return;
    renderMetricsRef.current.lastReportedAt = now;
    console.debug("[GameMap] Globe render metrics", {
      ...renderMetricsRef.current,
      aircraftFeatures: globeAircraft.length,
      routeFeatures: globeRoutes.length
    });
  }, [effectiveMapEngine, globeAircraft, globeRoutes]);
  const handleGlobeError = useCallback(
    (reason: MapGlobeFailureReason) => {
      setGlobeFailed(true);
      props.onMapEngineFallback?.(reason);
    },
    [props.onMapEngineFallback]
  );

  useEffect(() => {
    if (selectedMapEngine !== "globe3d") {
      setWebglChecked(false);
      return;
    }

    setGlobeFailed(false);
    const available = supportsWebGL();
    setWebglSupported(available);
    setWebglChecked(true);
    if (!available) handleGlobeError("unsupported");
  }, [selectedMapEngine, handleGlobeError]);

  useEffect(() => {
    if (isGlobeActive) setHasMountedGlobe(true);
  }, [isGlobeActive]);

  const drawLatestTwoDMap = useCallback(() => {
    if (twoDProvider === "google") {
      drawGoogleLayers(latestPropsRef.current, googleMapRef.current, googleLayersRef);
      return;
    }
    if (leafletModuleRef.current && leafletMapRef.current) {
      drawLeafletLayers(latestPropsRef.current, leafletModuleRef.current, leafletMapRef.current, leafletLayersRef);
    }
  }, [twoDProvider]);

  const cancelLeafletTileReadiness = useCallback(() => {
    leafletTileReadinessCancelRef.current?.();
  }, []);

  useEffect(() => {
    if (previousTwoDProviderRef.current && previousTwoDProviderRef.current !== twoDProvider) {
      cleanupTwoDMaps(googleMapRef, googleLayersRef, leafletMapRef, leafletLayersRef, leafletBaseLayerRef, leafletTileReadinessCancelRef, leafletTileGenerationRef, leafletTileErrorCountRef, leafletTileLoadCountRef, leafletTileErrorUrlsRef, leafletViewportListenersCleanupRef, leafletOverlayRedrawFrameRef);
    }
    previousTwoDProviderRef.current = twoDProvider;
  }, [twoDProvider]);

  useEffect(() => {
    let cancelled = false;
    let retryFrame: number | null = null;
    const initialise = async () => {
      const container = mapElementRef.current;
      if (cancelled || !container || !container.isConnected || !container.clientWidth || !container.clientHeight) {
        if (!cancelled) retryFrame = window.requestAnimationFrame(() => void initialise());
        return;
      }

      try {
        if (twoDProvider === "google") {
          await initGoogleMap(container, googleMapRef);
        } else {
          if (!leafletInitialisationRef.current) leafletInitialisationRef.current = import("leaflet");
          const leaflet = await leafletInitialisationRef.current;
          if (cancelled || !container.isConnected || leafletMapRef.current) return;
          leafletModuleRef.current = leaflet;
          leafletMapRef.current = leaflet.map(container, LEAFLET_2D_MAP_OPTIONS);
          ensureLeafletBaseLayer(
            leaflet,
            leafletMapRef.current,
            leafletBaseLayerRef,
            createLeafletTileDiagnostics(
              leafletTileErrorCountRef,
              leafletTileLoadCountRef,
              leafletTileErrorUrlsRef,
              leafletTileGenerationRef,
              () => setLeafletBaseTilesUnavailable(false)
            )
          );
          attachLeafletViewportListeners(
            leafletMapRef.current,
            leaflet,
            leafletMapRef,
            leafletModuleRef,
            latestPropsRef,
            leafletLayersRef,
            leafletViewportListenersCleanupRef,
            leafletOverlayRedrawFrameRef
          );
        }
        if (!cancelled && effectiveMapEngineRef.current === "2d") drawLatestTwoDMap();
      } catch (error) {
        console.error("[GameMap] 2D map initialisation failed", error);
      }
    };
    void initialise();
    return () => {
      cancelled = true;
      if (retryFrame !== null) window.cancelAnimationFrame(retryFrame);
    };
  }, [drawLatestTwoDMap, twoDProvider]);

  useEffect(() => {
    return () => cleanupTwoDMaps(googleMapRef, googleLayersRef, leafletMapRef, leafletLayersRef, leafletBaseLayerRef, leafletTileReadinessCancelRef, leafletTileGenerationRef, leafletTileErrorCountRef, leafletTileLoadCountRef, leafletTileErrorUrlsRef, leafletViewportListenersCleanupRef, leafletOverlayRedrawFrameRef);
  }, []);

  useEffect(() => {
    if (effectiveMapEngine === "globe3d" || isPreparingTwoD) return;
    drawLatestTwoDMap();
  }, [airportPopupLabels, drawLatestTwoDMap, effectiveMapEngine, isPreparingTwoD, props]);

  const restoreLeafletAfterGlobe = useCallback(
    async (generation: number, isCancelled: () => boolean) => {
      if (isCancelled() || twoDProvider !== "leaflet" || generation !== mapSwitchGenerationRef.current || effectiveMapEngineRef.current !== "2d") return false;
      await waitForAnimationFrames(2);
      if (isCancelled() || generation !== mapSwitchGenerationRef.current || effectiveMapEngineRef.current !== "2d") return false;

      const container = mapElementRef.current;
      const leaflet = leafletModuleRef.current;
      const map = leafletMapRef.current as LeafletMap | null;
      if (!container?.isConnected || !container.clientWidth || !container.clientHeight || !leaflet || !map) return false;

      const isCurrentTransition = () => !isCancelled() && generation === mapSwitchGenerationRef.current && effectiveMapEngineRef.current === "2d";
      map.stop();
      normalizeLeafletRestoreCenter(map);
      map.invalidateSize({ animate: false, pan: false });
      setLeafletBaseTilesUnavailable(false);

      const createDiagnostics = () =>
        createLeafletTileDiagnostics(
          leafletTileErrorCountRef,
          leafletTileLoadCountRef,
          leafletTileErrorUrlsRef,
          leafletTileGenerationRef,
          () => setLeafletBaseTilesUnavailable(false)
        );
      let diagnostics = createDiagnostics();
      let baseLayer = replaceLeafletBaseLayer(leaflet, map, leafletBaseLayerRef, diagnostics);
      if (leafletOverlayRedrawFrameRef.current !== null) {
        window.cancelAnimationFrame(leafletOverlayRedrawFrameRef.current);
        leafletOverlayRedrawFrameRef.current = null;
      }
      drawLeafletLayers(latestPropsRef.current, leaflet, map, leafletLayersRef);
      if (process.env.NODE_ENV === "development") {
        console.debug("[Leaflet] Preparing 2D", {
          switchGeneration: generation,
          tileGeneration: diagnostics.tileGeneration,
          containerSize: { width: container.clientWidth, height: container.clientHeight },
          center: map.getCenter(),
          zoom: map.getZoom()
        });
      }

      let readiness = await waitForLeafletTiles(map, baseLayer, diagnostics, leafletTileReadinessCancelRef, 3400);
      if (!isCurrentTransition()) return false;

      if (!readiness.ready) {
        diagnostics = createDiagnostics();
        baseLayer = replaceLeafletBaseLayer(leaflet, map, leafletBaseLayerRef, diagnostics);
        readiness = await waitForLeafletTiles(map, baseLayer, diagnostics, leafletTileReadinessCancelRef, 3000);
        if (!isCurrentTransition()) return false;
      }

      if (!readiness.ready) {
        const center = map.getCenter();
        const zoom = map.getZoom();
        if (process.env.NODE_ENV === "development") {
          console.warn("[Leaflet] Recreating map after tile recovery failed", {
            center,
            zoom,
            previousTileGenerations: leafletTileGenerationRef.current
          });
        }
        recreateLeafletMap(
          container,
          leaflet,
          center,
          zoom,
          leafletMapRef,
          leafletLayersRef,
          leafletBaseLayerRef,
          leafletModuleRef,
          latestPropsRef,
          leafletViewportListenersCleanupRef,
          leafletOverlayRedrawFrameRef
        );
        const recreatedMap = leafletMapRef.current as LeafletMap;
        diagnostics = createDiagnostics();
        baseLayer = replaceLeafletBaseLayer(leaflet, recreatedMap, leafletBaseLayerRef, diagnostics);
        drawLeafletLayers(latestPropsRef.current, leaflet, recreatedMap, leafletLayersRef);
        readiness = await waitForLeafletTiles(recreatedMap, baseLayer, diagnostics, leafletTileReadinessCancelRef, 3000);
        if (!isCurrentTransition()) return false;
      }

      const restoredMap = leafletMapRef.current as LeafletMap | null;
      if (!readiness.ready || !restoredMap) {
        setLeafletBaseTilesUnavailable(true);
        return false;
      }
      restoredMap.invalidateSize({ animate: false, pan: false });
      return getVisibleLoadedLeafletTileCount(restoredMap) >= getLeafletVisibleTileThreshold(restoredMap);
    },
    [twoDProvider]
  );

  useEffect(() => {
    const previousEffectiveMapEngine = previousEffectiveMapEngineRef.current;
    previousEffectiveMapEngineRef.current = effectiveMapEngine;
    const generation = ++mapSwitchGenerationRef.current;

    if (effectiveMapEngine === "globe3d" || (selectedMapEngine === "globe3d" && !globeFailed)) {
      cancelLeafletTileReadiness();
      setMapTransitionState("idle");
      return;
    }

    if (previousEffectiveMapEngine !== "globe3d") return;
    setMapTransitionState("preparing-2d");
    let cancelled = false;
    void restoreLeafletAfterGlobe(generation, () => cancelled)
      .then((ready) => {
        if (cancelled || generation !== mapSwitchGenerationRef.current || effectiveMapEngineRef.current !== "2d") return;
        if (!ready) setLeafletBaseTilesUnavailable(true);
        globeWasActiveRef.current = false;
        setMapTransitionState("idle");
      })
      .catch((error) => {
        if (cancelled || generation !== mapSwitchGenerationRef.current) return;
        console.error("[Leaflet] 2D restore failed", error);
        setLeafletBaseTilesUnavailable(true);
        globeWasActiveRef.current = false;
        setMapTransitionState("idle");
      });

    return () => {
      cancelled = true;
      cancelLeafletTileReadiness();
    };
  }, [cancelLeafletTileReadiness, effectiveMapEngine, globeFailed, restoreLeafletAfterGlobe, selectedMapEngine]);

  return (
    <MapView
      ref={mapElementRef}
      provider={mapProvider}
      isGlobeActive={isGlobeActive}
      isPreparingTwoD={isPreparingTwoD}
      preparingTwoDLabel={t("map.preparing2d")}
      engineLabel={effectiveMapEngine === "globe3d" ? t("map.engineGlobe3d") : googleKey ? "Google Maps" : t("map.engine2d")}
      isOffline={!isOnline}
      offlineMessage={t("map.offlineFallback")}
      baseMapWarning={effectiveMapEngine === "2d" && twoDProvider === "leaflet" && leafletBaseTilesUnavailable ? t("map.baseTilesUnavailable") : null}
      legendLabels={{ title: t("map.legend"), base: t("map.legendBase"), opened: t("map.legendOpened"), unopened: t("map.legendUnopened") }}
      globeContent={shouldRenderGlobe ? (
        <GlobeErrorBoundary
          unavailableLabel={t("map.globeUnavailable")}
          returnTo2dLabel={t("map.returnTo2d")}
          onFallback={() => handleGlobeError("render")}
        >
          <MapLibreGlobeProvider
            airports={globeAirports}
            routes={globeRoutes}
            aircraft={globeAircraft}
            selectedRouteId={props.selectedRouteId}
            selectedAirportId={props.selectedAirportId}
            baseAirportId={props.primaryBaseAirportId ?? props.baseAirportId}
            quality={effectiveGlobeQuality}
            isActive={isGlobeActive}
            language={language}
            labels={{
              resetView: t("map.resetView"),
              focusBase: t("map.focusBase"),
              performance: t("map.globePerformanceNote"),
              interaction: {
                focus: t("map.focus"),
                focusAirport: t("map.focusAirport"),
                focusRoute: t("map.focusRoute"),
                focusAircraft: t("map.focusAircraft"),
                close: t("common.close"),
                baseAirport: t("map.baseAirport"),
                openedAirport: t("map.openedAirport"),
                unopenedAirport: t("map.unopenedAirport"),
                primaryBase: t("map.primaryBase"),
                inFlight: t("map.inFlight"),
                delayed: t("map.delayed"),
                onTime: t("map.onTime"),
                assignedAircraft: t("map.assignedAircraft"),
                weeklyFlights: t("map.weeklyFlights"),
                remaining: t("map.remaining"),
                complete: t("map.complete"),
                distance: t("map.distance"),
                routeStatus: t("map.routeStatus"),
                opened: t("map.opened"),
                kilometres: t("map.kilometres"),
                minutes: t("map.minutes"),
                hours: t("map.hours")
              }
            }}
            onSelectAirport={props.onSelectAirport}
            onSelectRoute={props.onSelectRoute}
            onSelectAircraft={props.onSelectFlight}
            onError={handleGlobeError}
          />
        </GlobeErrorBoundary>
      ) : null}
    />
  );
}

function cleanupTwoDMaps(
  googleMapRef: MutableRefObject<any>,
  googleLayersRef: MutableRefObject<any[]>,
  leafletMapRef: MutableRefObject<any>,
  leafletLayersRef: MutableRefObject<any>,
  leafletBaseLayerRef: MutableRefObject<TileLayer | null>,
  leafletTileReadinessCancelRef: MutableRefObject<(() => void) | null>,
  leafletTileGenerationRef: MutableRefObject<number>,
  leafletTileErrorCountRef: MutableRefObject<number>,
  leafletTileLoadCountRef: MutableRefObject<number>,
  leafletTileErrorUrlsRef: MutableRefObject<Set<string>>,
  leafletViewportListenersCleanupRef: MutableRefObject<(() => void) | null>,
  leafletOverlayRedrawFrameRef: MutableRefObject<number | null>
) {
  googleLayersRef.current.forEach((layer) => layer.setMap?.(null));
  googleLayersRef.current = [];
  googleMapRef.current = null;
  leafletTileReadinessCancelRef.current?.();
  leafletTileReadinessCancelRef.current = null;
  leafletTileGenerationRef.current += 1;
  leafletViewportListenersCleanupRef.current?.();
  leafletViewportListenersCleanupRef.current = null;
  if (leafletOverlayRedrawFrameRef.current !== null) {
    window.cancelAnimationFrame(leafletOverlayRedrawFrameRef.current);
    leafletOverlayRedrawFrameRef.current = null;
  }
  if (leafletLayersRef.current) {
    leafletLayersRef.current.remove();
    leafletLayersRef.current = null;
  }
  if (leafletBaseLayerRef.current) {
    leafletBaseLayerRef.current.remove();
    leafletBaseLayerRef.current = null;
  }
  if (leafletMapRef.current) {
    leafletMapRef.current.remove();
    leafletMapRef.current = null;
  }
  leafletTileErrorCountRef.current = 0;
  leafletTileLoadCountRef.current = 0;
  leafletTileErrorUrlsRef.current.clear();
}

function buildGlobeAirportData(props: GlobeAirportDataInput): MapAirportMarker[] {
  const networkAirportIds = getNetworkAirportIds(props);
  const baseAirportIds = props.baseAirportIds ?? [props.baseAirportId];
  const primaryBaseAirportId = props.primaryBaseAirportId ?? props.baseAirportId;

  const airportMarkers = shouldShowAirports(props.displayMode)
    ? airports
        .filter((airport) => {
          const isPrimaryBase = airport.id === primaryBaseAirportId;
          const isSecondaryBase = baseAirportIds.includes(airport.id) && !isPrimaryBase;
          const isBase = isPrimaryBase || isSecondaryBase;
          if (props.displayMode === "network" && !networkAirportIds.has(airport.id)) return false;
          if (props.displayMode === "aircraft" && !isBase) return false;
          return true;
        })
        .map((airport) => {
          const isPrimaryBase = airport.id === primaryBaseAirportId;
          const isSecondaryBase = baseAirportIds.includes(airport.id) && !isPrimaryBase;
          const isBase = isPrimaryBase || isSecondaryBase;
          const isExpanded = props.expandedAirportIds.includes(airport.id);
          return {
            id: airport.id,
            iata: airport.iata,
            name: airport.name,
            city: airport.city,
            country: airport.country,
            lat: airport.lat,
            lng: normalizeLongitude(airport.lng),
            markerType: airportMarkerKind(isBase, isExpanded),
            isPrimaryBase
          } satisfies MapAirportMarker;
        })
    : [];

  return airportMarkers;
}

function buildRouteMapStatistics(fleet: AircraftInstance[]) {
  const statistics = new Map<string, RouteMapStatistics>();
  fleet.forEach((aircraft) => {
    aircraft.weeklySchedules.forEach((schedule) => {
      const current = statistics.get(schedule.routeId) ?? { assignedAircraftIds: new Set<string>(), weeklyFlightCount: 0 };
      current.assignedAircraftIds.add(aircraft.id);
      current.weeklyFlightCount += schedule.daysOfWeek.length * (schedule.isRoundTrip ? 2 : 1);
      statistics.set(schedule.routeId, current);
    });
  });
  return statistics;
}

function getWeeklyScheduleSignature(fleet: AircraftInstance[]) {
  return fleet
    .map((aircraft) => `${aircraft.id}:${aircraft.weeklySchedules.map((schedule) => `${schedule.id}:${schedule.routeId}:${schedule.updatedAt}`).join(",")}`)
    .join("|");
}

function getGlobeAircraftStructuralKey(fleet: AircraftInstance[], displayMode: MapDisplayMode) {
  return `${displayMode}|${fleet.flatMap((aircraft) => aircraft.schedule.filter((item) => item.status === "in-flight").map((item) => item.id)).join(",")}`;
}

function buildGlobeRouteData(props: GlobeRouteDataInput, routeStatistics: Map<string, RouteMapStatistics>): MapRouteLine[] {
  return shouldShowRoutes(props.displayMode)
    ? props.routes
        .map((route): MapRouteLine | null => {
          const origin = airportsById[route.originAirportId];
          const destination = airportsById[route.destinationAirportId];
          if (!origin || !destination) return null;
          const status: MapRouteLine["status"] = props.selectedRouteId === route.id ? "active" : undefined;
          const statistics = routeStatistics.get(route.id);
          return {
            id: route.id,
            originIata: origin.iata,
            destinationIata: destination.iata,
            origin: { lat: origin.lat, lng: normalizeLongitude(origin.lng) },
            destination: { lat: destination.lat, lng: normalizeLongitude(destination.lng) },
            points: buildRoutePolylinePoints(origin, destination),
            status,
            distanceKm: route.distanceKm,
            assignedAircraftCount: statistics?.assignedAircraftIds.size || undefined,
            weeklyFlightCount: statistics?.weeklyFlightCount || undefined,
            isOpen: route.isOpen
          };
        })
        .filter((route): route is MapRouteLine => Boolean(route))
    : [];
}

function buildGlobeAircraftData(props: GlobeAircraftDataInput, currentGameTimeMs: number): MapAircraftMarker[] {
  return shouldShowAircraft(props.displayMode)
    ? props.fleet.flatMap((aircraft) => {
        const model = aircraftById[aircraft.modelId];
        const iconCategory = getAircraftIconCategory(model);
        const iconSize = aircraftIconSize(iconCategory);
        return aircraft.schedule
          .filter((item) => item.status === "in-flight")
          .map((item): MapAircraftMarker | null => {
            const origin = airportsById[item.originAirportId];
            const destination = airportsById[item.destinationAirportId];
            if (!origin || !destination) return null;
            const progress = (currentGameTimeMs - item.departureGameTime) / (item.arrivalGameTime - item.departureGameTime);
            const { position, heading } = getAircraftPositionAndHeading(origin, destination, progress);
            const safeProgress = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
            const arrivalGameTime = item.actualArrivalGameTime ?? item.arrivalGameTime;
            return {
              id: item.id,
              registration: aircraft.registration,
              model: model ? `${model.manufacturer} ${model.model}` : aircraft.modelId,
              lat: position.lat,
              lng: normalizeLongitude(position.lng),
              heading,
              size: iconSize,
              iconType: iconCategory,
              status: item.status,
              routeId: item.routeId,
              title: item.flightNumber ? `${item.flightNumber} ${aircraft.registration}` : aircraft.registration,
              flightNumber: item.flightNumber,
              originIata: origin.iata,
              destinationIata: destination.iata,
              progress: safeProgress,
              remainingMinutes: Math.max(0, Math.ceil((arrivalGameTime - currentGameTimeMs) / 60000)),
              delayMinutes: item.delayMinutes && item.delayMinutes > 0 ? item.delayMinutes : undefined,
              operationalStatus: item.operationalStatus ?? "inFlight"
            };
          })
          .filter((marker): marker is MapAircraftMarker => Boolean(marker));
      })
    : [];
}

function getAircraftPositionAndHeading(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  progress: number
) {
  const boundedProgress = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const position = interpolateRoutePosition(origin, destination, boundedProgress);
  const lookAheadProgress = Math.min(1, Math.max(boundedProgress + 0.002, boundedProgress + 0.01));
  const nextPosition = interpolateRoutePosition(origin, destination, lookAheadProgress);
  let heading = calculateBearing(position.lat, position.lng, nextPosition.lat, nextPosition.lng);

  if (sameRoutePosition(position, nextPosition)) {
    heading = calculateBearing(position.lat, position.lng, destination.lat, destination.lng);
  }
  if (!Number.isFinite(heading) || sameRoutePosition(position, destination)) {
    heading = calculateBearing(origin.lat, origin.lng, destination.lat, destination.lng);
  }

  return { position, heading: normalizeHeading(heading) };
}

function sameRoutePosition(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  return Math.abs(a.lat - b.lat) < 0.000001 && Math.abs(normalizeLongitudeDelta(a.lng - b.lng)) < 0.000001;
}

function normalizeHeading(value: number) {
  return Number.isFinite(value) ? ((value % 360) + 360) % 360 : 0;
}

function createLeafletTileDiagnostics(
  errorCountRef: MutableRefObject<number>,
  loadCountRef: MutableRefObject<number>,
  errorUrlsRef: MutableRefObject<Set<string>>,
  tileGenerationRef: MutableRefObject<number>,
  onTileLoaded: () => void
): LeafletTileDiagnostics {
  const tileGeneration = ++tileGenerationRef.current;
  return {
    errorCountRef,
    loadCountRef,
    errorUrlsRef,
    tileGeneration,
    isCurrent: () => tileGenerationRef.current === tileGeneration,
    onTileLoaded
  };
}

function ensureLeafletBaseLayer(
  L: typeof import("leaflet"),
  map: LeafletMap,
  baseLayerRef: MutableRefObject<TileLayer | null>,
  diagnostics: LeafletTileDiagnostics
) {
  const existingLayer = baseLayerRef.current;
  if (existingLayer && map.hasLayer(existingLayer)) return existingLayer;
  if (existingLayer) {
    existingLayer.addTo(map);
    existingLayer.bringToBack();
    return existingLayer;
  }

  const tileLayer = L.tileLayer(LEAFLET_BASE_TILE_URL, { ...LEAFLET_2D_TILE_OPTIONS });
  tileLayer.on("loading", () => {
    if (process.env.NODE_ENV === "development" && diagnostics.isCurrent()) {
      console.debug("[Leaflet] Base tiles loading", { tileGeneration: diagnostics.tileGeneration });
    }
  });
  tileLayer.on("load", () => {
    if (process.env.NODE_ENV === "development" && diagnostics.isCurrent()) {
      console.debug("[Leaflet] Base tiles loaded", { tileGeneration: diagnostics.tileGeneration, loadedTileCount: diagnostics.loadCountRef.current });
    }
  });
  tileLayer.on("tileload", () => {
    if (!diagnostics.isCurrent()) return;
    diagnostics.loadCountRef.current += 1;
    diagnostics.onTileLoaded();
  });
  tileLayer.on("tileerror", (event: any) => {
    if (!diagnostics.isCurrent()) return;
    diagnostics.errorCountRef.current += 1;
    const url = typeof event?.tile?.src === "string" ? event.tile.src : "unknown";
    if (process.env.NODE_ENV === "development" && !diagnostics.errorUrlsRef.current.has(url)) {
      diagnostics.errorUrlsRef.current.add(url);
      console.warn("[Leaflet] Base tile failed", { url, errorCount: diagnostics.errorCountRef.current });
    }
  });
  tileLayer.addTo(map);
  tileLayer.bringToBack();
  baseLayerRef.current = tileLayer;
  return tileLayer;
}

function replaceLeafletBaseLayer(
  L: typeof import("leaflet"),
  map: LeafletMap,
  baseLayerRef: MutableRefObject<TileLayer | null>,
  diagnostics: LeafletTileDiagnostics
) {
  const previousLayer = baseLayerRef.current;
  if (previousLayer) {
    previousLayer.off();
    if (map.hasLayer(previousLayer)) map.removeLayer(previousLayer);
    else previousLayer.remove();
  }
  baseLayerRef.current = null;
  return ensureLeafletBaseLayer(L, map, baseLayerRef, diagnostics);
}

const MAX_LEAFLET_WORLD_COPIES = 7;

function attachLeafletViewportListeners(
  map: LeafletMap,
  L: typeof import("leaflet"),
  mapRef: MutableRefObject<any>,
  moduleRef: MutableRefObject<typeof import("leaflet") | null>,
  latestPropsRef: MutableRefObject<MapRenderProps>,
  layerRef: MutableRefObject<LayerGroup | null>,
  cleanupRef: MutableRefObject<(() => void) | null>,
  overlayFrameRef: MutableRefObject<number | null>
) {
  if (cleanupRef.current) return;

  const scheduleLeafletOverlayRedraw = () => {
    if (overlayFrameRef.current !== null) return;
    overlayFrameRef.current = window.requestAnimationFrame(() => {
      overlayFrameRef.current = null;
      if (mapRef.current !== map || moduleRef.current !== L) return;
      drawLeafletLayers(latestPropsRef.current, L, map, layerRef);
    });
  };

  map.on("moveend", scheduleLeafletOverlayRedraw);
  map.on("zoomend", scheduleLeafletOverlayRedraw);
  cleanupRef.current = () => {
    map.off("moveend", scheduleLeafletOverlayRedraw);
    map.off("zoomend", scheduleLeafletOverlayRedraw);
    if (overlayFrameRef.current !== null) {
      window.cancelAnimationFrame(overlayFrameRef.current);
      overlayFrameRef.current = null;
    }
  };
}

function getVisibleLeafletWorldOffsets(map: LeafletMap) {
  const size = map.getSize();
  if (!size.x || !size.y) return [0];

  const midpointY = size.y / 2;
  const leftLng = map.containerPointToLatLng([0, midpointY]).lng;
  const rightLng = map.containerPointToLatLng([size.x, midpointY]).lng;
  if (!Number.isFinite(leftLng) || !Number.isFinite(rightLng)) return [0];

  const west = Math.min(leftLng, rightLng);
  const east = Math.max(leftLng, rightLng);
  let firstWorld = Math.floor((west + 180) / 360) - 1;
  let lastWorld = Math.floor((east + 180) / 360) + 1;

  if (lastWorld - firstWorld + 1 > MAX_LEAFLET_WORLD_COPIES) {
    const centerWorld = Math.round(map.getCenter().lng / 360);
    firstWorld = centerWorld - Math.floor(MAX_LEAFLET_WORLD_COPIES / 2);
    lastWorld = firstWorld + MAX_LEAFLET_WORLD_COPIES - 1;
  }

  const offsets: number[] = [];
  for (let worldIndex = firstWorld; worldIndex <= lastWorld; worldIndex += 1) {
    offsets.push(worldIndex * 360);
  }
  return offsets;
}

function shiftRouteSegments(segments: [number, number][][], longitudeOffset: number): [number, number][][] {
  return segments.map((segment) => segment.map(([lat, lng]) => [lat, lng + longitudeOffset]));
}

function getVisibleLoadedLeafletTileCount(map: LeafletMap) {
  const tilePane = map.getPane("tilePane");
  const containerRect = map.getContainer().getBoundingClientRect();
  if (!tilePane || !containerRect.width || !containerRect.height) return 0;

  return Array.from(tilePane.querySelectorAll<HTMLImageElement>("img.leaflet-tile-loaded")).filter(
    (tile) => {
      if (!tile.complete || tile.naturalWidth <= 0 || tile.naturalHeight <= 0) return false;
      const style = window.getComputedStyle(tile);
      const opacity = Number.parseFloat(style.opacity);
      if (style.visibility === "hidden" || style.display === "none" || (!Number.isNaN(opacity) && opacity <= 0)) return false;

      const tileRect = tile.getBoundingClientRect();
      return isVisibleLeafletTileRect(tileRect, containerRect);
    }
  ).length;
}

function normalizeLeafletRestoreCenter(map: LeafletMap) {
  const center = map.getCenter();
  const centerIsFinite = Number.isFinite(center.lat) && Number.isFinite(center.lng);
  if (centerIsFinite && Math.abs(center.lng) <= 720) return;

  const nextCenter = centerIsFinite ? map.wrapLatLng(center) : LEAFLET_2D_MAP_OPTIONS.center;
  map.setView(nextCenter, map.getZoom(), { animate: false });
}

function getLeafletVisibleTileThreshold(map: LeafletMap) {
  const size = map.getSize();
  if (size.x < 280 || size.y < 280) return 1;
  return Math.min(4, Math.max(2, Math.ceil(size.x / 512)));
}

function waitForAnimationFrames(frameCount: number) {
  return new Promise<void>((resolve) => {
    const nextFrame = (remaining: number) => {
      if (remaining <= 0) {
        resolve();
        return;
      }
      window.requestAnimationFrame(() => nextFrame(remaining - 1));
    };
    nextFrame(frameCount);
  });
}

function waitForLeafletTiles(
  map: LeafletMap,
  tileLayer: TileLayer,
  diagnostics: LeafletTileDiagnostics,
  cancelRef: MutableRefObject<(() => void) | null>,
  timeoutMs: number
) {
  return new Promise<LeafletTileReadiness>((resolve) => {
    const startedAt = Date.now();
    let settled = false;
    let tileLoadEvents = 0;
    let tileErrorEvents = 0;
    let frame: number | null = null;
    let timeout: number | null = null;
    const threshold = getLeafletVisibleTileThreshold(map);

    function finish(ready: boolean) {
      if (settled) return;
      settled = true;
      if (frame !== null) window.cancelAnimationFrame(frame);
      if (timeout !== null) window.clearTimeout(timeout);
      tileLayer.off("tileload", handleTileLoad);
      tileLayer.off("tileerror", handleTileError);
      tileLayer.off("load", scheduleVisibleTileCheck);
      if (cancelRef.current === cancel) cancelRef.current = null;

      const result: LeafletTileReadiness = {
        ready,
        tileLoadEvents,
        tileErrorEvents,
        visibleLoadedTiles: getVisibleLoadedLeafletTileCount(map),
        durationMs: Date.now() - startedAt
      };
      if (process.env.NODE_ENV === "development") {
        console.debug("[Leaflet] Tile generation result", {
          tileGeneration: diagnostics.tileGeneration,
          ...result
        });
      }
      resolve(result);
    }

    function scheduleVisibleTileCheck() {
      if (frame !== null || settled) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        if (!diagnostics.isCurrent()) {
          finish(false);
          return;
        }
        const visibleLoadedTiles = getVisibleLoadedLeafletTileCount(map);
        if (hasVisibleLeafletTileCoverage(visibleLoadedTiles, threshold)) {
          finish(true);
          return;
        }
        scheduleVisibleTileCheck();
      });
    }

    function handleTileLoad() {
      if (!diagnostics.isCurrent()) return;
      tileLoadEvents += 1;
      scheduleVisibleTileCheck();
    }
    function handleTileError() {
      if (!diagnostics.isCurrent()) return;
      tileErrorEvents += 1;
    }
    function cancel() {
      finish(false);
    }

    cancelRef.current?.();
    cancelRef.current = cancel;
    tileLayer.on("tileload", handleTileLoad);
    tileLayer.on("tileerror", handleTileError);
    tileLayer.on("load", scheduleVisibleTileCheck);
    timeout = window.setTimeout(() => finish(hasVisibleLeafletTileCoverage(getVisibleLoadedLeafletTileCount(map), threshold)), timeoutMs);
    scheduleVisibleTileCheck();
  });
}

function recreateLeafletMap(
  container: HTMLDivElement,
  L: typeof import("leaflet"),
  center: { lat: number; lng: number },
  zoom: number,
  mapRef: MutableRefObject<any>,
  layerRef: MutableRefObject<LayerGroup | null>,
  baseLayerRef: MutableRefObject<TileLayer | null>,
  moduleRef: MutableRefObject<typeof import("leaflet") | null>,
  latestPropsRef: MutableRefObject<MapRenderProps>,
  viewportCleanupRef: MutableRefObject<(() => void) | null>,
  overlayFrameRef: MutableRefObject<number | null>
) {
  viewportCleanupRef.current?.();
  viewportCleanupRef.current = null;
  if (overlayFrameRef.current !== null) {
    window.cancelAnimationFrame(overlayFrameRef.current);
    overlayFrameRef.current = null;
  }
  layerRef.current?.remove();
  layerRef.current = null;
  baseLayerRef.current?.off();
  baseLayerRef.current?.remove();
  baseLayerRef.current = null;
  (mapRef.current as LeafletMap | null)?.remove();

  const recreatedMap = L.map(container, {
    ...LEAFLET_2D_MAP_OPTIONS,
    center: [center.lat, center.lng] as [number, number],
    zoom
  });
  mapRef.current = recreatedMap;
  moduleRef.current = L;
  attachLeafletViewportListeners(recreatedMap, L, mapRef, moduleRef, latestPropsRef, layerRef, viewportCleanupRef, overlayFrameRef);
  return recreatedMap;
}

function drawLeafletLayers(props: MapRenderProps, L: typeof import("leaflet"), map: LeafletMap, layerRef: MutableRefObject<LayerGroup | null>) {
  if (!map) return;
  if (layerRef.current) {
    layerRef.current.remove();
  }
  const layer = L.layerGroup().addTo(map);
  layerRef.current = layer;
  const worldOffsets = getVisibleLeafletWorldOffsets(map);
  let routeCopies = 0;
  let airportCopies = 0;
  let aircraftCopies = 0;

  if (shouldShowRoutes(props.displayMode)) {
    props.routes.forEach((route) => {
      const origin = airportsById[route.originAirportId];
      const destination = airportsById[route.destinationAirportId];
      const active = props.selectedRouteId === route.id;
      const canonicalSegments = buildRoutePolylineLatLngSegments(origin, destination);
      worldOffsets.forEach((longitudeOffset) => {
        L.polyline(shiftRouteSegments(canonicalSegments, longitudeOffset), {
          color: active ? "#d76745" : "#18545c",
          weight: active ? 4 : 2,
          opacity: 0.85
        })
          .on("click", () => props.onSelectRoute(route.id))
          .addTo(layer);
        routeCopies += 1;
      });
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
              const { position, heading: bearing } = getAircraftPositionAndHeading(origin, destination, progress);
              const canonicalLng = normalizeLongitude(position.lng);
              worldOffsets.forEach((longitudeOffset) => {
                const copyLng = canonicalLng + longitudeOffset;
                L.marker([position.lat, copyLng], {
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
                        .setLatLng([position.lat, copyLng])
                        .setContent(aircraftDetailsHtml(aircraft, model, item, props.currentGameTimeMs))
                        .openOn(map);
                    }, 0);
                  })
                  .addTo(layer);
                aircraftCopies += 1;
              });
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
      const canonicalLng = normalizeLongitude(airport.lng);
      worldOffsets.forEach((longitudeOffset) => {
        const copyLng = canonicalLng + longitudeOffset;
        const marker = L.marker([airport.lat, copyLng], {
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
              .setLatLng([airport.lat, copyLng])
              .setContent(airportDetailsHtml(airport, isPrimaryBase, isSecondaryBase, isExpanded, props.airportPopupLabels))
              .openOn(map);
          }, 0);
        });
        marker.addTo(layer);
        airportCopies += 1;
      });
    });
  }

  if (process.env.NODE_ENV === "development") {
    console.debug("[Leaflet] Overlay redraw", { worldOffsets, routeCopies, airportCopies, aircraftCopies });
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

function drawGoogleLayers(props: MapRenderProps, map: any, layersRef: MutableRefObject<any[]>) {
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
          const { position, heading: bearing } = getAircraftPositionAndHeading(origin, destination, progress);
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
        content: airportDetailsHtml(airport, isPrimaryBase, isSecondaryBase, isExpanded, props.airportPopupLabels)
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

function getNetworkAirportIds(props: NetworkAirportInput) {
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

function airportDetailsHtml(
  airport: (typeof airports)[number],
  isPrimaryBase: boolean,
  isSecondaryBase: boolean,
  isExpanded: boolean,
  labels: AirportPopupLabels
) {
  const baseLabel = isPrimaryBase ? labels.primaryBase : isSecondaryBase ? labels.secondaryBase : labels.notBaseAirport;
  return `
    <div class="airport-popup">
      <strong>${airport.name}</strong>
      <span>${airport.iata} / ${airport.icao}</span>
      <span>${airport.city}, ${airport.country}</span>
      <span>${labels.size}: ${labels.sizeTiers[airport.sizeTier]}</span>
      <span>${baseLabel}</span>
      <span>${isExpanded ? labels.connectedToNetwork : labels.notConnectedYet}</span>
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
