import type { StyleSpecification } from "maplibre-gl";

const NASA_BLUE_MARBLE_TILE_URL =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/2013-12-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg";
const SATELLITE_SOURCE_ID = "nasa-blue-marble";
const SATELLITE_LAYER_ID = "globe-satellite-imagery";

export const SATELLITE_RASTER_PAINT = {
  "raster-brightness-min": 0.14,
  "raster-brightness-max": 1,
  "raster-contrast": -0.06,
  "raster-saturation": 0.1,
  "raster-opacity": 1
} as const;

export function getGlobeSatelliteStyle(): string | StyleSpecification {
  const configuredStyleUrl = process.env.NEXT_PUBLIC_MAPLIBRE_GLOBE_SATELLITE_STYLE_URL;
  if (configuredStyleUrl) return configuredStyleUrl;

  return {
    version: 8,
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

export function applySatelliteBrightness(map: maplibregl.Map) {
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
