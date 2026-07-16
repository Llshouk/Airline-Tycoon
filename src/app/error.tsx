"use client";

import { useEffect } from "react";
import { clearMapUiCache, saveMapEngine } from "@/lib/mapPreferences";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") console.error("[App] Recoverable route error", error);
  }, [error]);

  const returnTo2d = () => {
    saveMapEngine("2d");
    window.location.assign("/");
  };

  const clearUiCache = async () => {
    clearMapUiCache();
    if ("caches" in window) {
      const keys = await window.caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("airline-tycoon-")).map((key) => window.caches.delete(key)));
    }
    window.location.reload();
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-runway px-6 text-ink">
      <div className="max-w-md space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-soft">
        <h1 className="text-xl font-black">The game hit a loading problem.</h1>
        <p className="text-sm text-slate-600">Your airline save has not been removed.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={reset} className="rounded-md bg-jet px-4 py-2 text-sm font-black text-white">Reload Game</button>
          <button type="button" onClick={returnTo2d} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-black">Return to 2D Map</button>
          <button type="button" onClick={clearUiCache} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-black">Clear UI Cache</button>
        </div>
        {process.env.NODE_ENV !== "production" && error.digest ? <p className="text-xs text-slate-500">Reference: {error.digest}</p> : null}
      </div>
    </main>
  );
}
