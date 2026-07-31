import assert from "node:assert/strict";
import test from "node:test";
import { hasVisibleLeafletTileCoverage, isVisibleLeafletTileRect, type RectBounds } from "../src/lib/leafletTileReadiness";

const container: RectBounds = { left: 0, right: 800, top: 0, bottom: 600, width: 800, height: 600 };

test("rejects a loaded tile whose rendered width collapsed to zero", () => {
  assert.equal(isVisibleLeafletTileRect({ left: 200, right: 200, top: 100, bottom: 356, width: 0, height: 256 }, container), false);
});

test("accepts a positive-size tile intersecting the map viewport", () => {
  assert.equal(isVisibleLeafletTileRect({ left: 200, right: 456, top: 100, bottom: 356, width: 256, height: 256 }, container), true);
});

test("rejects a positive-size tile outside the map viewport", () => {
  assert.equal(isVisibleLeafletTileRect({ left: 900, right: 1156, top: 100, bottom: 356, width: 256, height: 256 }, container), false);
});

test("accepts existing visible coverage without requiring a new tile event", () => {
  assert.equal(hasVisibleLeafletTileCoverage(4, 4), true);
  assert.equal(hasVisibleLeafletTileCoverage(3, 4), false);
});
