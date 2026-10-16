import * as maplibregl from "maplibre-gl";
import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import type { Map as LeafletMap } from "leaflet";
import "maplibre-gl/dist/maplibre-gl.css";
import { applyAirportDetailStyle, applyOpenFreeMapLanguage, OPEN_FREE_MAP_ATTRIBUTION, OPEN_FREE_MAP_STYLE_URL } from "@/components/map/openFreeMapStyle";

export type VectorBasemap = ReturnType<typeof maplibreGL>;
export type VectorBasemapFactory = typeof createOpenFreeMapLayer;

maplibregl.setWorkerUrl(`/maplibre-workers/maplibre-gl-worker.mjs?v=${maplibregl.getVersion()}`);

export function createOpenFreeMapLayer(map: LeafletMap, onReady: () => void, onFailure: () => void, language: "en" | "zh" = "en"): VectorBasemap {
  const layer = maplibreGL({ style: OPEN_FREE_MAP_STYLE_URL, attributionControl: { customAttribution: OPEN_FREE_MAP_ATTRIBUTION } });
  layer.addTo(map);
  const gl = layer.getMaplibreMap();
  gl.once("style.load", () => { applyAirportDetailStyle(gl); applyOpenFreeMapLanguage(gl, language); });
  const canvas = layer.getCanvas();
  canvas.dataset.openfreemapReady = "false";
  let disposed = false;
  let failed = false;
  const timeout = window.setTimeout(fail, 12000);

  function fail() {
    if (disposed || failed) return;
    failed = true;
    window.clearTimeout(timeout);
    // Let MapLibre finish dispatching its current event before removing its map.
    queueMicrotask(() => { if (!disposed) onFailure(); });
  }
  function ready() {
    if (disposed || failed || !gl.isStyleLoaded() || !gl.areTilesLoaded()) return;
    canvas.dataset.openfreemapReady = "true";
    window.clearTimeout(timeout);
    onReady();
    layer.fire("load");
  }
  function handleError(event: maplibregl.ErrorEvent) {
    if (disposed || failed) return;
    const message = event.error?.message?.toLowerCase() ?? "";
    if (message.includes("glyph") || message.includes("font")) return;
    console.warn("[OpenFreeMap] Basemap unavailable; using raster fallback", { message: event.error?.message });
    fail();
  }
  gl.on("load", ready);
  gl.on("idle", ready);
  gl.on("error", handleError);
  const loading = () => { canvas.dataset.openfreemapReady = "false"; };
  gl.on("dataloading", loading);
  layer.once("remove", () => {
    disposed = true;
    window.clearTimeout(timeout);
    canvas.dataset.openfreemapReady = "false";
    gl.off("load", ready);
    gl.off("idle", ready);
    gl.off("error", handleError);
    gl.off("dataloading", loading);
  });
  return layer;
}
