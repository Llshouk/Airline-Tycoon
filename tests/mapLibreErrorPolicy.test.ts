import assert from "node:assert/strict";
import test from "node:test";
import { classifyMapLibreError, type GlobeMapErrorDiagnostics } from "../src/lib/mapLibreErrorPolicy";

const baseline: GlobeMapErrorDiagnostics = { styleLoaded: true, coreReady: true };

test("classifies OpenFreeMap, glyph, and country-label failures as optional", () => {
  assert.equal(classifyMapLibreError({ ...baseline, sourceId: "openfreemap-vector" }), "optional");
  assert.equal(classifyMapLibreError({ ...baseline, message: "Failed to load glyph range for fontstack" }), "optional");
  assert.equal(classifyMapLibreError({ ...baseline, message: "country-label-primary-layer unavailable" }), "optional");
});

test("classifies satellite tile and post-initialisation errors as recoverable", () => {
  assert.equal(classifyMapLibreError({ ...baseline, sourceId: "nasa-blue-marble", tile: "1/1/1" }), "recoverable");
  assert.equal(classifyMapLibreError({ ...baseline, message: "A later style parse warning" }), "recoverable");
});

test("classifies a core WebGL initialisation failure as fatal", () => {
  assert.equal(
    classifyMapLibreError({ styleLoaded: false, coreReady: false, message: "WebGL context creation failed" }),
    "fatal"
  );
});
