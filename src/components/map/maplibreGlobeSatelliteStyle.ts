import type { StyleSpecification } from "maplibre-gl";

const NASA_BLUE_MARBLE_TILE_URL =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/2013-12-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg";

export function getGlobeSatelliteStyle(): string | StyleSpecification {
  const configuredStyleUrl = process.env.NEXT_PUBLIC_MAPLIBRE_GLOBE_SATELLITE_STYLE_URL;
  if (configuredStyleUrl) return configuredStyleUrl;

  return {
    version: 8,
    sources: {
      "nasa-blue-marble": {
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
        id: "globe-satellite-imagery",
        type: "raster",
        source: "nasa-blue-marble",
        paint: {
          "raster-saturation": 0.08,
          "raster-contrast": 0.06,
          "raster-fade-duration": 0
        }
      }
    ]
  };
}
