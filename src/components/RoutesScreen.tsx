"use client";

import { useEffect, useMemo, useState } from "react";
import { aircraftById } from "@/data/aircraft";
import { airports, airportsById } from "@/data/airports";
import { useTranslation } from "@/i18n";
import { routeSuitabilityHints } from "@/lib/cabin";
import { estimateDemand } from "@/lib/demand";
import {
  estimateCargoRatePerTon,
  estimateExpectedFlightProfit,
  estimatePriceAdjustedDemand,
  estimateRouteOpeningCost,
  estimateTicketPrices,
  estimateWeeklyScheduleFinancials,
  priceWarning,
  routePricingFromDefaults
} from "@/lib/economy";
import { formatGBP, formatNumber } from "@/lib/format";
import { distanceKm } from "@/lib/geo";
import { calculateRemainingDemand, type RemainingDemandSummary } from "@/lib/routeDemand";
import { formatDuration } from "@/lib/time";
import { useGameStore } from "@/store/gameStore";
import type { AircraftModel, CabinDemand, CabinLayout, GameState, Route, RoutePricing } from "@/types/game";

export function RoutesScreen() {
  const { t } = useTranslation();
  const game = useGameStore((state) => state.game);
  const openRoute = useGameStore((state) => state.openRoute);
  const updateRoutePricing = useGameStore((state) => state.updateRoutePricing);
  const [originAirportId, setOriginAirportId] = useState("");
  const [destinationAirportId, setDestinationAirportId] = useState("jfk");
  const [pricing, setPricing] = useState<RoutePricing | null>(null);
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [editingPricing, setEditingPricing] = useState<RoutePricing | null>(null);
  const [pricingMessage, setPricingMessage] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (!game) return null;
    const origin = airportsById[originAirportId || game.baseAirportId];
    const destination = airportsById[destinationAirportId];
    if (!origin || !destination || origin.id === destination.id) return null;
    const distance = distanceKm(origin, destination);
    const estimatedTicketPrices = estimateTicketPrices(distance);
    const estimatedCargoRatePerTon = estimateCargoRatePerTon(distance);
    const recommendedPricing = { ...estimatedTicketPrices, cargo: estimatedCargoRatePerTon };
    const route: Route = {
      id: `${origin.id}-${destination.id}`,
      originAirportId: origin.id,
      destinationAirportId: destination.id,
      distanceKm: distance,
      estimatedDemand: estimateDemand(origin, destination, distance),
      estimatedTicketPrices,
      estimatedCargoRatePerTon,
      recommendedPricing,
      pricing: pricing ?? recommendedPricing,
      isOpen: false
    };
    const capableAircraft = game.fleet
      .map((aircraft) => ({ aircraft, model: aircraftById[aircraft.modelId] }))
      .filter(({ model }) => model && model.rangeKm >= distance);
    const estimates = capableAircraft.map(({ aircraft, model }) => ({
      aircraft,
      model,
      financials: estimateExpectedFlightProfit(route, model, aircraft.cabinLayout)
    }));
    const bestEstimate = estimates.sort((a, b) => b.financials.profit - a.financials.profit)[0] ?? null;
    const bestHints = capableAircraft[0]
      ? routeSuitabilityHints(capableAircraft[0].model, capableAircraft[0].aircraft.cabinLayout, route)
      : ["Aircraft range insufficient"];
    const adjustedDemand = estimatePriceAdjustedDemand(route);
    const warnings = priceWarnings(route);
    return { route, cost: estimateRouteOpeningCost(distance), capableAircraft, bestEstimate, bestHints, adjustedDemand, warnings };
  }, [destinationAirportId, game, originAirportId, pricing]);

  useEffect(() => {
    if (!game) return;
    const origin = airportsById[originAirportId || game.baseAirportId];
    const destination = airportsById[destinationAirportId];
    if (!origin || !destination || origin.id === destination.id) return;
    const distance = distanceKm(origin, destination);
    const estimatedTicketPrices = estimateTicketPrices(distance);
    setPricing({ ...estimatedTicketPrices, cargo: estimateCargoRatePerTon(distance) });
  }, [destinationAirportId, game?.baseAirportId, originAirportId]);

  if (!game) return null;
  const base = airportsById[game.baseAirportId];
  const originOptions = game.expandedAirportIds.map((airportId) => airportsById[airportId]).filter(Boolean);
  const currentOriginId = originAirportId || game.baseAirportId;
  const destinations = airports.filter((airport) => airport.id !== currentOriginId);
  const editingRoute = editingRouteId ? game.routes.find((route) => route.id === editingRouteId) ?? null : null;
  const editedRoute =
    editingRoute && editingPricing
      ? {
          ...editingRoute,
          pricing: editingPricing
        }
      : null;
  const editingPreview = editedRoute ? buildRoutePricingPreview(editedRoute, game) : null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-black text-ink">{t("routes.title")}</h2>
        <p className="text-slate-600">Open routes from {base.iata} or any airport already in your network.</p>
      </div>

      <section className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <h3 className="font-bold text-ink">{t("routes.openRoute")}</h3>
          <label className="mt-4 block">
            <span className="text-sm font-semibold text-slate-700">Network airport</span>
            <select
              value={currentOriginId}
              onChange={(event) => setOriginAirportId(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-3 outline-none focus:border-jet focus:ring-2 focus:ring-jet/20"
            >
              {originOptions.map((airport) => (
                <option key={airport.id} value={airport.id}>
                  {airport.iata} - {airport.city}, {airport.country}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-4 block">
            <span className="text-sm font-semibold text-slate-700">Destination</span>
            <select
              value={destinationAirportId}
              onChange={(event) => setDestinationAirportId(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-3 outline-none focus:border-jet focus:ring-2 focus:ring-jet/20"
            >
              {destinations.map((airport) => (
                <option key={airport.id} value={airport.id}>
                  {airport.iata} - {airport.city}, {airport.country}
                </option>
              ))}
            </select>
          </label>
          {preview ? (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Info label="Distance" value={`${formatNumber.format(preview.route.distanceKm)} km`} />
                <Info label="Opening cost" value={formatGBP.format(preview.cost)} />
                <Info label="Capable aircraft" value={String(preview.capableAircraft.length)} />
                <Info label="Best revenue/flight" value={preview.bestEstimate ? formatGBP.format(preview.bestEstimate.financials.revenue) : "N/A"} />
                <Info label="Best cost/flight" value={preview.bestEstimate ? formatGBP.format(preview.bestEstimate.financials.cost) : "N/A"} />
                <Info label="Best profit/flight" value={preview.bestEstimate ? formatGBP.format(preview.bestEstimate.financials.profit) : "N/A"} />
                <Info label="Real flight time" value={formatDuration((preview.route.distanceKm / 850) * 60 * 60 * 1000)} />
                <Info label="At current speed" value={formatDuration(((preview.route.distanceKm / 850) * 60 * 60 * 1000) / game.timeMultiplier)} />
              </div>
              <Demand route={preview.route} />
              <PricingEditor
                route={preview.route}
                pricing={pricing ?? routePricingFromDefaults(preview.route)}
                capacityHint={preview.bestEstimate?.aircraft.cabinLayout}
                recommendedButtonLabel={t("routes.setRecommendedPrices")}
                onChange={setPricing}
                onSetRecommended={() => {
                  setPricing(recommendedPricingForRoute(preview.route));
                  setPricingMessage(t("routes.recommendedPricesApplied"));
                }}
              />
              {pricingMessage ? <p className="rounded-md bg-mint/10 px-3 py-2 text-sm font-bold text-mint">{pricingMessage}</p> : null}
              <div className="grid grid-cols-2 gap-2">
                <Info label="Weekly first" value={String(preview.adjustedDemand.first)} />
                <Info label="Weekly business" value={String(preview.adjustedDemand.business)} />
                <Info label="Weekly premium" value={String(preview.adjustedDemand.premiumEconomy)} />
                <Info label="Weekly economy" value={String(preview.adjustedDemand.economy)} />
                <Info label="Weekly cargo" value={`${preview.adjustedDemand.cargoTons.toFixed(1)} t`} />
              </div>
              {preview.warnings.length > 0 ? (
                <div className="space-y-2">
                  {preview.warnings.map((warning) => (
                    <p key={warning} className="rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
                      {warning}
                    </p>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {preview.bestHints.map((hint) => (
                  <span key={hint} className="rounded-md bg-mint/10 px-2 py-1 text-xs font-bold text-jet">
                    {hint}
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={() => openRoute(currentOriginId, destinationAirportId, pricing ?? routePricingFromDefaults(preview.route))}
                className="w-full rounded-md bg-coral px-4 py-3 font-bold text-white hover:bg-coral/90"
              >
                {t("routes.openRoute")}
              </button>
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <h3 className="mb-3 font-bold text-ink">Open routes</h3>
          <div className="space-y-3">
            {game.routes.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-300 bg-runway px-4 py-8 text-center text-sm font-semibold text-slate-500">
                No routes open yet.
              </div>
            ) : (
              game.routes.map((route) => {
                const summary = calculateRemainingDemand(route.id, game);
                const routePreview = buildRoutePricingPreview(route, game);
                return (
                  <RouteCard
                    key={route.id}
                    route={route}
                    summary={summary}
                    preview={routePreview}
                    onEdit={() => {
                      setEditingRouteId(route.id);
                      setEditingPricing(route.pricing ?? routePricingFromDefaults(route));
                    }}
                  />
                );
              })
            )}
          </div>
        </div>
      </section>

      {editedRoute && editingPricing && editingPreview ? (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-ink/45 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-soft animate-modal-in">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-normal text-coral">Edit Pricing</p>
                <h3 className="text-xl font-black text-ink">
                  {airportsById[editedRoute.originAirportId].iata} - {airportsById[editedRoute.destinationAirportId].iata}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingRouteId(null);
                  setEditingPricing(null);
                }}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-runway"
              >
                Close
              </button>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.1fr]">
              <PricingEditor
                route={editedRoute}
                pricing={editingPricing}
                capacityHint={editingPreview.capacityHint}
                recommendedButtonLabel={t("routes.setRecommendedPrices")}
                onChange={setEditingPricing}
                onSetRecommended={() => {
                  setEditingPricing(recommendedPricingForRoute(editedRoute));
                  setPricingMessage(t("routes.recommendedPricesApplied"));
                }}
              />
              {pricingMessage ? <p className="rounded-md bg-mint/10 px-3 py-2 text-sm font-bold text-mint">{pricingMessage}</p> : null}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Info label="Estimated load factor" value={`${editingPreview.loadFactor}%`} />
                  <Info label="Revenue per flight" value={formatGBP.format(editingPreview.revenuePerFlight)} />
                  <Info label="Operating cost per flight" value={formatGBP.format(editingPreview.costPerFlight)} />
                  <Info label="Profit per flight" value={formatGBP.format(editingPreview.profitPerFlight)} />
                  <Info label="Weekly revenue" value={formatGBP.format(editingPreview.weeklyRevenue)} />
                  <Info label="Weekly profit" value={formatGBP.format(editingPreview.weeklyProfit)} />
                </div>
                <div className="rounded-md border border-slate-200 p-3">
                  <p className="mb-2 text-sm font-bold text-ink">Weekly Demand</p>
                  <DemandMiniGrid demand={editingPreview.adjustedDemand} />
                </div>
                {editingPreview.warnings.length > 0 ? (
                  <div className="space-y-2">
                    {editingPreview.warnings.map((warning) => (
                      <p key={warning} className="rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
                        {warning}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingRouteId(null);
                  setEditingPricing(null);
                }}
                className="rounded-md border border-slate-200 px-4 py-2 font-bold text-slate-600 transition hover:bg-runway"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  updateRoutePricing(editedRoute.id, editingPricing);
                  setEditingRouteId(null);
                  setEditingPricing(null);
                }}
                className="rounded-md bg-coral px-4 py-2 font-bold text-white transition hover:bg-coral/90"
              >
                Save Pricing
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Demand({ route }: { route: Route }) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <p className="mb-2 text-sm font-bold text-ink">Weekly cabin demand</p>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <Info label="First" value={String(route.estimatedDemand.first)} />
        <Info label="Business" value={String(route.estimatedDemand.business)} />
        <Info label="Premium" value={String(route.estimatedDemand.premiumEconomy)} />
        <Info label="Economy" value={String(route.estimatedDemand.economy)} />
        <Info label="Cargo" value={`${route.estimatedDemand.cargoTons.toFixed(1)} t`} />
        <Info label="Cargo rate" value={formatGBP.format((route.pricing ?? routePricingFromDefaults(route)).cargo)} />
      </div>
    </div>
  );
}

function RouteCard({
  route,
  summary,
  preview,
  onEdit
}: {
  route: Route;
  summary: RemainingDemandSummary | null;
  preview: RoutePricingPreview;
  onEdit: () => void;
}) {
  const pricing = route.pricing ?? routePricingFromDefaults(route);
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-black text-ink">
            {airportsById[route.originAirportId].iata} - {airportsById[route.destinationAirportId].iata}
          </h4>
          <p className="text-sm text-slate-500">
            {formatNumber.format(route.distanceKm)} km · Economy {formatGBP.format(pricing.economy)} · Cargo {formatGBP.format(pricing.cargo)}/t
          </p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md bg-jet px-3 py-2 text-xs font-black text-white transition hover:bg-jet/90"
        >
          Edit Pricing
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
        <Info label="Load factor" value={`${preview.loadFactor}%`} />
        <Info label="Profit/flight" value={formatGBP.format(preview.profitPerFlight)} />
        <Info label="Weekly revenue" value={formatGBP.format(preview.weeklyRevenue)} />
        <Info label="Weekly profit" value={formatGBP.format(preview.weeklyProfit)} />
      </div>
      {summary ? (
        <div className="mt-4 space-y-3">
          <DemandBar label="First" total={summary.totalDemand.first} used={summary.usedDemand.first} remaining={summary.remainingDemand.first} />
          <DemandBar label="Business" total={summary.totalDemand.business} used={summary.usedDemand.business} remaining={summary.remainingDemand.business} />
          <DemandBar label="Premium" total={summary.totalDemand.premiumEconomy} used={summary.usedDemand.premiumEconomy} remaining={summary.remainingDemand.premiumEconomy} />
          <DemandBar label="Economy" total={summary.totalDemand.economy} used={summary.usedDemand.economy} remaining={summary.remainingDemand.economy} />
          <DemandBar label="Cargo" total={summary.totalDemand.cargoTons} used={summary.usedDemand.cargoTons} remaining={summary.remainingDemand.cargoTons} suffix=" t" />
          {summary.warnings.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {summary.warnings.map((warning) => (
                <span key={warning} className="rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">
                  {warning}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function DemandBar({
  label,
  total,
  used,
  remaining,
  suffix = ""
}: {
  label: string;
  total: number;
  used: number;
  remaining: number;
  suffix?: string;
}) {
  const safeTotal = Math.max(total, 1);
  const usedPercent = Math.min((used / safeTotal) * 100, 100);
  const oversupply = Math.max(used - total, 0);
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-black text-ink">{label}</span>
        <span className="font-semibold text-slate-500">
          Weekly Demand {formatDemand(total, suffix)} · Weekly Scheduled Capacity {formatDemand(used, suffix)} · Weekly Remaining Demand {formatDemand(remaining, suffix)}
          {oversupply > 0 ? ` · Oversupply ${formatDemand(oversupply, suffix)}` : ""}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-runway">
        <div
          className={`h-full rounded-full demand-bar-fill ${oversupply > 0 ? "bg-coral" : "bg-mint"}`}
          style={{ width: `${usedPercent}%` }}
        />
      </div>
    </div>
  );
}

function DemandMiniGrid({ demand }: { demand: CabinDemand }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-sm">
      <Info label="First" value={String(demand.first)} />
      <Info label="Business" value={String(demand.business)} />
      <Info label="Premium" value={String(demand.premiumEconomy)} />
      <Info label="Economy" value={String(demand.economy)} />
      <Info label="Cargo" value={`${demand.cargoTons.toFixed(1)} t`} />
    </div>
  );
}

function PricingEditor({
  route,
  pricing,
  capacityHint,
  recommendedButtonLabel,
  onSetRecommended,
  onChange
}: {
  route: Route;
  pricing: RoutePricing;
  capacityHint?: CabinLayout;
  recommendedButtonLabel: string;
  onSetRecommended?: () => void;
  onChange: (pricing: RoutePricing) => void;
}) {
  const recommended = route.recommendedPricing ?? routePricingFromDefaults(route);
  const pricedRoute = { ...route, pricing };
  const rows = [
    ["First Class", "first"],
    ["Business Class", "business"],
    ["Premium Economy", "premiumEconomy"],
    ["Economy", "economy"],
    ["Cargo / tonne", "cargo"]
  ] as const;
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-ink">Ticket Pricing</p>
        {onSetRecommended ? (
          <button
            type="button"
            onClick={onSetRecommended}
            className="rounded-md bg-mint px-3 py-1.5 text-xs font-black text-white transition hover:bg-mint/90"
          >
            {recommendedButtonLabel}
          </button>
        ) : null}
      </div>
      <div className="space-y-2">
        {rows.map(([label, key]) => (
          <label key={key} className="grid grid-cols-[1fr_90px_110px] items-center gap-2 text-sm">
            <span className="font-semibold text-slate-700">{label}</span>
            <span className="text-xs text-slate-500">{formatGBP.format(recommended[key])}</span>
            <input
              type="number"
              min="1"
              value={pricing[key]}
              onChange={(event) => onChange({ ...pricing, [key]: Math.max(1, Number(event.target.value)) })}
              className="rounded-md border border-slate-300 px-2 py-1 text-right font-bold outline-none focus:border-jet focus:ring-2 focus:ring-jet/20"
            />
          </label>
        ))}
      </div>
      <RevenueCurveSummary route={pricedRoute} pricing={pricing} capacityHint={capacityHint} />
    </div>
  );
}

function RevenueCurveSummary({
  route,
  pricing,
  capacityHint
}: {
  route: Route;
  pricing: RoutePricing;
  capacityHint?: CabinLayout;
}) {
  const recommended = route.recommendedPricing ?? routePricingFromDefaults(route);
  const adjustedDemand = estimatePriceAdjustedDemand(route);
  const rows = [
    { label: "First", priceKey: "first", demandKey: "first", capacity: capacityHint?.first, suffix: "" },
    { label: "Business", priceKey: "business", demandKey: "business", capacity: capacityHint?.business, suffix: "" },
    { label: "Premium", priceKey: "premiumEconomy", demandKey: "premiumEconomy", capacity: capacityHint?.premiumEconomy, suffix: "" },
    { label: "Economy", priceKey: "economy", demandKey: "economy", capacity: capacityHint?.economy, suffix: "" },
    { label: "Cargo", priceKey: "cargo", demandKey: "cargoTons", capacity: capacityHint?.cargoTons, suffix: " t" }
  ] as const;

  return (
    <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
      <div className="bg-slate-50 px-3 py-2 text-xs font-black uppercase tracking-normal text-slate-500">Revenue Curve</div>
      <div className="divide-y divide-slate-100">
        {rows.map((row) => {
          const demand = adjustedDemand[row.demandKey];
          const sold = Math.min(row.capacity ?? demand, demand);
          const revenue = sold * pricing[row.priceKey];
          const ratio = pricing[row.priceKey] / Math.max(1, recommended[row.priceKey]);
          return (
            <div key={row.priceKey} className="grid grid-cols-2 gap-2 px-3 py-2 text-xs md:grid-cols-6">
              <span className="font-black text-ink">{row.label}</span>
              <span>Rec {formatGBP.format(recommended[row.priceKey])}</span>
              <span>Now {formatGBP.format(pricing[row.priceKey])}</span>
              <span>Ratio {ratio.toFixed(2)}x</span>
              <span>Demand {formatDemand(demand, row.suffix)}</span>
              <span>Sold {formatDemand(sold, row.suffix)} / {formatGBP.format(revenue)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function priceWarnings(route: Route) {
  const recommended = route.recommendedPricing ?? routePricingFromDefaults(route);
  const pricing = route.pricing ?? recommended;
  return Array.from(
    new Set(
      (Object.keys(pricing) as (keyof RoutePricing)[])
        .map((key) => priceWarning(recommended[key], pricing[key]))
        .filter(Boolean) as string[]
    )
  );
}

function recommendedPricingForRoute(route: Route): RoutePricing {
  return route.recommendedPricing ?? routePricingFromDefaults(route);
}

type RoutePricingPreview = {
  adjustedDemand: CabinDemand;
  capacityHint?: CabinLayout;
  modelHint?: AircraftModel;
  loadFactor: number;
  revenuePerFlight: number;
  costPerFlight: number;
  profitPerFlight: number;
  weeklyRevenue: number;
  weeklyProfit: number;
  warnings: string[];
};

function buildRoutePricingPreview(route: Route, game: GameState): RoutePricingPreview {
  const adjustedDemand = estimatePriceAdjustedDemand(route);
  const capable = game.fleet
    .map((aircraft) => ({ aircraft, model: aircraftById[aircraft.modelId] }))
    .filter(({ model }) => model && model.rangeKm >= route.distanceKm);
  const bestEstimate = capable
    .map(({ aircraft, model }) => ({ aircraft, model, financials: estimateExpectedFlightProfit(route, model, aircraft.cabinLayout) }))
    .sort((a, b) => b.financials.profit - a.financials.profit)[0];
  const bestAircraftSeats = bestEstimate
    ? bestEstimate.aircraft.cabinLayout.first +
      bestEstimate.aircraft.cabinLayout.business +
      bestEstimate.aircraft.cabinLayout.premiumEconomy +
      bestEstimate.aircraft.cabinLayout.economy
    : 0;
  const weekly = game.fleet.reduce(
    (totals, aircraft) => {
      const model = aircraftById[aircraft.modelId];
      if (!model) return totals;
      aircraft.weeklySchedules
        .filter((schedule) => schedule.routeId === route.id)
        .forEach((schedule) => {
          const financials = estimateWeeklyScheduleFinancials(schedule, route, model, aircraft);
          totals.revenue += financials.weeklyRevenue;
          totals.profit += financials.weeklyProfit;
          totals.flights += financials.weeklyFlights;
        });
      return totals;
    },
    { revenue: 0, profit: 0, flights: 0 }
  );
  const revenuePerFlight = bestEstimate?.financials.revenue ?? 0;
  const costPerFlight = bestEstimate?.financials.cost ?? 0;
  const profitPerFlight = bestEstimate?.financials.profit ?? 0;

  return {
    adjustedDemand,
    capacityHint: bestEstimate?.aircraft.cabinLayout,
    modelHint: bestEstimate?.model,
    loadFactor: bestEstimate && bestAircraftSeats > 0 ? Math.min(100, Math.round((bestEstimate.financials.passengerCount / bestAircraftSeats) * 100)) : 0,
    revenuePerFlight,
    costPerFlight,
    profitPerFlight,
    weeklyRevenue: weekly.flights > 0 ? weekly.revenue : revenuePerFlight,
    weeklyProfit: weekly.flights > 0 ? weekly.profit : profitPerFlight,
    warnings: priceWarnings(route)
  };
}

function formatDemand(value: number, suffix: string) {
  return `${suffix ? value.toFixed(1) : formatNumber.format(Math.round(value))}${suffix}`;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-runway px-3 py-2">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="font-bold text-ink">{value}</p>
    </div>
  );
}
