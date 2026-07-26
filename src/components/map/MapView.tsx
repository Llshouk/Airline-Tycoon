"use client";

import { forwardRef, type ReactNode } from "react";
import type { MapLegendLabels, MapProviderType } from "@/components/map/mapTypes";

type MapViewProps = {
  provider: MapProviderType;
  engineLabel: string;
  isGlobeActive: boolean;
  isPreparingTwoD?: boolean;
  preparingTwoDLabel?: string;
  isOffline: boolean;
  offlineMessage: string;
  baseMapWarning?: string | null;
  legendLabels: MapLegendLabels;
  globeContent?: ReactNode;
};

export const MapView = forwardRef<HTMLDivElement, MapViewProps>(function MapView(
  { provider, engineLabel, isGlobeActive, isPreparingTwoD = false, preparingTwoDLabel, isOffline, offlineMessage, baseMapWarning, legendLabels, globeContent },
  ref
) {
  const leafletsPaneClass = isPreparingTwoD || isGlobeActive ? "z-0 opacity-100 pointer-events-none" : "z-10 opacity-100 pointer-events-auto";
  const globePaneClass = isPreparingTwoD
    ? "z-10 bg-ink opacity-100 pointer-events-none"
    : isGlobeActive
      ? "z-10 opacity-100 pointer-events-auto"
      : "z-0 opacity-0 pointer-events-none";

  return (
    <div className="flex h-full min-h-[520px] min-w-0 w-full flex-col overflow-hidden" data-map-provider={provider}>
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden sm:min-h-[560px]">
        <div
          ref={ref}
          aria-hidden={isGlobeActive || isPreparingTwoD}
          className={`absolute inset-0 h-full w-full overflow-hidden ${leafletsPaneClass}`}
        />
        <div
          aria-hidden={!isGlobeActive || isPreparingTwoD}
          className={`absolute inset-0 h-full w-full overflow-hidden ${globePaneClass}`}
        >
          {globeContent}
        </div>
        {!isPreparingTwoD ? null : (
          <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-md bg-ink/90 px-3 py-2 text-xs font-bold text-white shadow-soft" role="status">
            {preparingTwoDLabel}
          </div>
        )}
        <div className="absolute left-3 top-3 z-20 rounded-md bg-white/95 px-3 py-2 text-xs font-bold text-ink shadow-soft">
          {engineLabel}
        </div>
        {!isOffline ? null : (
          <div className="absolute bottom-3 left-3 right-3 z-20 rounded-md border border-amber-200 bg-amber-50/95 px-3 py-2 text-xs font-bold text-amber-900 shadow-soft md:right-auto md:max-w-md">
            {offlineMessage}
          </div>
        )}
        {!baseMapWarning ? null : (
          <div role="status" className={`absolute left-3 right-3 z-20 rounded-md border border-amber-200 bg-amber-50/95 px-3 py-2 text-xs font-bold text-amber-900 shadow-soft md:left-auto md:max-w-md ${isOffline ? "bottom-14" : "bottom-3"}`}>
            {baseMapWarning}
          </div>
        )}
      </div>
      <MapLegend labels={legendLabels} />
    </div>
  );
});

function MapLegend({ labels }: { labels: MapLegendLabels }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 bg-white/95 px-3 py-2 text-xs font-bold text-ink">
      <span className="font-black uppercase tracking-normal text-slate-500">{labels.title}:</span>
      <LegendRow color="#d76745" label={labels.base} />
      <LegendRow color="#4f9d7e" label={labels.opened} />
      <LegendRow color="#ffffff" label={labels.unopened} bordered />
    </div>
  );
}

function LegendRow({ color, label, bordered = false }: { color: string; label: string; bordered?: boolean }) {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap py-0.5">
      <span className={`h-3 w-3 rounded-full ${bordered ? "border border-slate-400" : "border border-ink/20"}`} style={{ backgroundColor: color }} />
      <span>{label}</span>
    </span>
  );
}
