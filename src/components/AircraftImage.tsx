"use client";

import { useEffect, useState } from "react";
import type { AircraftModel } from "@/types/game";

export function AircraftImage({ model, className = "h-24" }: { model: AircraftModel; className?: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [model.imageUrl]);

  return (
    <div className={`relative overflow-hidden rounded-md border border-slate-100 bg-white ${className}`}>
      {model.imageUrl && !failed ? (
        <img
          src={model.imageUrl}
          alt={model.imageAlt}
          onError={() => setFailed(true)}
          className="h-full w-full object-contain p-2"
        />
      ) : (
        <AircraftSilhouette model={model} />
      )}
    </div>
  );
}

function AircraftSilhouette({ model }: { model: AircraftModel }) {
  const wide = model.visualVariant !== "narrow-body";
  const longHaul = model.visualVariant === "long-haul-wide-body";

  return (
    <div className="absolute inset-0 bg-gradient-to-br from-sky/20 via-white to-mint/20" aria-label={model.imageAlt}>
      <div className={`absolute left-1/2 top-1/2 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-jet shadow-sm ${wide ? "w-48" : "w-36"}`} />
      <div className={`absolute left-1/2 top-[42%] h-10 -translate-x-1/2 -skew-x-12 rounded-[100%] bg-coral/90 ${wide ? "w-28" : "w-20"}`} />
      <div className={`absolute left-[18%] top-1/2 h-12 w-5 -translate-y-1/2 -rotate-45 rounded-full bg-jet ${longHaul ? "scale-110" : ""}`} />
      <div className={`absolute right-[18%] top-1/2 h-12 w-5 -translate-y-1/2 rotate-45 rounded-full bg-jet ${longHaul ? "scale-110" : ""}`} />
      <div className="absolute right-[12%] top-[38%] h-7 w-4 rotate-45 rounded-sm bg-jet" />
    </div>
  );
}
