import type { MapEngine } from "@/components/map/mapTypes";

export const MAP_ENGINE_STORAGE_KEY = "airline-tycoon-map-engine";
export const GLOBE_BOOT_STORAGE_KEY = "airline-tycoon-globe-boot-in-progress";

export function getSafeMapEngine(value: unknown): MapEngine {
  return value === "globe3d" ? "globe3d" : "2d";
}

export function getStoredMapEngine(): MapEngine {
  if (typeof window === "undefined") return "2d";

  try {
    const storedEngine = window.localStorage.getItem(MAP_ENGINE_STORAGE_KEY);
    const engine = getSafeMapEngine(storedEngine);
    const globeBootWasInterrupted = window.sessionStorage.getItem(GLOBE_BOOT_STORAGE_KEY) === "true";

    if (storedEngine !== engine || globeBootWasInterrupted) {
      window.localStorage.setItem(MAP_ENGINE_STORAGE_KEY, "2d");
    }

    return globeBootWasInterrupted ? "2d" : engine;
  } catch {
    return "2d";
  }
}

export function saveMapEngine(engine: MapEngine) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(MAP_ENGINE_STORAGE_KEY, getSafeMapEngine(engine));
  } catch {
    // Private browsing or storage quotas should not stop the map from rendering.
  }
}

export function clearMapUiCache() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(MAP_ENGINE_STORAGE_KEY);
    window.sessionStorage.removeItem(GLOBE_BOOT_STORAGE_KEY);
  } catch {
    // Clearing optional UI state is best effort and must preserve player saves.
  }
}

export function setGlobeBootInProgress(inProgress: boolean) {
  if (typeof window === "undefined") return;

  try {
    if (inProgress) {
      window.sessionStorage.setItem(GLOBE_BOOT_STORAGE_KEY, "true");
    } else {
      window.sessionStorage.removeItem(GLOBE_BOOT_STORAGE_KEY);
    }
  } catch {
    // Session storage is optional; it must not determine whether the globe can render.
  }
}

export function supportsWebGL(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;

  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}
