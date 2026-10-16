import type { ExpressionSpecification, Map as LibreMap } from "maplibre-gl";

export const OPEN_FREE_MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
export const DARK_GLOBE_BACKDROP = "#020611";
export const AIRPORT_DETAIL_ZOOM = 14;
export const AIRPORT_MAX_ZOOM = 18;
export const OPEN_FREE_MAP_ATTRIBUTION = '<a href="https://openfreemap.org/">OpenFreeMap</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export function mapNameExpression(language: "en" | "zh"): ExpressionSpecification {
  return language === "zh"
    ? ["coalesce", ["get", "name:zh-Hans"], ["get", "name:zh"], ["get", "name:en"], ["get", "name_en"], ["get", "name"]]
    : ["coalesce", ["get", "name:en"], ["get", "name_en"], ["get", "name"]];
}

export function applyAirportDetailStyle(map: Pick<LibreMap, "getStyle" | "setPaintProperty">) {
  for (const layer of map.getStyle().layers ?? []) {
    if (!("source-layer" in layer) || layer["source-layer"] !== "aeroway") continue;
    if (layer.type === "line" && layer.id.includes("runway")) map.setPaintProperty(layer.id, "line-color", "#788b93");
    if (layer.type === "line" && layer.id.includes("taxiway")) map.setPaintProperty(layer.id, "line-color", "#a6b5ba");
    if (layer.type === "fill") map.setPaintProperty(layer.id, "fill-color", "#d5dfe2");
  }
}

export function applyOpenFreeMapLanguage(map: Pick<LibreMap, "getStyle" | "setLayoutProperty">, language: "en" | "zh") {
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== "symbol" || !(JSON.stringify(layer.layout?.["text-field"]) ?? "").includes("name")) continue;
    // Keep road/runway reference labels and all game-owned overlay labels intact.
    if (!layer["source-layer"] || layer.source === "airports-source" || layer.source === "aircraft-source") continue;
    map.setLayoutProperty(layer.id, "text-field", mapNameExpression(language));
  }
}
