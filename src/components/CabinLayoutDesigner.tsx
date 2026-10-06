"use client";

import { ArrowLeftRight, Armchair } from "lucide-react";
import { useId, useRef, useState } from "react";
import { seatProducts } from "@/config/cabinProducts";
import { useTranslation } from "@/i18n";
import { CABIN_CLASSES } from "@/lib/cabin";
import { cabinLengthInches, configuredSection, moveCabinBoundary } from "@/lib/cabinConfiguration";
import type { CabinConfiguration } from "@/types/cabin";
import type { AircraftModel, CabinClass } from "@/types/game";

export const CABIN_COLORS: Record<CabinClass, string> = {
  first: "#a94464", business: "#5466a8", premiumEconomy: "#b28a35", economy: "#358d88"
};
export const CABIN_CODES: Record<CabinClass, string> = { first: "F", business: "C", premiumEconomy: "W", economy: "Y" };
const FLOOR_START = 166;
const FLOOR_LENGTH = 880;

export function CabinLayoutDesigner({ model, configuration, selected, onSelect, onChange }: {
  model: AircraftModel; configuration: CabinConfiguration; selected: CabinClass;
  onSelect: (cabin: CabinClass) => void;
  onChange: (update: (previous: CabinConfiguration) => CabinConfiguration) => void;
}) {
  const { t } = useTranslation();
  const stage = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<CabinClass | null>(null);
  const clipId = useId().replaceAll(":", "");
  const cabins = CABIN_CLASSES.filter((cabin) => seatProducts(model, cabin).length);
  let offset = 0;
  const sections = cabins.map((cabin) => {
    const start = offset;
    offset += configuration.sections[cabin].spacePercent;
    return { cabin, start, end: offset, ...configuredSection(model, configuration, cabin) };
  });
  const label = (cabin: CabinClass) => t(cabin === "first" ? "fleet.firstClass" : `fleet.${cabin}`);
  function move(cabin: CabinClass, clientX: number) {
    const rect = stage.current?.getBoundingClientRect();
    if (!rect?.width) return;
    const position = ((clientX - rect.left) / rect.width * 1200 - FLOOR_START) / FLOOR_LENGTH * 100;
    onChange((previous) => moveCabinBoundary(model, previous, cabin, position));
  }

  return (
    <div>
      <div role="tablist" aria-label={t("cabin.title")} className="grid grid-cols-4 gap-1 border-b border-slate-200">
        {CABIN_CLASSES.map((cabin) => {
          const supported = cabins.includes(cabin);
          const section = configuredSection(model, configuration, cabin);
          return <button key={cabin} type="button" role="tab" id={`cabin-tab-${cabin}`} aria-controls="cabin-editor-panel"
            aria-selected={selected === cabin} disabled={!supported} onClick={() => onSelect(cabin)}
            tabIndex={selected === cabin ? 0 : -1}
            onKeyDown={(event) => {
              const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
              if (direction) { event.preventDefault(); const next = cabins[(cabins.indexOf(cabin) + direction + cabins.length) % cabins.length]; onSelect(next);
                document.getElementById(`cabin-tab-${next}`)?.focus(); }
            }}
            title={supported ? label(cabin) : t("cabin.unavailable")}
            className="cabin-class-tab min-w-0 border-b-[3px] px-1 py-3 text-center transition-colors disabled:opacity-35 sm:px-3"
            style={{ borderColor: selected === cabin ? CABIN_COLORS[cabin] : "transparent", backgroundColor: selected === cabin ? `${CABIN_COLORS[cabin]}0d` : undefined }}>
            <span className="mb-1 block break-words text-[11px] font-bold text-slate-500 sm:text-xs">{label(cabin)}</span>
            <span className="flex items-center justify-center gap-1.5 text-lg font-black text-ink sm:text-xl">
              <span className="text-xs" style={{ color: CABIN_COLORS[cabin] }}>{CABIN_CODES[cabin]}</span>{supported ? section.seats : "--"}
            </span>
          </button>;
        })}
      </div>
      <div ref={stage} className={`cabin-stage relative my-2 w-full select-none ${dragging ? "is-dragging" : ""}`}>
        <svg viewBox="0 0 1200 450" className="block h-auto w-full" role="img" aria-label={`${model.model} ${t("cabin.floorPlan")}`}>
          <defs><clipPath id={clipId}><rect x={FLOOR_START} y="156" width={FLOOR_LENGTH} height="138" rx="10" /></clipPath></defs>
          <path d="M480 160 L735 15 Q753 9 765 23 L702 174 M480 290 L735 435 Q753 441 765 427 L702 276" fill="#e8edef" stroke="#cbd5db" strokeWidth="2" />
          <path d="M1010 174 L1126 94 L1148 106 L1100 197 M1010 276 L1126 356 L1148 344 L1100 253" fill="#e8edef" stroke="#cbd5db" strokeWidth="2" />
          <path d="M38 225 Q85 139 169 138 L1034 138 Q1108 156 1165 225 Q1108 294 1034 312 L169 312 Q85 311 38 225Z" fill="white" stroke="#b8c8ce" strokeWidth="3" />
          <path d="M82 202 L121 171 L145 180 L126 207Z M82 248 L121 279 L145 270 L126 243Z" fill="#92abb8" />
          <rect x="143" y="199" width="12" height="52" rx="3" fill="#dde6e9" />
          <rect x={FLOOR_START} y="156" width={FLOOR_LENGTH} height="138" rx="10" fill="#f1f5f5" />
          {Array.from({ length: 36 }, (_, index) => <g key={index} fill="#b8d1d9">
            <rect x={174 + index * 24} y="145" width="10" height="4" rx="2" />
            <rect x={174 + index * 24} y="301" width="10" height="4" rx="2" />
          </g>)}
          <g clipPath={`url(#${clipId})`}>
            {sections.map(({ cabin, start, end, product, rows }) => {
              const x = FLOOR_START + start / 100 * FLOOR_LENGTH;
              const width = (end - start) / 100 * FLOOR_LENGTH;
              const pitch = configuration.sections[cabin].pitchInches / cabinLengthInches(model) * FLOOR_LENGTH;
              return <g key={cabin} data-cabin={cabin} data-rows={rows} data-arrangement={product?.arrangement}>
                <rect x={x} y="156" width={width} height="138" fill={CABIN_COLORS[cabin]} fillOpacity={selected === cabin ? 0.15 : 0.055}
                  className="cabin-region" onClick={() => onSelect(cabin)} style={{ cursor: "pointer" }} />
                {product && Array.from({ length: rows }, (_, row) => <SeatMapRow key={row} x={x + row * pitch + pitch / 2}
                  rowLength={Math.min(pitch * 0.72, 22)} arrangement={product.arrangement} color={CABIN_COLORS[cabin]} />)}
                {selected === cabin && width > 0 ? <rect x={x + 1} y="157" width={Math.max(0, width - 2)} height="136"
                  fill="none" stroke={CABIN_COLORS[cabin]} strokeWidth="2" pointerEvents="none" /> : null}
              </g>;
            })}
          </g>
          {sections.slice(0, -1).map(({ cabin, end }) => <line key={cabin} x1={FLOOR_START + end / 100 * FLOOR_LENGTH} x2={FLOOR_START + end / 100 * FLOOR_LENGTH}
            y1="134" y2="326" stroke={CABIN_COLORS[cabin]} strokeWidth="3" strokeDasharray="5 4" pointerEvents="none" />)}
        </svg>
        {sections.slice(0, -1).map(({ cabin, start, end }, index) => {
          const next = sections[index + 1];
          const limit = next.end;
          const name = `${label(cabin)} / ${label(next.cabin)}`;
          return <div key={cabin} role="slider" tabIndex={0} aria-label={name} title={name} aria-orientation="horizontal"
            aria-valuemin={Math.round(start)} aria-valuemax={Math.round(limit)} aria-valuenow={Math.round(end)}
            aria-valuetext={`${label(cabin)} ${configuration.sections[cabin].spacePercent.toFixed(1)}%`}
            className="cabin-divider absolute flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border-2 border-white text-white shadow-md outline-none focus-visible:ring-4 focus-visible:ring-sky/60"
            style={{ left: `${(FLOOR_START + end / 100 * FLOOR_LENGTH) / 1200 * 100}%`, top: `${index % 2 ? 76 : 66}%`, background: CABIN_COLORS[cabin], touchAction: "none" }}
            onPointerDown={(event) => { event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); setDragging(cabin); onSelect(cabin); }}
            onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) move(cabin, event.clientX); }}
            onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) { move(cabin, event.clientX); event.currentTarget.releasePointerCapture(event.pointerId); } setDragging(null); }}
            onPointerCancel={() => setDragging(null)} onLostPointerCapture={() => setDragging(null)}
            onKeyDown={(event) => {
              const step = event.shiftKey ? 5 : 1;
              const value = event.key === "ArrowLeft" || event.key === "ArrowDown" ? end - step : event.key === "ArrowRight" || event.key === "ArrowUp" ? end + step : event.key === "Home" ? start : event.key === "End" ? limit : null;
              if (value !== null) { event.preventDefault(); onSelect(cabin); onChange((previous) => moveCabinBoundary(model, previous, cabin, value)); }
            }}><ArrowLeftRight size={18} /></div>;
        })}
      </div>
    </div>
  );
}

