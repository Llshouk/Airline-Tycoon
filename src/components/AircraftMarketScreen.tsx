"use client";

import { CheckCircle2, RotateCcw, ShoppingCart, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AircraftImage } from "@/components/AircraftImage";
import { SeatConfigurationModal } from "@/components/SeatConfigurationModal";
import { aircraftById, aircraftModels } from "@/data/aircraft";
import { airportsById } from "@/data/airports";
import { useTranslation } from "@/i18n";
import { getDefaultCabinConfig, routeSuitabilityHints, validateCabinLayout } from "@/lib/cabin";
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
  const [layout, setLayout] = useState<CabinLayout>(() => getDefaultCabinConfig(selectedModel));
  const [registration, setRegistration] = useState(createRegistration(game?.fleet.length ?? 0));
  const [selectedBaseAirportId, setSelectedBaseAirportId] = useState(game?.primaryBaseAirport ?? game?.baseAirportId ?? "");
  const [isSeatConfigOpen, setIsSeatConfigOpen] = useState(false);
  const [purchaseToast, setPurchaseToast] = useState<{ modelLabel: string; registration: string; baseIata: string } | null>(null);
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
  const ownedBaseIds = game.baseAirports ?? [game.primaryBaseAirport ?? game.baseAirportId];
  const hasOwnedBase = ownedBaseIds.length > 0;
  const selectedBase = airportsById[selectedBaseAirportId] ?? airportsById[game.primaryBaseAirport] ?? airportsById[ownedBaseIds[0]];

  const filteredModels = aircraftModels
    .filter((model) => manufacturer === "all" || model.manufacturer === manufacturer)
    .filter((model) => routeType === "all" || model.recommendedRouteType === routeType)
    .sort((a, b) => {
      if (sortMode === "range") return b.rangeKm - a.rangeKm;
      if (sortMode === "capacity") return b.maxPassengerSeats - a.maxPassengerSeats;
      return a.estimatedPriceGBP - b.estimatedPriceGBP;
    });
  const familyOrder = Array.from(new Map(filteredModels.map((model) => [model.family, model.familyDisplayName])).entries());
  const grouped = familyOrder
    .map(([family, familyDisplayName]) => ({
      family,
      familyDisplayName,
      manufacturer: filteredModels.find((model) => model.family === family)?.manufacturer ?? "",
      models: filteredModels.filter((model) => model.family === family)
    }))
    .filter((group) => group.models.length > 0);

  useEffect(() => {
    if (!purchaseToast) return;
    const timer = window.setTimeout(() => setPurchaseToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [purchaseToast]);

  useEffect(() => {
    if (!game) return;
    const bases = game.baseAirports ?? [game.primaryBaseAirport ?? game.baseAirportId];
    if (!selectedBaseAirportId || !bases.includes(selectedBaseAirportId)) {
      setSelectedBaseAirportId(game.primaryBaseAirport ?? bases[0] ?? "");
    }
  }, [game, selectedBaseAirportId]);

  function selectModel(model: AircraftModel) {
    setSelectedModelId(model.id);
    setLayout(getDefaultCabinConfig(model));
    setRegistration(createRegistration(game?.fleet.length ?? 0));
  }

  function resetLayout() {
    setLayout(getDefaultCabinConfig(selectedModel));
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
            <Select label={t("market.manufacturer")} value={manufacturer} onChange={setManufacturer} options={["all", ...manufacturers]} />
            <Select label="Route type" value={routeType} onChange={(value) => setRouteType(value as RouteFilter)} options={["all", "short-haul", "medium-haul", "long-haul"]} />
            <Select label="Sort" value={sortMode} onChange={(value) => setSortMode(value as SortMode)} options={["price", "range", "capacity"]} />
          </div>
          {grouped.map((group) => (
            <section key={group.family} className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-xs font-black uppercase tracking-normal text-slate-500">{t("market.aircraftFamily")}</p>
                  <h3 className="font-black text-ink">{group.familyDisplayName}</h3>
                </div>
                <span className="rounded-md bg-runway px-2 py-1 text-xs font-bold text-jet">
                  {group.manufacturer} - {group.models.length} {group.models.length === 1 ? "model" : "models"}
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {group.models.map((model) => (
                  <article
                    key={model.id}
                    className={`rounded-lg border p-4 transition hover:-translate-y-0.5 hover:shadow-soft ${
                      model.id === selectedModelId ? "border-coral bg-coral/5" : "border-slate-200"
                    }`}
                  >
                    <AircraftImage model={model} />
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
        <div className="h-fit rounded-lg border border-slate-200 bg-white p-4 shadow-soft xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{selectedModel.manufacturer}</p>
              <h3 className="font-black text-ink">{selectedModel.model} cabin</h3>
            </div>
            <button type="button" onClick={resetLayout} className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-bold text-jet">
              <RotateCcw size={16} />
              {t("fleet.suggested")}
            </button>
          </div>
          <AircraftImage model={selectedModel} className="mt-4 h-32" />
          <label className="mt-4 block">
            <span className="text-sm font-semibold text-slate-700">{t("fleet.registration")}</span>
            <input value={registration} onChange={(event) => setRegistration(event.target.value.toUpperCase())} maxLength={12} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-jet focus:ring-2 focus:ring-jet/20" />
          </label>
          {registrationError ? <p className="mt-2 rounded-md bg-coral/10 px-3 py-2 text-sm font-semibold text-coral">{registrationError}</p> : null}
          <label className="mt-4 block">
            <span className="text-sm font-semibold text-slate-700">{t("market.parkAircraftAt")}</span>
            <select
              value={selectedBaseAirportId}
              onChange={(event) => setSelectedBaseAirportId(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 font-bold text-jet outline-none focus:border-jet focus:ring-2 focus:ring-jet/20"
            >
              {!hasOwnedBase ? <option value="">{t("market.needBaseBeforeAircraft")}</option> : null}
              {ownedBaseIds.map((airportId) => {
                const airport = airportsById[airportId];
                return airport ? (
                  <option key={airportId} value={airportId}>
                    {airport.iata} {airport.city}
                  </option>
                ) : null;
              })}
            </select>
          </label>
          {!hasOwnedBase ? <p className="mt-2 rounded-md bg-coral/10 px-3 py-2 text-sm font-semibold text-coral">{t("market.needBaseBeforeAircraft")}</p> : null}
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <Spec label={t("fleet.firstClass")} value={String(layout.first)} />
            <Spec label={t("fleet.business")} value={String(layout.business)} />
            <Spec label={t("fleet.premiumEconomy")} value={String(layout.premiumEconomy)} />
            <Spec label={t("fleet.economy")} value={String(layout.economy)} />
            <Spec label={t("fleet.cargo")} value={`${layout.cargoTons.toFixed(1)} t`} />
            <Spec label="Seat space" value={`${validation.seatEquivalent}/${selectedModel.maxPassengerSeats}`} />
          </div>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setIsSeatConfigOpen(true)}
              className="w-full rounded-md bg-jet px-3 py-3 text-sm font-black text-white transition hover:bg-jet/90"
            >
              Seat Configuration
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <Spec label={t("fleet.purchasePrice")} value={formatGBP.format(validation.purchasePriceGBP)} />
            <Spec label={t("fleet.routeFit")} value={routeSuitabilityHints(selectedModel, layout)[0]} />
          </div>
          {validation.errors.length > 0 ? (
            <div className="mt-3 space-y-2">
              {validation.errors.map((error) => (
                <p key={error} className="rounded-md bg-coral/10 px-3 py-2 text-sm font-bold text-coral">{error}</p>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => {
              const result = buyAircraft(selectedModel.id, layout, registration, selectedBaseAirportId);
              if (!result.ok || !result.aircraft) return;
              setPurchaseToast({
                modelLabel: `${selectedModel.manufacturer} ${selectedModel.model}`,
                registration: result.aircraft.registration,
                baseIata: selectedBase?.iata ?? selectedBaseAirportId.toUpperCase()
              });
              setRegistration(createRegistration(game.fleet.length + 1));
            }}
            disabled={!validation.isValid || !affordable || Boolean(registrationError) || !hasOwnedBase || !selectedBaseAirportId}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-coral px-3 py-3 font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <ShoppingCart size={18} />
            {t("fleet.buyAircraft")} {formatGBP.format(validation.purchasePriceGBP)}
          </button>
        </div>
      </section>
      {isSeatConfigOpen ? (
        <SeatConfigurationModal
          model={selectedModel}
          layout={layout}
          registration={registration}
          onRegistrationChange={setRegistration}
          onLayoutChange={setLayout}
          onCancel={() => setIsSeatConfigOpen(false)}
          onConfirm={(nextLayout) => {
            setLayout(nextLayout);
            setIsSeatConfigOpen(false);
          }}
        />
      ) : null}
      {purchaseToast ? <PurchaseToast toast={purchaseToast} onClose={() => setPurchaseToast(null)} /> : null}
    </div>
  );
}

function PurchaseToast({
  toast,
  onClose
}: {
  toast: { modelLabel: string; registration: string; baseIata: string };
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="fixed bottom-5 right-5 z-[6500] w-[min(360px,calc(100vw-2rem))] rounded-lg border border-mint/30 bg-white p-4 shadow-soft animate-slide-in">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 shrink-0 text-mint" size={22} />
        <div className="min-w-0 flex-1">
          <p className="font-black text-ink">{t("market.purchaseSuccessTitle")}</p>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            {toast.modelLabel} - {toast.registration} {t("market.purchaseParkedAt")} {toast.baseIata}.
          </p>
        </div>
        <button type="button" onClick={onClose} title="Close" className="rounded-md p-1 text-slate-500 hover:bg-runway">
          <X size={16} />
        </button>
      </div>
    </div>
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
