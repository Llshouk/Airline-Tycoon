import type { StyleSpecification } from "maplibre-gl";

const NASA_BLUE_MARBLE_TILE_URL =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/2013-12-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg";
const SATELLITE_SOURCE_ID = "nasa-blue-marble";
const SATELLITE_LAYER_ID = "globe-satellite-imagery";
const OPENFREEMAP_SOURCE_ID = "openfreemap-vector";
const OCEAN_TINT_LAYER_ID = "airline-globe-ocean-tint";
const OPENFREEMAP_TILEJSON_URL = "https://tiles.openfreemap.org/planet";
const OPENFREEMAP_GLYPHS_URL = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
const OPENFREEMAP_WATER_SOURCE_LAYER = "water";
const OPENFREEMAP_PLACE_SOURCE_LAYER = "place";

export type GlobeLabelLanguage = "en" | "zh";

export const SATELLITE_RASTER_PAINT = {
  "raster-brightness-min": 0.22,
  "raster-brightness-max": 1,
  "raster-contrast": -0.12,
  "raster-saturation": 0.14,
  "raster-opacity": 1
} as const;

export const OCEAN_TINT_PAINT = {
  "fill-color": "#65a9cc",
  "fill-opacity": 0.2
} as const;

export function getGlobeSatelliteStyle(): string | StyleSpecification {
  const configuredStyleUrl = process.env.NEXT_PUBLIC_MAPLIBRE_GLOBE_SATELLITE_STYLE_URL;
  if (configuredStyleUrl) return configuredStyleUrl;

  return {
    version: 8,
    glyphs: OPENFREEMAP_GLYPHS_URL,
    sources: {
      [SATELLITE_SOURCE_ID]: {
        type: "raster",
        tiles: [NASA_BLUE_MARBLE_TILE_URL],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 8,
        attribution: '<a href="https://earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs">NASA GIBS</a>'
      }
    },
    layers: [
      {
        id: SATELLITE_LAYER_ID,
        type: "raster",
        source: SATELLITE_SOURCE_ID,
        paint: {
          ...SATELLITE_RASTER_PAINT,
          "raster-fade-duration": 0
        }
      }
    ]
  };
}

export function applyBrightSatelliteEarth(map: maplibregl.Map) {
  const rasterLayers = map.getStyle().layers?.filter((layer) => layer.type === "raster") ?? [];
  const satelliteLayers = rasterLayers.filter((layer) => {
    const identity = `${layer.id} ${layer.source ?? ""}`.toLowerCase();
    return layer.id === SATELLITE_LAYER_ID || identity.includes("satellite") || identity.includes("imagery") || identity.includes("blue-marble") || identity.includes("nasa");
  });
  const targetLayers = satelliteLayers.length > 0 ? satelliteLayers : rasterLayers;

  targetLayers.forEach((layer) => {
    Object.entries(SATELLITE_RASTER_PAINT).forEach(([property, value]) => {
      map.setPaintProperty(layer.id, property, value);
    });
  });

  return targetLayers.map((layer) => layer.id);
}

export function applyLightOceanTint(map: maplibregl.Map) {
  ensureOpenFreeMapSource(map);

  if (map.getLayer(OCEAN_TINT_LAYER_ID)) return;

  map.addLayer({
    id: OCEAN_TINT_LAYER_ID,
    type: "fill",
    source: OPENFREEMAP_SOURCE_ID,
    "source-layer": OPENFREEMAP_WATER_SOURCE_LAYER,
    paint: OCEAN_TINT_PAINT
  });
}

const COUNTRY_LABEL_LAYERS = [
  { id: "country-label-primary-layer", rankFilter: ["==", ["get", "rank"], 1], minzoom: 0 },
  { id: "country-label-secondary-layer", rankFilter: ["==", ["get", "rank"], 2], minzoom: 1.5 },
  { id: "country-label-detail-layer", rankFilter: [">=", ["get", "rank"], 3], minzoom: 3 }
] as const;

export function applyCountryLabels(map: maplibregl.Map, language: GlobeLabelLanguage) {
  ensureOpenFreeMapSource(map);
  const textField = countryLabelTextField(language);

  COUNTRY_LABEL_LAYERS.forEach(({ id, rankFilter, minzoom }) => {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, "text-field", textField as never);
      return;
    }

    map.addLayer({
      id,
      type: "symbol",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": OPENFREEMAP_PLACE_SOURCE_LAYER,
      minzoom,
      filter: ["all", ["==", ["get", "class"], "country"], rankFilter] as never,
      layout: {
        "text-field": textField as never,
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 0, 9, 2, 11, 4, 13, 7, 15],
        "text-allow-overlap": false,
        "text-ignore-placement": false,
        "text-optional": true,
        "text-max-width": 8,
        "text-letter-spacing": 0.02
      },
      paint: {
        "text-color": "#f8fafc",
        "text-halo-color": "rgba(15, 23, 42, 0.88)",
        "text-halo-width": 1.5,
        "text-halo-blur": 0.5
      }
    });
  });
}

function ensureOpenFreeMapSource(map: maplibregl.Map) {
  if (map.getSource(OPENFREEMAP_SOURCE_ID)) return;

  map.addSource(OPENFREEMAP_SOURCE_ID, {
    type: "vector",
    url: OPENFREEMAP_TILEJSON_URL,
    attribution: '<a href="https://openfreemap.org/">OpenFreeMap</a> © <a href="https://openmaptiles.org/">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  });
}

function countryLabelTextField(language: GlobeLabelLanguage) {
  return language === "zh"
    ? ["coalesce", ["get", "name:zh-Hans"], ["get", "name:zh"], ["get", "name:en"], ["get", "name_en"], ["get", "name"]]
    : ["coalesce", ["get", "name:en"], ["get", "name_en"], ["get", "name"]];
}
