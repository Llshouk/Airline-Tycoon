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
    <div className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden" data-map-provider={provider}>
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <div
          aria-hidden={isGlobeActive || isPreparingTwoD}
          className={`absolute inset-0 h-full w-full overflow-hidden ${leafletsPaneClass}`}
        >
          <div ref={ref} style={{ height: "100%", width: "100%" }} />
        </div>
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
        <span className="sr-only">{engineLabel}</span>
        {!isOffline ? null : (
          <div className="absolute bottom-14 left-3 right-3 z-20 rounded-md border border-amber-200 bg-amber-50/95 px-3 py-2 text-xs font-bold text-amber-900 shadow-soft md:right-auto md:max-w-md">
            {offlineMessage}
          </div>
        )}
        {!baseMapWarning ? null : (
          <div role="status" className={`absolute left-3 right-3 z-20 rounded-md border border-amber-200 bg-amber-50/95 px-3 py-2 text-xs font-bold text-amber-900 shadow-soft md:left-auto md:max-w-md ${isOffline ? "bottom-28 md:bottom-14" : "bottom-14"}`}>
            {baseMapWarning}
          </div>
        )}
        <MapLegend labels={legendLabels} />
      </div>
    </div>
  );
});

function MapLegend({ labels }: { labels: MapLegendLabels }) {
  return (
    <div className="map-legend">
      <span className="sr-only">{labels.title}:</span>
      <LegendRow color="#ffc629" label={labels.base} />
      <LegendRow color="#1b4f8f" label={labels.opened} />
      <LegendRow color="#ffffff" label={labels.unopened} bordered />
    </div>
  );
}

function LegendRow({ color, label, bordered = false }: { color: string; label: string; bordered?: boolean }) {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap py-0.5">
      <span className={`h-3 w-3 rounded-full border ${bordered ? "border-slate-500" : "border-ink"}`} style={{ backgroundColor: color }} />
      <span>{label}</span>
    </span>
  );
}
