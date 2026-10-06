"use client";

import { Check, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "@/i18n";
import { routePricingFromDefaults } from "@/lib/economy";
import { formatGBP } from "@/lib/format";
import { priceDemandMultiplier } from "@/lib/marketDemand";
import { forecastOperations } from "@/lib/operationForecast";
import { routeBusiness } from "@/lib/routeBusiness";
import { formatGameDate } from "@/lib/time";
import { useGameStore } from "@/store/gameStore";
import type { GameState, Route, RoutePricing } from "@/types/game";

const fareKeys = ["economy", "premiumEconomy", "business", "first", "cargo"] as const;
export function RouteBusinessPanel({ route, game }: { route: Route; game: GameState }) {
  const { t } = useTranslation();
  const update = useGameStore((state) => state.updateRoutePricing);
  const [draft, setDraft] = useState<RoutePricing | null>(null);
  const [forecast, setForecast] = useState<ReturnType<typeof forecastOperations> | null>(null);
  const [previewFare, setPreviewFare] = useState<keyof RoutePricing>("economy");
  const business = routeBusiness(route, game);
  const reference = route.recommendedPricing ?? routePricingFromDefaults(route);
  const pricing = draft ?? route.pricing ?? reference;
  const valid = fareKeys.every((key) => Number.isFinite(pricing[key]) && pricing[key] >= 0);
  const projected = forecast?.flights.filter((event) => event.entry.routeId === route.id) ?? [];
  const passengerCapacity = projected.reduce((sum, event) => sum + event.values.passengerCapacity, 0);
  const points = Array.from({ length: 81 }, (_, index) => {
    const ratio = index * 0.05;
    return `${30 + ratio * 80},${175 - priceDemandMultiplier(100, ratio * 100, previewFare, route.distanceKm) * 90}`;
  }).join(" ");
  const ratio = pricing[previewFare] / Math.max(1, reference[previewFare]);
  return <div className="space-y-5">
    <section className="border-y border-slate-200 py-4">
      <div className="flex flex-wrap justify-between gap-2"><h4 className="font-bold">{t("market.actual")}</h4><span className="text-sm font-bold text-jet">{t(`market.${business.status}`)}</span></div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <Metric label={t("market.profit")} value={business.actual ? formatGBP.format(business.actual.profit) : "--"} />
        <Metric label={t("market.load")} value={business.loadFactor === null ? "--" : `${Math.round(business.loadFactor * 100)}%`} />
        <Metric label={t("market.paxRevenue")} value={business.actual?.observedFlights ? formatGBP.format(business.actual.passengerRevenue ?? 0) : "--"} />
        <Metric label={t("market.cargoRevenue")} value={business.actual?.observedFlights ? formatGBP.format(business.actual.cargoRevenue ?? 0) : "--"} />
        <Metric label={t("market.passengers")} value={business.actual?.observedFlights ? String(business.actual.passengers ?? 0) : "--"} />
        <Metric label={t("market.cargo")} value={business.actual?.observedFlights ? `${(business.actual.cargoTons ?? 0).toFixed(1)} t` : "--"} />
      </dl>
      <ul className="mt-3 space-y-1 text-sm text-slate-600">{business.reasons.map((reason) => <li key={reason}>{t(`market.reason.${reason}`)}</li>)}</ul>
    </section>
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-bold">{t("market.forecast")}</h4>
        <button type="button" onClick={() => setForecast(forecastOperations({ ...game, routes: game.routes.map((item) => item.id === route.id && valid ? { ...item, pricing } : item) }))}
          className="flex min-h-10 items-center gap-2 rounded-md bg-slate-100 px-3 text-sm font-bold"><RefreshCw size={16} />{t("market.calculate")}</button></div>
      {forecast && <><p className="mt-2 text-xs text-slate-500">{t("market.asOf")}: {formatGameDate(forecast.asOfGameTimeMs)}</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <Metric label={t("market.profit")} value={formatGBP.format(projected.reduce((sum, event) => sum + event.entry.profit, 0))} />
          <Metric label={t("market.load")} value={passengerCapacity ? `${Math.round(projected.reduce((sum, event) => sum + event.entry.passengerCount, 0) / passengerCapacity * 100)}%` : "--"} />
          <Metric label={t("market.flights")} value={String(projected.length)} />
          <Metric label={t("market.cargo")} value={`${projected.reduce((sum, event) => sum + event.entry.cargoTons, 0).toFixed(1)} t`} />
        </dl></>}
    </section>
    <section className="border-t border-slate-200 pt-4">
      <h4 className="font-bold">{t("market.pricing")}</h4>
      <div className="mt-3 grid grid-cols-2 gap-3">{fareKeys.map((key) => <label key={key} className="min-w-0 text-xs font-bold text-slate-600">{t(`market.fare.${key}`)} (GBP{key === "cargo" ? "/t" : ""})
        <input type="number" min={0} step={1} value={Number.isFinite(pricing[key]) ? pricing[key] : ""}
          onChange={(event) => { setDraft({ ...pricing, [key]: event.target.valueAsNumber }); setForecast(null); }}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm text-ink" />
        <span className="mt-1 block font-normal">{t("market.reference")}: {formatGBP.format(reference[key])}</span>
      </label>)}</div>
      <button type="button" disabled={!valid || !draft} onClick={() => { update(route.id, pricing); setDraft(null); setForecast(null); }}
        className="mt-3 flex min-h-10 items-center gap-2 rounded-md bg-jet px-3 text-sm font-bold text-white disabled:opacity-40"><Check size={16} />{t("market.apply")}</button>
    </section>
    <section className="border-t border-slate-200 pt-4">
      <label className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold">{t("market.priceCurve")}
        <select value={previewFare} onChange={(event) => setPreviewFare(event.target.value as keyof RoutePricing)} className="rounded-md border border-slate-300 p-2">
          {fareKeys.map((key) => <option key={key} value={key}>{t(`market.fare.${key}`)}</option>)}
        </select></label>
      <svg viewBox="0 0 370 215" role="img" aria-label={t("market.priceCurve")} className="mt-3 block aspect-[370/215] w-full bg-white">
        <path d="M30 20V175H355" fill="none" stroke="#94a3b8" />
        {[0, 1, 2, 3, 4].map((value) => <text key={value} x={30 + value * 80} y={195} textAnchor="middle" fontSize={11} fill="#475569">{value}x</text>)}
        <text x={32} y={15} fontSize={11} fill="#475569">160%</text><text x={7} y={177} fontSize={11} fill="#475569">0</text>
        <polyline points={points} fill="none" stroke="#137d77" strokeWidth={3} />
        {valid && ratio <= 4 && <circle cx={30 + ratio * 80} cy={175 - priceDemandMultiplier(reference[previewFare], pricing[previewFare], previewFare, route.distanceKm) * 90} r={5} fill="#ea6546" />}
      </svg>
      <p className="text-sm text-slate-600">{t("market.demand")}: {valid ? `${Math.round(priceDemandMultiplier(reference[previewFare], pricing[previewFare], previewFare, route.distanceKm) * 100)}%` : "--"}</p>
    </section>
  </div>;
}
function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className="break-words font-bold text-ink">{value}</dd></div>;
}
