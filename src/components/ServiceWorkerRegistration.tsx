"use client";

import { useEffect } from "react";
import { safeGetSessionStorage, safeRemoveSessionStorage, safeSetSessionStorage } from "@/lib/gameSaveStorage";

const CHUNK_RELOAD_KEY = "airline-tycoon-chunk-reload";

function isChunkLoadError(reason: unknown): boolean {
  const message = reason instanceof Error ? `${reason.name} ${reason.message}` : String(reason);
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(message);
}

export function ServiceWorkerRegistration() {
  useEffect(() => {
    const recoverFromStaleChunk = (event: PromiseRejectionEvent | ErrorEvent) => {
      const reason = "reason" in event ? event.reason : event.error;
      if (!isChunkLoadError(reason) || safeGetSessionStorage(CHUNK_RELOAD_KEY)) return;

      safeSetSessionStorage(CHUNK_RELOAD_KEY, "1");
      window.location.reload();
    };

    window.addEventListener("unhandledrejection", recoverFromStaleChunk);
    window.addEventListener("error", recoverFromStaleChunk);

    const canRegisterServiceWorker =
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production" &&
      process.env.NEXT_PUBLIC_VERCEL_ENV !== "preview";

    if (canRegisterServiceWorker) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => registration.update())
        .catch((error) => {
          console.error("[offline] Service worker registration failed.", error);
        });
    }

    const clearReloadFlag = window.setTimeout(() => safeRemoveSessionStorage(CHUNK_RELOAD_KEY), 5000);
    return () => {
      window.clearTimeout(clearReloadFlag);
      window.removeEventListener("unhandledrejection", recoverFromStaleChunk);
      window.removeEventListener("error", recoverFromStaleChunk);
    };
  }, []);

  return null;
}