function SeatMapRow({ x, rowLength, arrangement, color }: { x: number; rowLength: number; arrangement: string; color: string }) {
  const groups = arrangement.split("-").map(Number);
  const seats = groups.reduce((sum, value) => sum + value, 0);
  const aisle = 14;
  const seatWidth = (118 - (groups.length - 1) * aisle) / seats;
  let position = 166;
  return <g className="cabin-seat-row" style={{ transform: `translateX(${x}px)` }} pointerEvents="none">{groups.map((group, groupIndex) => {
    const start = position;
    position += group * seatWidth + aisle;
    return <g key={groupIndex}>{Array.from({ length: group }, (_, index) => <g key={index}>
      <rect x={-rowLength / 2} y={start + index * seatWidth + 1} width={rowLength} height={seatWidth - 2} rx="2.5" fill={color} fillOpacity="0.72" />
      <rect x={rowLength / 2 - 3} y={start + index * seatWidth + 1} width="3" height={seatWidth - 2} rx="1" fill={color} />
    </g>)}</g>;
  })}</g>;
}

export function SeatRowPreview({ arrangement, cabin }: { arrangement: string; cabin: CabinClass }) {
  return <div className="mx-auto flex w-full max-w-sm items-center justify-center gap-4 py-4 sm:gap-6" role="img" aria-label={arrangement}>
    {arrangement.split("-").map((group, groupIndex) => <div key={groupIndex} className="flex min-w-0 justify-center gap-1 sm:gap-2" style={{ flex: `${group} 1 0` }}>
      {Array.from({ length: Number(group) }, (_, index) => <Armchair key={index} className="h-6 w-6 min-w-0 shrink sm:h-8 sm:w-8" style={{ color: CABIN_COLORS[cabin] }} />)}
    </div>)}
  </div>;
}
