type DetachableLeafletLayer = {
  remove: () => unknown;
  off: () => unknown;
};

export function detachLeafletLayer(layer: DetachableLeafletLayer | null | undefined) {
  if (!layer) return;
  // Leaflet removes map callbacks through an internal listener on this event.
  layer.remove();
  layer.off();
}
