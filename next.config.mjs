import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants.js";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const sharedConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development"
  }
};

export default async function nextConfig(phase) {
  if (phase === PHASE_DEVELOPMENT_SERVER || phase === PHASE_PRODUCTION_BUILD) {
    // MapLibre 6's module worker imports a sibling shared module; keep both together.
    const dist = dirname(fileURLToPath(import.meta.resolve("maplibre-gl")));
    const destination = join(process.cwd(), "public", "maplibre-workers");
    await mkdir(destination, { recursive: true });
    for (const filename of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
      await copyFile(join(dist, filename), join(destination, filename));
    }
    await copyFile(join(dist, "..", "LICENSE.txt"), join(destination, "LICENSE.txt"));
  }
  return {
    ...sharedConfig,
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next"
  };
}
