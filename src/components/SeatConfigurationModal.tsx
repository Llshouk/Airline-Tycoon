"use client";

import { Check, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { AircraftImage } from "@/components/AircraftImage";
import {
  availableCargoTons,
  CABIN_CLASSES,
  getDefaultCabinConfig,
  getMaxSeatCabinConfig,
  getVisibleCabinSegments,
  layoutSeatEquivalent,
  normalizeCabinLayout,
  totalPassengerSeats,
  validateCabinLayout
} from "@/lib/cabin";
import { formatGBP, formatNumber } from "@/lib/format";
import type { AircraftModel, CabinClass, CabinLayout } from "@/types/game";

const classMeta: Record<CabinClass, { label: string; short: string; color: string; layout: string; pitch: string; width: string; comfort: number }> = {
  first: { label: "First Class", short: "F", color: "border-coral text-coral bg-coral/10", layout: "1-1", pitch: "60 in.", width: "22 in.", comfort: 94 },
  business: { label: "Business Class", short: "C", color: "border-indigo-500 text-indigo-500 bg-indigo-500/10", layout: "2-2", pitch: "42 in.", width: "20 in.", comfort: 86 },
  premiumEconomy: { label: "Premium Economy", short: "W", color: "border-purple-500 text-purple-500 bg-purple-500/10", layout: "2-3", pitch: "36 in.", width: "19 in.", comfort: 76 },
  economy: { label: "Economy Class", short: "Y", color: "border-mint text-mint bg-mint/10", layout: "3-3", pitch: "31 in.", width: "18 in.", comfort: 68 }
};

export function SeatConfigurationModal({
  model,
  layout,
  registration,
  onRegistrationChange,
  onLayoutChange,
  onCancel,
  onConfirm
}: {
  model: AircraftModel;
  layout: CabinLayout;
  registration: string;
  onRegistrationChange: (registration: string) => void;
  onLayoutChange: (layout: CabinLayout) => void;
  onCancel: () => void;
  onConfirm: (layout: CabinLayout) => void;
}) {
  const normalizedLayout = normalizeCabinLayout(model, layout);
  const validation = validateCabinLayout(model, normalizedLayout);
  const seatTotal = totalPassengerSeats(normalizedLayout);
  const maxCargo = availableCargoTons(model, normalizedLayout);

  function updateLayout(next: CabinLayout) {
    onLayoutChange(normalizeCabinLayout(model, next));
  }

  function setCabin(cabin: CabinClass, value: number) {
    updateLayout({ ...normalizedLayout, [cabin]: value });
  }

  return (
    <div className="fixed inset-0 z-[6500] flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
      <section className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-lg border border-slate-700 bg-[#111820] text-white shadow-soft animate-modal-in">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#111820]/95 px-5 py-4 backdrop-blur">
          <button type="button" onClick={onCancel} title="Cancel" className="flex h-10 w-10 items-center justify-center rounded-md text-coral hover:bg-white/10">
            <X size={24} />
          </button>
          <h3 className="text-xl font-black">Seat Configuration</h3>
          <button
            type="button"
            onClick={() => onConfirm(normalizedLayout)}
            disabled={!validation.isValid}
            title="Confirm Layout"
            className="flex h-10 w-10 items-center justify-center rounded-md text-mint hover:bg-white/10 disabled:cursor-not-allowed disabled:text-slate-600"
          >
            <Check size={26} />
          </button>
        </header>

        <div className="space-y-5 bg-[radial-gradient(circle_at_top,_rgba(45,118,128,0.28),_transparent_34%),linear-gradient(180deg,#0f2134,#132e3a)] p-5">
          <section className="grid gap-3 rounded-lg border border-white/15 bg-white/[0.04] p-3 md:grid-cols-[220px_1fr]">
            <AircraftImage model={model} className="h-28 bg-white" />
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Aircraft" value={`${model.manufacturer} ${model.model}`} />
              <Metric label="Seats" value={formatNumber.format(seatTotal)} />
              <label className="rounded-md bg-black/20 px-3 py-2">
                <span className="block text-xs font-black uppercase tracking-normal text-white/45">Reg.</span>
                <input
                  value={registration}
                  onChange={(event) => onRegistrationChange(event.target.value.toUpperCase())}
                  maxLength={12}
                  className="mt-1 w-full bg-transparent text-lg font-black text-white outline-none"
                />
              </label>
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-4">
            {CABIN_CLASSES.map((cabin) => (
              <CabinSummary key={cabin} cabin={cabin} seats={normalizedLayout[cabin]} />
            ))}
          </section>

          <section className="rounded-lg border border-white/15 bg-black/20 p-4">
            <AircraftCabinDiagram model={model} layout={normalizedLayout} onSetCabin={setCabin} />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                <DarkInfo label="Seat space" value={`${layoutSeatEquivalent(normalizedLayout)} / ${model.maxPassengerSeats}`} />
                <DarkInfo label="Cargo Capacity" value={`${normalizedLayout.cargoTons.toFixed(1)} / ${maxCargo.toFixed(1)} t`} />
                <DarkInfo label="Purchase" value={formatGBP.format(validation.purchasePriceGBP)} />
                <DarkInfo label="Status" value={validation.isValid ? "Valid" : "Invalid"} />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => updateLayout(getDefaultCabinConfig(model))}
                  className="flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-sm font-black text-white hover:bg-white/15"
                >
                  <RotateCcw size={16} />
                  Reset Layout
                </button>
                <button
                  type="button"
                  onClick={() => updateLayout(getMaxSeatCabinConfig(model))}
                  className="flex items-center gap-2 rounded-md bg-mint px-3 py-2 text-sm font-black text-white hover:bg-mint/90"
                >
                  <SlidersHorizontal size={16} />
                  Maximize Seats
                </button>
              </div>
            </div>
            {validation.errors.length > 0 ? (
              <div className="mt-3 space-y-2">
                {validation.errors.map((error) => (
                  <p key={error} className="rounded-md bg-coral/15 px-3 py-2 text-sm font-bold text-coral">{error}</p>
                ))}
              </div>
            ) : null}
          </section>

          <section className="grid gap-3 lg:grid-cols-2">
            {CABIN_CLASSES.map((cabin) => (
              <CabinDetailCard key={cabin} cabin={cabin} seats={normalizedLayout[cabin]} />
            ))}
          </section>
        </div>
      </section>
    </div>
  );
}

function AircraftCabinDiagram({
  model,
  layout,
  onSetCabin
}: {
  model: AircraftModel;
  layout: CabinLayout;
  onSetCabin: (cabin: CabinClass, seats: number) => void;
}) {
  const visibleSegments = getVisibleCabinSegments(layout);

  return (
    <div>
      <div className="relative mx-auto flex h-24 max-w-4xl overflow-hidden rounded-[50%] border border-white/30 bg-white/95 px-10 text-xs font-black text-ink shadow-inner">
        {visibleSegments.length > 0 ? (
          visibleSegments.map((segment) => {
            const meta = classMeta[segment.cabin];
            const compact = segment.widthPercent < 12;
            return (
              <div
                key={segment.cabin}
                style={{ flexBasis: `${segment.widthPercent}%` }}
                className={`relative flex min-w-[18px] items-center justify-center border-r border-slate-300 last:border-r-0 ${meta.color}`}
                title={`${meta.label}: ${segment.seats} seats, ${segment.widthPercent.toFixed(1)}% cabin proportion`}
              >
                <span className="rounded-full border border-current bg-white px-2 py-1">
                  {compact ? meta.short : `${meta.short} ${segment.seats}`}
                </span>
              </div>
            );
          })
        ) : (
          <div className="flex flex-1 items-center justify-center text-slate-500">No passenger cabin configured</div>
        )}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {CABIN_CLASSES.map((cabin) => {
          const locked = model.type === "narrowbody" && cabin === "first";
          return (
            <label key={cabin} className="rounded-md bg-white/5 p-3">
              <span className="flex items-center justify-between gap-2 text-xs font-black uppercase tracking-normal text-white/55">
                {classMeta[cabin].label}
                <span className="text-white">{layout[cabin]}</span>
              </span>
              <input
                type="range"
                min={model.cabinLimits[cabin].min}
                max={model.cabinLimits[cabin].max}
                value={layout[cabin]}
                disabled={locked}
                onChange={(event) => onSetCabin(cabin, Number(event.target.value))}
                className="mt-3 w-full accent-coral disabled:opacity-30"
              />
              {locked ? <span className="mt-1 block text-xs font-bold text-coral">Locked for narrow-body</span> : null}
            </label>
          );
        })}
      </div>
      <p className="mt-2 text-xs font-semibold text-white/50">Cabin space used: {layoutSeatEquivalent(layout)} / {model.maxPassengerSeats} seat-equivalent units</p>
    </div>
  );
}

function CabinSummary({ cabin, seats }: { cabin: CabinClass; seats: number }) {
  const meta = classMeta[cabin];
  return (
    <div className={`rounded-lg border p-3 ${seats > 0 ? "border-white/15 bg-black/20" : "border-white/10 bg-black/10 opacity-60"}`}>
      <p className="text-xs font-black uppercase tracking-normal text-white/45">{meta.label}</p>
      <p className="mt-2 flex items-center gap-2 text-xl font-black">
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${meta.color}`}>{meta.short}</span>
        {seats > 0 ? `${seats} Seats` : "0 Seats"}
      </p>
      {seats === 0 ? <p className="mt-1 text-xs font-bold text-white/35">Hidden in cabin diagram</p> : null}
    </div>
  );
}

function CabinDetailCard({ cabin, seats }: { cabin: CabinClass; seats: number }) {
  const meta = classMeta[cabin];
  const revenueShare = Math.min(99, Math.max(0, Math.round((seats / Math.max(1, seats + 20)) * meta.comfort)));
  return (
    <article className="overflow-hidden rounded-lg border border-white/15 bg-black/30">
      <div className="flex items-start justify-between gap-3 p-4">
        <div>
          <p className="text-xs font-black uppercase tracking-normal text-white/40">{meta.label}</p>
          <h4 className="text-xl font-black text-white">{seats} Seats</h4>
          <p className="mt-1 text-sm font-bold text-amber-400">Comfort Score {meta.comfort}%</p>
        </div>
        <button type="button" className="rounded-md bg-white/10 px-3 py-2 text-sm font-black text-white">
          Edit Class
        </button>
      </div>
      <div className="grid grid-cols-[1fr_1.4fr] border-y border-white/10">
        <div className={`flex min-h-28 items-center justify-center ${meta.color}`}>
          <span className="text-5xl font-black">{meta.short}</span>
        </div>
        <div className="grid grid-cols-3 gap-2 p-4">
          {Array.from({ length: 9 }).map((_, index) => (
            <span key={index} className="h-10 rounded-b-xl rounded-t-md border-2 border-white/45" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 p-4">
        <DarkInfo label="Layout" value={meta.layout} />
        <DarkInfo label="Seat Pitch" value={meta.pitch} />
        <DarkInfo label="Seat Width" value={meta.width} />
      </div>
      <div className="px-4 pb-4">
        <DarkInfo label="Revenue Contribution" value={`${revenueShare}%`} />
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-black/20 px-3 py-2">
      <p className="text-xs font-black uppercase tracking-normal text-white/45">{label}</p>
      <p className="mt-1 text-lg font-black text-white">{value}</p>
    </div>
  );
}

function DarkInfo({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-normal text-white/35">{label}</p>
      <p className="font-black text-white">{value}</p>
    </div>
  );
}
