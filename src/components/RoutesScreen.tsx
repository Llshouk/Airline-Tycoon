"use client";

import { Check, Eye } from "lucide-react";
import { useMemo, useState } from "react";
import { RouteBusinessPanel } from "@/components/RouteBusinessPanel";
import { RouteEvaluationCard } from "@/components/RouteEvaluationCard";
import { airportsById } from "@/data/airports";
import { useTranslation } from "@/i18n";
import { routePricingFromDefaults } from "@/lib/economy";
import { recentOperatingTotals } from "@/lib/financialReports";
import { formatGBP, formatNumber } from "@/lib/format";
import { calculateRemainingDemand } from "@/lib/routeDemand";
import { evaluateRoute } from "@/lib/routeEvaluation";
import { formatScheduleFlightNumbers } from "@/lib/schedule";
import { useGameStore } from "@/store/gameStore";
import type { CabinDemand, GameState, Route } from "@/types/game";

type Sort = "distance" | "profit" | "revenue";
export function RoutesScreen({ onSchedule }: { onSchedule?: () => void }) {
  const { t } = useTranslation();
  const game = useGameStore((state) => state.game);
  const batchPricing = useGameStore((state) => state.batchRoutePricing);
  const [baseFilter, setBaseFilter] = useState("all");
  const [sort, setSort] = useState<Sort>("profit");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [percent, setPercent] = useState(100);
  const [batchPreview, setBatchPreview] = useState(false);
  const [applied, setApplied] = useState(false);
  const actual = useMemo(() => game ? recentOperatingTotals(game.financialHistory, game.currentGameTimeMs, "routes") : {}, [game]);
  const routes = game?.routes.filter((route) => baseFilter === "all" || route.originAirportId === baseFilter)
    .sort((a, b) => sort === "distance" ? a.distanceKm - b.distanceKm : (actual[b.id]?.[sort] ?? 0) - (actual[a.id]?.[sort] ?? 0)) ?? [];
  const route = game?.routes.find((item) => item.id === selectedId);
  if (!game) return null;
  const selectedRoutes = game.routes.filter((item) => checked.includes(item.id));
  const validPercent = Number.isFinite(percent) && percent >= 1 && percent <= 1000;
  return <div className="min-w-0 space-y-5">
    <h2 className="text-2xl font-black text-ink">{t("routes.openedRoutes")}</h2>
    <div className="flex flex-wrap gap-3 border-y border-slate-200 bg-white py-3">
      <label className="min-w-0 text-sm font-bold text-slate-600">{t("routes.originBase")}
        <select value={baseFilter} onChange={(event) => setBaseFilter(event.target.value)} className="ml-2 max-w-full rounded-md border border-slate-300 p-2">
          <option value="all">{t("fleet.allBases")}</option>{game.baseAirports.map((id) => <option key={id} value={id}>{airportsById[id]?.iata}</option>)}
        </select>
      </label>
      <label className="text-sm font-bold text-slate-600">{t("market.sort")}
        <select value={sort} onChange={(event) => setSort(event.target.value as Sort)} className="ml-2 rounded-md border border-slate-300 p-2">
          <option value="profit">{t("market.sortProfit")}</option><option value="revenue">{t("market.sortRevenue")}</option><option value="distance">{t("routes.shortestFirst")}</option>
        </select>
      </label>
    </div>
    <details className="border-b border-slate-200 pb-3">
      <summary className="cursor-pointer text-sm font-bold text-jet">{t("market.batchPricing")} ({checked.length})</summary>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={routes.length > 0 && routes.every((item) => checked.includes(item.id))}
          onChange={(event) => { setChecked(event.target.checked ? [...new Set([...checked, ...routes.map((item) => item.id)])] : checked.filter((id) => !routes.some((item) => item.id === id))); setBatchPreview(false); setApplied(false); }} />{t("market.selectAll")}</label>
        <label className="text-xs font-bold">{t("market.referencePercent")}<input type="number" min={1} max={1000} step={5} value={Number.isFinite(percent) ? percent : ""}
          onChange={(event) => { setPercent(event.target.valueAsNumber); setBatchPreview(false); setApplied(false); }} className="ml-2 w-20 rounded-md border border-slate-300 p-2 text-sm" /></label>
        <button type="button" disabled={!checked.length || !validPercent} onClick={() => setBatchPreview(true)} className="flex min-h-10 items-center gap-2 rounded-md bg-white px-3 text-sm font-bold disabled:opacity-40"><Eye size={16} />{t("market.preview")}</button>
        {batchPreview && <button type="button" disabled={applied || !validPercent || !checked.length} onClick={() => setApplied(batchPricing(checked, percent))}
          className="flex min-h-10 items-center gap-2 rounded-md bg-jet px-3 text-sm font-bold text-white disabled:opacity-40"><Check size={16} />{t(applied ? "market.applied" : "market.apply")}</button>}
      </div>
      {batchPreview && <div className="mt-3 max-h-52 divide-y divide-slate-200 overflow-y-auto">{selectedRoutes.map((item) => {
        const recommended = item.recommendedPricing ?? routePricingFromDefaults(item);
        return <div key={item.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><strong>{airportsById[item.originAirportId]?.iata} - {airportsById[item.destinationAirportId]?.iata}</strong>
          <span>{t("market.fare.economy")}: {formatGBP.format(item.pricing?.economy ?? recommended.economy)} / {formatGBP.format(Math.round(recommended.economy * percent / 100))}</span></div>;
      })}</div>}
    </details>
    {!routes.length ? <p className="py-8 text-sm text-slate-500">{t("routes.noRoutesForFilter")}</p> :
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <div className="mb-2 grid grid-cols-[24px_1fr_auto] gap-2 text-xs text-slate-500"><span /><span>{t("nav.routes")}</span><span>{t("market.sortProfit")}</span></div>
          <div className="divide-y divide-slate-200 border-y border-slate-200 bg-white">{routes.map((item) => <div key={item.id}
            className={`flex items-center gap-2 px-3 py-2 ${item.id === selectedId ? "bg-teal-50" : ""}`}>
            <input type="checkbox" aria-label={`${t("market.batchPricing")} ${airportsById[item.originAirportId]?.iata}-${airportsById[item.destinationAirportId]?.iata}`} checked={checked.includes(item.id)}
              onChange={() => { setChecked(checked.includes(item.id) ? checked.filter((id) => id !== item.id) : [...checked, item.id]); setBatchPreview(false); setApplied(false); }} />
            <button type="button" onClick={() => setSelectedId(item.id)} className="flex min-h-12 min-w-0 flex-1 flex-wrap items-center justify-between gap-2 text-left text-sm">
              <span className="min-w-0"><strong>{airportsById[item.originAirportId]?.iata} - {airportsById[item.destinationAirportId]?.iata}</strong><span className="mt-1 block text-xs text-slate-500">{formatNumber.format(item.distanceKm)} km</span></span>
              <span className={actual[item.id]?.profit < 0 ? "font-bold text-coral" : "font-bold text-jet"}>{actual[item.id] ? formatGBP.format(actual[item.id].profit) : "--"}</span>
            </button>
          </div>)}</div>
        </section>
        <section className="min-w-0 bg-white p-4">
          {route ? <RouteDetails key={route.id} route={route} game={game} onSchedule={onSchedule} /> : <p className="py-10 text-center text-sm text-slate-500">{t("routes.selectRouteDetails")}</p>}
        </section>
      </div>}
  </div>;
}
function RouteDetails({ route, game, onSchedule }: { route: Route; game: GameState; onSchedule?: () => void }) {
  const { t } = useTranslation();
  const summary = calculateRemainingDemand(route.id, game)!;
  const schedules = game.fleet.flatMap((aircraft) => aircraft.weeklySchedules.filter((schedule) => schedule.routeId === route.id).map((schedule) => ({ aircraft, schedule })));
  return <div className="space-y-5">
    <header><h3 className="text-xl font-bold text-ink">{airportsById[route.originAirportId]?.iata} - {airportsById[route.destinationAirportId]?.iata}</h3>
      <p className="text-sm text-slate-500">{airportsById[route.originAirportId]?.city} / {airportsById[route.destinationAirportId]?.city}</p></header>
    <RouteBusinessPanel route={route} game={game} />
    <section className="border-t border-slate-200 pt-4">
      <h4 className="font-bold">{t("market.weeklyBoth")}</h4>
      <div className="mt-3 space-y-2">{(["first", "business", "premiumEconomy", "economy", "cargoTons"] as const).map((key) => <CapacityRow key={key} cabin={key} demand={summary.totalDemand} capacity={summary.usedDemand} />)}</div>
    </section>
    <section className="border-t border-slate-200 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-bold">{t("routes.activeSchedules")}</h4>
        {onSchedule && <button type="button" onClick={onSchedule} className="min-h-10 rounded-md bg-slate-100 px-3 text-sm font-bold">{t("market.schedule")}</button>}</div>
      <div className="mt-2 divide-y divide-slate-100">{schedules.map(({ aircraft, schedule }) => <p key={schedule.id} className="break-words py-2 text-sm">{aircraft.registration} / {formatScheduleFlightNumbers(schedule)} / {schedule.departureTimeLocal} UTC</p>)}</div>
    </section>
    <RouteEvaluationCard evaluation={evaluateRoute({ route, gameState: game })} game={game} compact />
  </div>;
}
function CapacityRow({ cabin, demand, capacity }: { cabin: keyof CabinDemand; demand: CabinDemand; capacity: CabinDemand }) {
  const { t } = useTranslation();
  return <div className="text-xs"><div className="flex flex-wrap justify-between gap-2"><strong>{t(`market.fare.${cabin === "cargoTons" ? "cargo" : cabin}`)}</strong>
    <span>{formatNumber.format(capacity[cabin])} / {formatNumber.format(demand[cabin])}{cabin === "cargoTons" ? " t" : ""}</span></div>
    <progress aria-label={t("market.capacity")} max={Math.max(1, demand[cabin], capacity[cabin])} value={capacity[cabin]} className="mt-1 h-2 w-full accent-teal-700" />
  </div>;
}
