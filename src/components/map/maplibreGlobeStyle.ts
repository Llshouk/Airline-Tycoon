import type maplibregl from "maplibre-gl";

export type GlobeVisualStyle = "light-modern";

export const DEFAULT_GLOBE_VISUAL_STYLE: GlobeVisualStyle = "light-modern";

export function applyGlobeVisualStyle(map: maplibregl.Map, style: GlobeVisualStyle = DEFAULT_GLOBE_VISUAL_STYLE) {
  if (style !== "light-modern") return;

  setPaint(map, "background", "background-color", "#dcecf4");
  setPaint(map, "countries-fill", "fill-color", "#eef0e9");
  setPaint(map, "countries-fill", "fill-opacity", 1);
  setPaint(map, "crimea-fill", "fill-color", "#eef0e9");
  setPaint(map, "coastline", "line-color", "#a4c5d3");
  setPaint(map, "coastline", "line-width", ["interpolate", ["linear"], ["zoom"], 0, 0.35, 4, 0.75, 8, 1.15]);
  setPaint(map, "countries-boundary", "line-color", "#c6cdd0");
  setPaint(map, "countries-boundary", "line-width", ["interpolate", ["linear"], ["zoom"], 0, 0.3, 4, 0.55, 8, 0.9]);
  setPaint(map, "countries-boundary", "line-opacity", 0.72);

  setLayout(map, "geolines", "visibility", "none");
  setLayout(map, "geolines-label", "visibility", "none");
  setPaint(map, "countries-label", "text-color", "#53616a");
  setPaint(map, "countries-label", "text-halo-color", "#f8faf9");
  setPaint(map, "countries-label", "text-halo-width", 0.75);
  setLayout(map, "countries-label", "text-size", ["interpolate", ["linear"], ["zoom"], 1.6, 8, 4, 10, 6, 13]);
  if (map.getLayer("countries-label")) map.setLayerZoomRange("countries-label", 1.6, 24);
}

function setPaint(map: maplibregl.Map, layerId: string, property: string, value: unknown) {
  if (map.getLayer(layerId)) map.setPaintProperty(layerId, property, value as never);
}

function setLayout(map: maplibregl.Map, layerId: string, property: string, value: unknown) {
  if (map.getLayer(layerId)) map.setLayoutProperty(layerId, property, value as never);
}
