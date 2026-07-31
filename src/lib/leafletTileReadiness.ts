export type RectBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};

export function isVisibleLeafletTileRect(tileRect: RectBounds, containerRect: RectBounds) {
  return (
    tileRect.width > 0 &&
    tileRect.height > 0 &&
    tileRect.right > containerRect.left &&
    tileRect.left < containerRect.right &&
    tileRect.bottom > containerRect.top &&
    tileRect.top < containerRect.bottom
  );
}

export function hasVisibleLeafletTileCoverage(visibleLoadedTiles: number, threshold: number) {
  return Number.isFinite(visibleLoadedTiles) && Number.isFinite(threshold) && threshold > 0 && visibleLoadedTiles >= threshold;
}
