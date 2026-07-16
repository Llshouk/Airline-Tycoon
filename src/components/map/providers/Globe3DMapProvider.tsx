"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GlobeLoadingFallback } from "@/components/map/GlobeLoadingFallback";
import { setGlobeBootInProgress, supportsWebGL } from "@/lib/mapPreferences";
import type { MapAircraftMarker, MapAirportMarker, MapGlobeFailureReason, MapRouteLine } from "@/components/map/mapTypes";

export type Globe3DMapProviderProps = {
  airports: MapAirportMarker[];
  routes: MapRouteLine[];
  aircraft: MapAircraftMarker[];
  selectedRouteId: string | null;
  baseAirportId: string;
  labels: {
    autoRotate: string;
    resetView: string;
    focusBase: string;
    experimental: string;
    performance: string;
  };
  onSelectAirport: (airportId: string) => void;
  onSelectRoute: (routeId: string) => void;
  onSelectAircraft: (aircraftId: string) => void;
  onError: (reason: MapGlobeFailureReason) => void;
};

type HoverInfo = {
  x: number;
  y: number;
  title: string;
  detail: string;
} | null;

const GLOBE_RADIUS = 2.4;

export function Globe3DMapProvider({
  airports,
  routes,
  aircraft,
  selectedRouteId,
  baseAirportId,
  labels,
  onSelectAirport,
  onSelectRoute,
  onSelectAircraft,
  onError
}: Globe3DMapProviderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const globeGroupRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const rendererRef = useRef<any>(null);
  const autoRotateRef = useRef(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo>(null);
  const [mounted, setMounted] = useState(false);
  const safeAirports = useMemo(() => toArray(airports).filter(isValidAirport), [airports]);
  const safeRoutes = useMemo(() => toArray(routes).filter(isValidRoute), [routes]);
  const safeAircraft = useMemo(() => toArray(aircraft).filter(isValidAircraft), [aircraft]);

  const baseAirport = useMemo(
    () => safeAirports.find((airport) => airport.id === baseAirportId) ?? safeAirports.find((airport) => airport.markerType === "base") ?? safeAirports[0],
    [safeAirports, baseAirportId]
  );

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    if (!mounted) return;
    if (!supportsWebGL()) {
      onError("unsupported");
      return;
    }

    let disposed = false;
    let animationFrame = 0;
    let globeBootSucceeded = false;
    const interactiveObjects: any[] = [];
    const disposables: Array<{ dispose: () => void }> = [];

    async function initGlobe() {
      try {
        if (process.env.NODE_ENV !== "production") {
          console.debug("[Globe] Initialising", {
            airportCount: safeAirports.length,
            routeCount: safeRoutes.length,
            aircraftCount: safeAircraft.length,
            webglSupported: true
          });
        }
        setGlobeBootInProgress(true);
        const THREE = await import("three");
        if (disposed || !containerRef.current) return;

        const container = containerRef.current;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color("#07111f");

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(container.clientWidth, container.clientHeight);
        rendererRef.current = renderer;
        container.appendChild(renderer.domElement);

        const camera = new THREE.PerspectiveCamera(42, container.clientWidth / Math.max(container.clientHeight, 1), 0.1, 100);
        camera.position.set(0, 0.45, 7.1);
        cameraRef.current = camera;

        const globeGroup = new THREE.Group();
        globeGroup.rotation.x = -0.28;
        globeGroup.rotation.y = -0.35;
        globeGroupRef.current = globeGroup;
        scene.add(globeGroup);

        scene.add(new THREE.AmbientLight("#dcefff", 1.7));
        const keyLight = new THREE.DirectionalLight("#ffffff", 2.1);
        keyLight.position.set(4, 3, 5);
        scene.add(keyLight);

        const earthGeometry = new THREE.SphereGeometry(GLOBE_RADIUS, 72, 48);
        const earthMaterial = new THREE.MeshStandardMaterial({
          color: "#153b5f",
          roughness: 0.9,
          metalness: 0.03,
          emissive: "#061522",
          emissiveIntensity: 0.45
        });
        disposables.push(earthGeometry, earthMaterial);
        globeGroup.add(new THREE.Mesh(earthGeometry, earthMaterial));

        addGraticule(THREE, globeGroup, disposables);
        addRoutes(THREE, globeGroup, safeRoutes, selectedRouteId, interactiveObjects, disposables);
        addAirports(THREE, globeGroup, safeAirports, interactiveObjects, disposables);
        addAircraft(THREE, globeGroup, safeAircraft, interactiveObjects, disposables);

        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        let dragging = false;
        let didDrag = false;
        let previousX = 0;
        let previousY = 0;

        const updatePointer = (event: PointerEvent) => {
          const rect = renderer.domElement.getBoundingClientRect();
          pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
        };

        const findHit = (event: PointerEvent) => {
          updatePointer(event);
          raycaster.setFromCamera(pointer, camera);
          return raycaster.intersectObjects(interactiveObjects, false)[0]?.object ?? null;
        };

        const onPointerDown = (event: PointerEvent) => {
          dragging = true;
          didDrag = false;
          previousX = event.clientX;
          previousY = event.clientY;
          renderer.domElement.setPointerCapture(event.pointerId);
        };

        const onPointerMove = (event: PointerEvent) => {
          if (dragging) {
            const deltaX = event.clientX - previousX;
            const deltaY = event.clientY - previousY;
            if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) didDrag = true;
            globeGroup.rotation.y += deltaX * 0.006;
            globeGroup.rotation.x += deltaY * 0.004;
            globeGroup.rotation.x = Math.max(-1.25, Math.min(1.25, globeGroup.rotation.x));
            previousX = event.clientX;
            previousY = event.clientY;
            setHoverInfo(null);
            return;
          }

          const hit = findHit(event);
          if (!hit?.userData?.title) {
            setHoverInfo(null);
            return;
          }
          setHoverInfo({
            x: event.clientX,
            y: event.clientY,
            title: hit.userData.title,
            detail: hit.userData.detail
          });
        };

        const onPointerUp = (event: PointerEvent) => {
          dragging = false;
          if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
          if (didDrag) return;
          const hit = findHit(event);
          if (hit?.userData?.kind === "airport") onSelectAirport(hit.userData.id);
          if (hit?.userData?.kind === "route") onSelectRoute(hit.userData.id);
          if (hit?.userData?.kind === "aircraft") onSelectAircraft(hit.userData.id);
        };

        const onWheel = (event: WheelEvent) => {
          event.preventDefault();
          camera.position.z = Math.max(4.4, Math.min(10.5, camera.position.z + event.deltaY * 0.004));
        };

        const onResize = () => {
          if (!container.clientWidth || !container.clientHeight) return;
          camera.aspect = container.clientWidth / container.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(container.clientWidth, container.clientHeight);
        };
        const onPointerLeave = () => setHoverInfo(null);

        renderer.domElement.addEventListener("pointerdown", onPointerDown);
        renderer.domElement.addEventListener("pointermove", onPointerMove);
        renderer.domElement.addEventListener("pointerup", onPointerUp);
        renderer.domElement.addEventListener("pointerleave", onPointerLeave);
        renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
        window.addEventListener("resize", onResize);

        const animate = () => {
          if (disposed) return;
          if (autoRotateRef.current) globeGroup.rotation.y += 0.002;
          renderer.render(scene, camera);
          if (!globeBootSucceeded) {
            globeBootSucceeded = true;
            setGlobeBootInProgress(false);
          }
          animationFrame = requestAnimationFrame(animate);
        };
        animate();

        return () => {
          renderer.domElement.removeEventListener("pointerdown", onPointerDown);
          renderer.domElement.removeEventListener("pointermove", onPointerMove);
          renderer.domElement.removeEventListener("pointerup", onPointerUp);
          renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
          renderer.domElement.removeEventListener("wheel", onWheel);
          window.removeEventListener("resize", onResize);
        };
      } catch (error) {
        console.error("[Globe] Initialisation failed", error);
        onError("initialisation");
      }
    }

    let removeListeners: (() => void) | undefined;
    initGlobe().then((cleanup) => {
      removeListeners = cleanup;
    });

    return () => {
      disposed = true;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      removeListeners?.();
      disposables.forEach((item) => item.dispose());
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current.domElement?.remove();
        rendererRef.current = null;
      }
      globeGroupRef.current = null;
      cameraRef.current = null;
    };
  }, [mounted, safeAirports, safeRoutes, safeAircraft, selectedRouteId, onSelectAirport, onSelectRoute, onSelectAircraft, onError]);

  if (!mounted) return <GlobeLoadingFallback />;

  function resetView() {
    if (globeGroupRef.current) {
      globeGroupRef.current.rotation.x = -0.28;
      globeGroupRef.current.rotation.y = -0.35;
    }
    if (cameraRef.current) cameraRef.current.position.z = 7.1;
  }

  function focusBase() {
    if (!baseAirport || !globeGroupRef.current) return;
    globeGroupRef.current.rotation.x = (baseAirport.lat * Math.PI) / 180 * 0.75;
    globeGroupRef.current.rotation.y = (-baseAirport.lng * Math.PI) / 180;
  }

  return (
    <div className="relative h-full min-h-[560px] overflow-hidden bg-slate-950">
      <div ref={containerRef} className="h-full w-full" />
      <div className="absolute right-3 top-3 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => setAutoRotate((value) => !value)} className={`rounded-md px-3 py-2 text-xs font-black shadow-soft ${autoRotate ? "bg-coral text-white" : "bg-white/90 text-ink"}`}>
          {labels.autoRotate}
        </button>
        <button type="button" onClick={resetView} className="rounded-md bg-white/90 px-3 py-2 text-xs font-black text-ink shadow-soft">
          {labels.resetView}
        </button>
        <button type="button" onClick={focusBase} className="rounded-md bg-white/90 px-3 py-2 text-xs font-black text-ink shadow-soft">
          {labels.focusBase}
        </button>
      </div>
      <div className="absolute bottom-3 left-3 right-3 rounded-md border border-cyan-200/20 bg-slate-950/80 px-3 py-2 text-xs font-bold text-cyan-50 shadow-soft md:right-auto md:max-w-lg">
        <span className="font-black text-cyan-200">{labels.experimental}</span>
        <span className="ml-2 text-slate-200">{labels.performance}</span>
      </div>
      {hoverInfo ? (
        <div className="pointer-events-none fixed z-[7000] max-w-xs rounded-md border border-white/10 bg-slate-950/95 px-3 py-2 text-xs font-bold text-white shadow-soft" style={{ left: hoverInfo.x + 12, top: hoverInfo.y + 12 }}>
          <p>{hoverInfo.title}</p>
          <p className="mt-0.5 text-slate-300">{hoverInfo.detail}</p>
        </div>
      ) : null}
    </div>
  );
}

function toArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

function isValidCoordinate(lat: unknown, lng: unknown) {
  return typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90 && typeof lng === "number" && Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

function isValidAirport(airport: MapAirportMarker): boolean {
  return Boolean(airport?.id && airport.iata) && isValidCoordinate(airport.lat, airport.lng) && ["base", "opened", "unopened"].includes(airport.markerType);
}

function isValidRoute(route: MapRouteLine): boolean {
  return Boolean(route?.id && route.originIata && route.destinationIata) && isValidCoordinate(route.origin?.lat, route.origin?.lng) && isValidCoordinate(route.destination?.lat, route.destination?.lng);
}

function isValidAircraft(item: MapAircraftMarker): boolean {
  return Boolean(item?.id && item.registration && item.model) && isValidCoordinate(item.lat, item.lng) && typeof item.heading === "number" && Number.isFinite(item.heading) && typeof item.size === "number" && Number.isFinite(item.size) && item.size > 0;
}

function addGraticule(THREE: any, globeGroup: any, disposables: Array<{ dispose: () => void }>) {
  const material = new THREE.LineBasicMaterial({ color: "#5aa7bd", transparent: true, opacity: 0.16 });
  disposables.push(material);
  for (let lat = -60; lat <= 60; lat += 30) {
    const points = Array.from({ length: 145 }, (_, index) => latLngToVector(THREE, lat, -180 + index * 2.5, GLOBE_RADIUS + 0.006));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    disposables.push(geometry);
    globeGroup.add(new THREE.Line(geometry, material));
  }
  for (let lng = -150; lng <= 180; lng += 30) {
    const points = Array.from({ length: 73 }, (_, index) => latLngToVector(THREE, -90 + index * 2.5, lng, GLOBE_RADIUS + 0.007));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    disposables.push(geometry);
    globeGroup.add(new THREE.Line(geometry, material));
  }
}

function addRoutes(THREE: any, globeGroup: any, routes: MapRouteLine[], selectedRouteId: string | null, interactiveObjects: any[], disposables: Array<{ dispose: () => void }>) {
  routes.forEach((route) => {
    const selected = route.id === selectedRouteId;
    const material = new THREE.LineBasicMaterial({ color: selected ? "#58d5e8" : "#4f9d7e", transparent: true, opacity: selected ? 0.95 : 0.55 });
    const points = buildArcPoints(THREE, route.origin, route.destination, selected ? 0.46 : 0.32);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, material);
    line.userData = {
      kind: "route",
      id: route.id,
      title: `${route.originIata} - ${route.destinationIata}`,
      detail: selected ? "Selected route" : "Opened route"
    };
    interactiveObjects.push(line);
    disposables.push(geometry, material);
    globeGroup.add(line);
  });
}

