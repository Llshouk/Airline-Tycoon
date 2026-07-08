export const PRIMARY_WORLD_BOUNDS: [[number, number], [number, number]] = [
  [-85, -180],
  [85, 180]
];

export const LEAFLET_2D_MAP_OPTIONS = {
  center: [30, 5] as [number, number],
  zoom: 2,
  minZoom: 2,
  maxZoom: 8,
  worldCopyJump: false,
  maxBounds: PRIMARY_WORLD_BOUNDS,
  maxBoundsViscosity: 1
};

export const LEAFLET_2D_TILE_OPTIONS = {
  attribution: "&copy; OpenStreetMap contributors",
  maxZoom: 10,
  noWrap: true,
  bounds: PRIMARY_WORLD_BOUNDS
};
