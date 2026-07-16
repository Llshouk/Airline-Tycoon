"use client";

import { useEffect } from "react";
import { clearMapUiCache, saveMapEngine } from "@/lib/mapPreferences";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") console.error("[App] Global error", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-slate-950 text-white">
        <main className="flex min-h-screen items-center justify-center px-6">
          <div className="max-w-md space-y-4">
            <h1 className="text-2xl font-black">Airline Tycoon could not start.</h1>
            <p className="text-sm text-slate-300">Your player save remains on this device.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={reset}>Reload Game</button>
              <button type="button" onClick={() => { saveMapEngine("2d"); window.location.assign("/"); }}>Return to 2D Map</button>
              <button type="button" onClick={() => { clearMapUiCache(); window.location.reload(); }}>Clear UI Cache</button>
            </div>
            {process.env.NODE_ENV !== "production" && error.digest ? <p className="text-xs text-slate-400">Reference: {error.digest}</p> : null}
          </div>
        </main>
      </body>
    </html>
  );
}
