export const LEAFLET_2D_MAP_OPTIONS = {
  center: [30, 5] as [number, number],
  zoom: 2,
  minZoom: 2,
  maxZoom: 18,
  maxBounds: [[-85, -Infinity], [85, Infinity]] as [[number, number], [number, number]],
  maxBoundsViscosity: 1,
  worldCopyJump: true
};

export const LEAFLET_2D_TILE_OPTIONS = {
  attribution: "&copy; OpenStreetMap contributors",
  maxZoom: 18,
  maxNativeZoom: 19,
  noWrap: false,
  updateWhenIdle: false,
  updateWhenZooming: false,
  keepBuffer: 2,
  crossOrigin: true
};
