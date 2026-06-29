"use client";

import { RotateCcw, ShoppingCart } from "lucide-react";
import { useMemo, useState } from "react";
import { aircraftById, aircraftModels } from "@/data/aircraft";
import { useTranslation } from "@/i18n";
import { availableCargoTons, routeSuitabilityHints, validateCabinLayout } from "@/lib/cabin";
import { canAfford } from "@/lib/cash";
import { formatGBP, formatNumber } from "@/lib/format";
import { createRegistration } from "@/lib/ids";
import { useGameStore } from "@/store/gameStore";
import type { AircraftModel, CabinLayout, RouteBand } from "@/types/game";

type SortMode = "price" | "range" | "capacity";
type RouteFilter = "all" | "short-haul" | "medium-haul" | "long-haul";

export function AircraftMarketScreen() {
  const { t } = useTranslation();
  const game = useGameStore((state) => state.game);
  const buyAircraft = useGameStore((state) => state.buyAircraft);
  const manufacturers = Array.from(new Set(aircraftModels.map((model) => model.manufacturer))).sort();
  const [manufacturer, setManufacturer] = useState("all");
  const [routeType, setRouteType] = useState<RouteFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("price");
  const [selectedModelId, setSelectedModelId] = useState(aircraftModels[1].id);
  const selectedModel = aircraftById[selectedModelId] ?? aircraftModels[0];
  const [layout, setLayout] = useState<CabinLayout>(selectedModel.suggestedLayout);
  const [registration, setRegistration] = useState(createRegistration(game?.fleet.length ?? 0));
  const validation = useMemo(() => validateCabinLayout(selectedModel, layout), [layout, selectedModel]);
  const affordable = game ? canAfford(game, validation.purchasePriceGBP) : false;
  const registrationError = useMemo(() => {
    if (!game) return null;
    const value = registration.trim().toUpperCase();
    if (!value) return "Aircraft registration cannot be empty.";
    if (value.length < 3 || value.length > 12) return "Aircraft registration must be 3 to 12 characters.";
    if (!/^[A-Z0-9-]+$/.test(value)) return "Aircraft registration can only use letters, numbers and hyphen.";
    if (game.fleet.some((aircraft) => aircraft.registration.toUpperCase() === value)) return "Aircraft registration must be unique.";
    return null;
  }, [game, registration]);

  if (!game) return null;

  const filteredModels = aircraftModels
    .filter((model) => manufacturer === "all" || model.manufacturer === manufacturer)
    .filter((model) => routeType === "all" || model.recommendedRouteType === routeType)
    .sort((a, b) => {
      if (sortMode === "range") return b.rangeKm - a.rangeKm;
      if (sortMode === "capacity") return b.maxPassengerSeats - a.maxPassengerSeats;
      return a.estimatedPriceGBP - b.estimatedPriceGBP;
    });
  const grouped = manufacturers
    .map((maker) => ({ maker, models: filteredModels.filter((model) => model.manufacturer === maker) }))
    .filter((group) => group.models.length > 0);

  function selectModel(model: AircraftModel) {
    setSelectedModelId(model.id);
    setLayout(model.suggestedLayout);
    setRegistration(createRegistration(game?.fleet.length ?? 0));
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-black text-ink">{t("fleet.market")}</h2>
        <p className="text-slate-600">Purchase new aircraft and configure cabins before delivery.</p>
      </div>
      <section className="grid gap-4 xl:grid-cols-[1fr_430px]">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-soft">
            <Select label="Manufacturer" value={manufacturer} onChange={setManufacturer} options={["all", ...manufacturers]} />
            <Select label="Route type" value={routeType} onChange={(value) => setRouteType(value as RouteFilter)} options={["all", "short-haul", "medium-haul", "long-haul"]} />
            <Select label="Sort" value={sortMode} onChange={(value) => setSortMode(value as SortMode)} options={["price", "range", "capacity"]} />
          </div>
          {grouped.map((group) => (
            <section key={group.maker} className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
              <h3 className="mb-3 font-black text-ink">{group.maker}</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {group.models.map((model) => (
                  <article
                    key={model.id}
                    className={`rounded-lg border p-4 transition hover:-translate-y-0.5 hover:shadow-soft ${
                      model.id === selectedModelId ? "border-coral bg-coral/5" : "border-slate-200"
                    }`}
                  >
                    <AircraftVisual model={model} />
                    <div className="mt-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{model.manufacturer}</p>
                        <h4 className="font-black text-ink">{model.model}</h4>
                      </div>
                      <span className="rounded-md bg-runway px-2 py-1 text-xs font-bold capitalize text-jet">{model.recommendedRouteType}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <Spec label={t("fleet.range")} value={`${formatNumber.format(model.rangeKm)} km`} />
                      <Spec label={t("fleet.cruise")} value={`${formatNumber.format(model.cruiseSpeedKmh)} km/h`} />
                      <Spec label={t("fleet.maxSeats")} value={formatNumber.format(model.maxPassengerSeats)} />
                      <Spec label={t("fleet.basePrice")} value={formatGBP.format(model.estimatedPriceGBP)} />
                    </div>
                    <button type="button" onClick={() => selectModel(model)} className="mt-4 w-full rounded-md bg-jet px-3 py-2 font-bold text-white">
                      {t("fleet.configure")}
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="h-fit rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{selectedModel.manufacturer}</p>
              <h3 className="font-black text-ink">{selectedModel.model} cabin</h3>
            </div>
            <button type="button" onClick={() => setLayout(selectedModel.suggestedLayout)} className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-bold text-jet">
              <RotateCcw size={16} />
              {t("fleet.suggested")}
            </button>
          </div>
          <label className="mt-4 block">
            <span className="text-sm font-semibold text-slate-700">{t("fleet.registration")}</span>
            <input value={registration} onChange={(event) => setRegistration(event.target.value.toUpperCase())} maxLength={12} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-jet focus:ring-2 focus:ring-jet/20" />
          </label>
          {registrationError ? <p className="mt-2 rounded-md bg-coral/10 px-3 py-2 text-sm font-semibold text-coral">{registrationError}</p> : null}
          <div className="mt-4 space-y-3">
            <CabinInput label={t("fleet.firstClass")} value={layout.first} limit={selectedModel.cabinLimits.first.max} onChange={(value) => setLayout({ ...layout, first: value })} />
            <CabinInput label={t("fleet.business")} value={layout.business} limit={selectedModel.cabinLimits.business.max} onChange={(value) => setLayout({ ...layout, business: value })} />
            <CabinInput label={t("fleet.premiumEconomy")} value={layout.premiumEconomy} limit={selectedModel.cabinLimits.premiumEconomy.max} onChange={(value) => setLayout({ ...layout, premiumEconomy: value })} />
            <CabinInput label={t("fleet.economy")} value={layout.economy} limit={selectedModel.cabinLimits.economy.max} onChange={(value) => setLayout({ ...layout, economy: value })} />
            <CabinInput label={t("fleet.cargoTonnes")} value={layout.cargoTons} limit={availableCargoTons(selectedModel, layout)} step="0.5" onChange={(value) => setLayout({ ...layout, cargoTons: value })} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <Spec label={t("fleet.purchasePrice")} value={formatGBP.format(validation.purchasePriceGBP)} />
            <Spec label={t("fleet.routeFit")} value={routeSuitabilityHints(selectedModel, layout)[0]} />
          </div>
          <button
            type="button"
            onClick={() => {
              buyAircraft(selectedModel.id, layout, registration);
              setRegistration(createRegistration(game.fleet.length + 1));
            }}
            disabled={!validation.isValid || !affordable || Boolean(registrationError)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-coral px-3 py-3 font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <ShoppingCart size={18} />
            {t("fleet.buyAircraft")} {formatGBP.format(validation.purchasePriceGBP)}
          </button>
        </div>
      </section>
    </div>
  );
}

function AircraftVisual({ model }: { model: AircraftModel }) {
  const wide = model.visualVariant !== "narrow-body";
  const longHaul = model.visualVariant === "long-haul-wide-body";
  return (
    <div className="relative h-24 overflow-hidden rounded-md bg-gradient-to-br from-sky/20 via-white to-mint/20">
      <div className={`absolute left-1/2 top-1/2 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-jet shadow-sm ${wide ? "w-48" : "w-36"}`} />
      <div className={`absolute left-1/2 top-[42%] h-10 -translate-x-1/2 -skew-x-12 rounded-[100%] bg-coral/90 ${wide ? "w-28" : "w-20"}`} />
      <div className={`absolute left-[18%] top-1/2 h-12 w-5 -translate-y-1/2 -rotate-45 rounded-full bg-jet ${longHaul ? "scale-110" : ""}`} />
      <div className={`absolute right-[18%] top-1/2 h-12 w-5 -translate-y-1/2 rotate-45 rounded-full bg-jet ${longHaul ? "scale-110" : ""}`} />
      <div className="absolute right-[12%] top-[38%] h-7 w-4 rotate-45 rounded-sm bg-jet" />
    </div>
  );
}

function CabinInput({ label, value, limit, step = "1", onChange }: { label: string; value: number; limit: number; step?: string; onChange: (value: number) => void }) {
  return (
    <label className="grid grid-cols-[1fr_110px] items-center gap-3">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input type="number" min="0" max={limit} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full rounded-md border border-slate-300 px-3 py-2 text-right outline-none focus:border-jet focus:ring-2 focus:ring-jet/20" />
    </label>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="text-sm">
      <span className="mr-2 font-bold text-slate-600">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-2 font-bold text-jet">
        {options.map((option) => (
          <option key={option} value={option}>
            {option === "all" ? "All" : option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-runway px-3 py-2">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="truncate font-bold text-ink">{value}</p>
    </div>
  );
}
