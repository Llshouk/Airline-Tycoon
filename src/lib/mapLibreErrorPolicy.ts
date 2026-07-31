const OPTIONAL_SOURCE_IDS = new Set(["openfreemap-vector"]);
const OPTIONAL_LAYER_PREFIXES = ["country-label-", "airline-globe-ocean-tint"];

export type GlobeMapErrorSeverity = "fatal" | "optional" | "recoverable";

export type GlobeMapErrorDiagnostics = {
  message?: string;
  sourceId?: string;
  tile?: string;
  styleLoaded: boolean;
  coreReady: boolean;
};

export function classifyMapLibreError({ message = "", sourceId, tile, coreReady }: GlobeMapErrorDiagnostics): GlobeMapErrorSeverity {
  const normalizedMessage = message.toLowerCase();
  const isOptionalLayerError = OPTIONAL_LAYER_PREFIXES.some((prefix) => normalizedMessage.includes(prefix));
  const isOptionalMessage = ["openfreemap", "glyph", "fontstack", "source-layer place", "source-layer water", "country-label"].some((value) => normalizedMessage.includes(value));

  if (sourceId && OPTIONAL_SOURCE_IDS.has(sourceId)) return "optional";
  if (isOptionalLayerError || isOptionalMessage) return "optional";
  if (coreReady || tile || sourceId === "nasa-blue-marble") return "recoverable";
  if (["webgl", "context", "style", "projection", "parse"].some((value) => normalizedMessage.includes(value))) return "fatal";
  return "recoverable";
}