function addAirports(THREE: any, globeGroup: any, airports: MapAirportMarker[], interactiveObjects: any[], disposables: Array<{ dispose: () => void }>) {
  const geometry = new THREE.SphereGeometry(0.028, 14, 10);
  disposables.push(geometry);
  airports.forEach((airport) => {
    const material = new THREE.MeshBasicMaterial({ color: airportColor(airport.markerType) });
    const marker = new THREE.Mesh(geometry, material);
    marker.position.copy(latLngToVector(THREE, airport.lat, airport.lng, GLOBE_RADIUS + markerAltitude(airport.markerType)));
    marker.scale.setScalar(airport.markerType === "base" ? 1.7 : airport.markerType === "opened" ? 1.35 : 1);
    marker.userData = {
      kind: "airport",
      id: airport.id,
      title: `${airport.iata} ${airport.name}`,
      detail: [airport.city, airport.country].filter(Boolean).join(", ")
    };
    interactiveObjects.push(marker);
    disposables.push(material);
    globeGroup.add(marker);
  });
}

function addAircraft(THREE: any, globeGroup: any, aircraft: MapAircraftMarker[], interactiveObjects: any[], disposables: Array<{ dispose: () => void }>) {
  const geometry = new THREE.ConeGeometry(0.035, 0.12, 4);
  disposables.push(geometry);
  aircraft.forEach((item) => {
    const material = new THREE.MeshBasicMaterial({ color: "#f6c945" });
    const marker = new THREE.Mesh(geometry, material);
    marker.position.copy(latLngToVector(THREE, item.lat, item.lng, GLOBE_RADIUS + 0.115));
    marker.lookAt(latLngToVector(THREE, item.lat, item.lng, GLOBE_RADIUS + 0.45));
    marker.rotateZ((-item.heading * Math.PI) / 180);
    marker.userData = {
      kind: "aircraft",
      id: item.id,
      title: item.registration,
      detail: `${item.model}${item.status ? ` - ${item.status}` : ""}`
    };
    interactiveObjects.push(marker);
    disposables.push(material);
    globeGroup.add(marker);
  });
}

function buildArcPoints(THREE: any, origin: { lat: number; lng: number }, destination: { lat: number; lng: number }, altitude: number) {
  const start = latLngToVector(THREE, origin.lat, origin.lng, GLOBE_RADIUS + 0.035);
  const end = latLngToVector(THREE, destination.lat, destination.lng, GLOBE_RADIUS + 0.035);
  const mid = start.clone().add(end).normalize().multiplyScalar(GLOBE_RADIUS + altitude);
  return new THREE.QuadraticBezierCurve3(start, mid, end).getPoints(42);
}

function latLngToVector(THREE: any, lat: number, lng: number, radius: number) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function airportColor(markerType: MapAirportMarker["markerType"]) {
  if (markerType === "base") return "#d76745";
  if (markerType === "opened") return "#4f9d7e";
  return "#ffffff";
}

function markerAltitude(markerType: MapAirportMarker["markerType"]) {
  if (markerType === "base") return 0.09;
  if (markerType === "opened") return 0.075;
  return 0.06;
}
