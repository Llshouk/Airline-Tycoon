import assert from "node:assert/strict";
import test from "node:test";
import { classifyMapLibreError, type GlobeMapErrorDiagnostics } from "../src/lib/mapLibreErrorPolicy";
import { AIRPORT_MAX_ZOOM, AIRPORT_DETAIL_ZOOM, OPEN_FREE_MAP_STYLE_URL, applyOpenFreeMapLanguage, mapNameExpression } from "../src/components/map/openFreeMapStyle";
import type { Map as LibreMap, StyleSpecification } from "maplibre-gl";
import { supportsWebGL } from "../src/lib/mapPreferences";

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

test("required OpenFreeMap style and vector-source failures trigger fallback", () => {
  assert.equal(classifyMapLibreError({ ...baseline, sourceId: "openmaptiles" }), "fatal");
  assert.equal(classifyMapLibreError({ ...baseline, coreReady: false, message: "Failed https://tiles.openfreemap.org/styles/liberty" }), "fatal");
});

test("airport map uses the public vector style and supports airport-level zoom", () => {
  assert.equal(OPEN_FREE_MAP_STYLE_URL, "https://tiles.openfreemap.org/styles/liberty");
  assert.equal(AIRPORT_MAX_ZOOM, 18);
  assert.ok(AIRPORT_DETAIL_ZOOM >= 13 && AIRPORT_DETAIL_ZOOM <= AIRPORT_MAX_ZOOM);
  assert.ok(JSON.stringify(mapNameExpression("zh")).includes("name:zh"));
  assert.ok(!JSON.stringify(mapNameExpression("en")).includes("name:zh"));
});

test("map localization preserves runway references, icons, geometry and game overlay labels", () => {
  const style: StyleSpecification = { version: 8, sources: {}, layers: [
    { id: "city", type: "symbol", source: "openmaptiles", "source-layer": "place", layout: { "text-field": ["get", "name"] } },
    { id: "runway", type: "symbol", source: "openmaptiles", "source-layer": "aeroway", layout: { "text-field": ["get", "ref"] } },
    { id: "icon", type: "symbol", source: "openmaptiles", "source-layer": "poi", layout: { "icon-image": "airport" } },
    { id: "game", type: "symbol", source: "airports-source", layout: { "text-field": ["get", "name"] } },
    { id: "buildings", type: "fill", source: "openmaptiles", "source-layer": "building" }
  ] };
  const before = JSON.stringify(style);
  const calls: string[] = [];
  const map = { getStyle: () => style, setLayoutProperty: (id: string) => { calls.push(id); } } as unknown as Pick<LibreMap, "getStyle" | "setLayoutProperty">;
  applyOpenFreeMapLanguage(map, "zh");
  assert.deepEqual(calls, ["city"]);
  assert.equal(JSON.stringify(style), before);
});

test("MapLibre capability check requires WebGL2 and releases the probe context", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const requests: string[] = [];
  let lost = 0, available = true;
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    Object.defineProperty(globalThis, "document", { configurable: true, value: {
      createElement: () => ({ getContext: (type: string) => {
        requests.push(type);
        return available ? { getExtension: () => ({ loseContext: () => { lost++; } }) } : null;
      } })
    } });
    assert.equal(supportsWebGL(), true);
    assert.equal(lost, 1);
    available = false;
    assert.equal(supportsWebGL(), false);
    assert.deepEqual(requests, ["webgl2", "webgl2"]);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
