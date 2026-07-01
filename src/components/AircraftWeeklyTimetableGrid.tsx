"use client";

import { weekDays, weeklyEventBlocksFromSchedule, type ScheduleBlock } from "@/lib/schedule";
import type { AircraftInstance, Route } from "@/types/game";

const PIXELS_PER_HOUR = 36;

export function AircraftWeeklyTimetableGrid({
  aircraft,
  routes,
  previewBlocks = [],
  compact = false
}: {
  aircraft?: AircraftInstance;
  routes: Route[];
  previewBlocks?: ScheduleBlock[];
  compact?: boolean;
}) {
  const persistedBlocks = aircraft ? weeklyEventBlocksFromSchedule(aircraft, routes) : [];
  const blocks = [...persistedBlocks, ...previewBlocks];
  const pixelsPerHour = compact ? 42 : PIXELS_PER_HOUR;
  const gridHeight = 24 * pixelsPerHour;
  const columns = compact ? "58px repeat(7, minmax(96px, 1fr))" : "58px repeat(7, minmax(110px, 1fr))";

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-soft">
      <div className={`grid border-b border-slate-200 bg-runway text-xs font-black text-ink ${compact ? "min-w-[760px]" : ""}`} style={{ gridTemplateColumns: columns }}>
        <div className={compact ? "px-2 py-2" : "px-2 py-3"}>Time</div>
        {weekDays.map((day) => (
          <div key={day.id} className={`border-l border-slate-200 px-2 text-center ${compact ? "py-2" : "py-3"}`}>
            {compact ? day.short : day.label}
          </div>
        ))}
      </div>
      <div className={compact ? "max-h-[58vh] overflow-auto" : "max-h-[720px] overflow-auto"}>
        <div className={`grid ${compact ? "min-w-[760px]" : ""}`} style={{ gridTemplateColumns: columns }}>
          <div className="relative bg-runway" style={{ height: gridHeight }}>
            {Array.from({ length: 25 }, (_, hour) => (
              <div key={hour} className="absolute left-0 right-0 -translate-y-2 px-2 text-[11px] font-semibold tabular-nums text-slate-500" style={{ top: hour * pixelsPerHour }}>
                {String(hour).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          {weekDays.map((day) => {
            const dayBlocks = blocks.filter((block) => block.day === day.id);
            return (
              <div key={day.id} className="relative border-l border-slate-200 bg-white" style={{ height: gridHeight }}>
                {Array.from({ length: 25 }, (_, hour) => (
                  <div key={hour} className="absolute left-0 right-0 border-t border-slate-100" style={{ top: hour * pixelsPerHour }} />
                ))}
                {dayBlocks.map((block) => (
                  <div
                    key={block.id}
                    title={block.tooltip}
                    className={`absolute left-1 right-1 overflow-hidden rounded-md border px-2 py-1 shadow-sm ${compact ? "text-[10px]" : "text-[11px]"} ${blockStyle(block.kind)}`}
                    style={{
                      top: (block.startMinute / 60) * pixelsPerHour,
                      height: Math.max(compact ? 20 : 18, ((block.endMinute - block.startMinute) / 60) * pixelsPerHour)
                    }}
                  >
                    <div className="h-4 truncate whitespace-nowrap font-semibold leading-4 tabular-nums">{block.title}</div>
                    <div className="h-4 truncate whitespace-nowrap font-mono text-[10px] leading-4 opacity-80 tabular-nums">{block.subtitle}</div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-3 border-t border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">
        <Legend color="bg-slate-300" label="Flight" />
        <Legend color="bg-amber-200" label="Delayed" />
        <Legend color="bg-slate-100 bg-[repeating-linear-gradient(45deg,#f1f5f9_0,#f1f5f9_4px,#e2e8f0_4px,#e2e8f0_8px)]" label="Turnaround" />
        <Legend color="bg-sky/30" label="Preview" />
        <Legend color="bg-coral/30" label="Conflict" />
      </div>
    </div>
  );
}

function blockStyle(kind: ScheduleBlock["kind"]) {
  if (kind === "conflict") return "border-coral bg-coral/25 text-ink";
  if (kind === "preview") return "border-sky bg-sky/30 text-ink";
  if (kind === "delayed") return "border-amber-400 bg-amber-200 text-ink";
  if (kind === "turnaround") {
    return "border-slate-300 bg-[repeating-linear-gradient(45deg,#f8fafc_0,#f8fafc_4px,#e2e8f0_4px,#e2e8f0_8px)] text-slate-700";
  }
  return "border-slate-400 bg-slate-300 text-ink";
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-3 w-5 rounded-sm border border-slate-300 ${color}`} />
      {label}
    </span>
  );
}
