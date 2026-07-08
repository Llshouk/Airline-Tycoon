"use client";

import { forwardRef } from "react";
import type { MapLegendLabels, MapProviderType } from "@/components/map/mapTypes";

type MapViewProps = {
  provider: MapProviderType;
  engineLabel: string;
  isOffline: boolean;
  offlineMessage: string;
  legendLabels: MapLegendLabels;
};

export const MapView = forwardRef<HTMLDivElement, MapViewProps>(function MapView(
  { provider, engineLabel, isOffline, offlineMessage, legendLabels },
  ref
) {
  return (
    <div className="flex h-full min-h-[620px] w-full flex-col" data-map-provider={provider}>
      <div className="relative min-h-[560px] flex-1">
        <div ref={ref} className="h-full w-full" />
        <div className="absolute left-3 top-3 rounded-md bg-white/95 px-3 py-2 text-xs font-bold text-ink shadow-soft">
          {engineLabel}
        </div>
        {!isOffline ? null : (
          <div className="absolute bottom-3 left-3 right-3 rounded-md border border-amber-200 bg-amber-50/95 px-3 py-2 text-xs font-bold text-amber-900 shadow-soft md:right-auto md:max-w-md">
            {offlineMessage}
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
