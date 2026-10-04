"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { CompanyAge } from "@/components/CompanyAge";
import { FinancialReports } from "@/components/FinancialReports";
import { airportsById } from "@/data/airports";
import { useTranslation, type TranslationKey } from "@/i18n";
import { getCurrentCash } from "@/lib/cash";
import { FLIGHT_LOG_SORT_KEYS, sortFlightLog, type FlightLogSortKey, type SortDirection } from "@/lib/finance";
import { formatGBP } from "@/lib/format";
import { useGameStore } from "@/store/gameStore";

const sortLabels: Record<FlightLogSortKey, TranslationKey> = {
  completedGameTime: "finance.completed",
  profit: "finance.profit",
  flightNumber: "finance.flight",
  passengerCount: "finance.pax",
  cargoTons: "finance.cargo",
  revenue: "finance.revenue",
  cost: "finance.cost"
};

export function FinanceScreen() {
  const { language, t } = useTranslation();
  const game = useGameStore((state) => state.game);
  const [sortKey, setSortKey] = useState<FlightLogSortKey>("completedGameTime");
  const [view, setView] = useState<"log" | "daily" | "weekly">("log");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const entries = useMemo(() => sortFlightLog(game?.flightLog ?? [], sortKey, direction), [game?.flightLog, sortKey, direction]);
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC", hour12: false
  }), [language]);
  if (!game) return null;
  const cash = getCurrentCash(game);

  function chooseSort(key: FlightLogSortKey) {
    if (key === sortKey) setDirection((value) => value === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setDirection(key === "flightNumber" ? "asc" : "desc");
    }
  }

  const sortHeading = (key: FlightLogSortKey) => (
    <SortableHeading label={t(sortLabels[key])} sortKey={key} activeKey={sortKey} direction={direction}
      onSort={chooseSort} title={t(key === sortKey && direction === "asc" ? "finance.descending" : key === sortKey ? "finance.ascending" : "finance.sortBy")} />
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-black text-ink">{t("finance.title")}</h2>
        <p className="text-slate-600">{t("finance.subtitle")}</p>
        <CompanyAge game={game} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Panel label={t("top.cash")} value={formatGBP.format(cash)} />
        <Panel label={t("dashboard.totalProfit")} value={formatGBP.format(game.totalProfit)} />
        <Panel label={t("finance.completedFlights")} value={String(game.completedFlights)} />
        <Panel label={t("maintenance.totalCashCost")} value={formatGBP.format(game.fleet.reduce((sum, aircraft) => sum + (aircraft.lifecycle?.totalMaintenanceCashCost ?? 0), 0))} />
        <Panel label={t("dashboard.passengers")} value={game.passengerCount.toLocaleString("en-GB")} />
        <Panel label={t("dashboard.cargoMoved")} value={`${game.cargoTransportedTons.toFixed(1)} t`} />
      </div>
      <div role="tablist" aria-label={t("finance.title")} className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {(["log", "daily", "weekly"] as const).map((key) => <button key={key} type="button" role="tab" aria-selected={view === key}
          onClick={() => setView(key)} className={`min-h-10 rounded-md px-3 text-sm font-bold ${view === key ? "bg-jet text-white" : "text-slate-600 hover:bg-white"}`}>
          {t(key === "log" ? "finance.flightLog" : key === "daily" ? "reports.daily" : "reports.weekly")}
        </button>)}
      </div>
      {view !== "log" ? <FinancialReports key={view} game={game} period={view} /> : (
      <section className="border-y border-slate-200 bg-white py-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-bold text-ink">{t("finance.flightLog")}</h3>
          <div className="flex max-w-full items-center gap-2">
            <label htmlFor="finance-sort" className="text-sm font-semibold text-slate-600">{t("finance.sortBy")}</label>
            <select id="finance-sort" value={sortKey} onChange={(event) => {
              const key = event.target.value as FlightLogSortKey;
              setSortKey(key);
              setDirection(key === "flightNumber" ? "asc" : "desc");
            }} className="h-9 min-w-0 rounded-md border border-slate-300 bg-white px-2 text-sm text-ink">
              {FLIGHT_LOG_SORT_KEYS.map((key) => <option key={key} value={key}>{t(sortLabels[key])}</option>)}
            </select>
            <button type="button" onClick={() => setDirection((value) => value === "asc" ? "desc" : "asc")}
              aria-label={t(direction === "asc" ? "finance.ascending" : "finance.descending")}
              title={t(direction === "asc" ? "finance.ascending" : "finance.descending")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-300 text-jet hover:bg-slate-50">
              {direction === "asc" ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full min-w-[960px] whitespace-nowrap text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-normal text-slate-500">
              <tr>
                {sortHeading("completedGameTime")}
                {sortHeading("flightNumber")}
                <th scope="col" className="px-3 py-2">{t("finance.aircraft")}</th>
                <th scope="col" className="px-3 py-2">{t("finance.route")}</th>
                {sortHeading("revenue")}
                {sortHeading("cost")}
                {sortHeading("profit")}
                {sortHeading("passengerCount")}
                {sortHeading("cargoTons")}
              </tr>
            </thead>
            <tbody>
              {game.flightLog.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-5 text-center text-slate-500">
                    {t("finance.emptyLog")}
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{dateFormat.format(entry.completedGameTime)}</td>
                    <td className="px-3 py-2 font-semibold">{entry.flightNumber?.trim() || "-"}</td>
                    <td className="px-3 py-2 font-semibold">{entry.aircraftRegistration}</td>
                    <td className="px-3 py-2">
                      {airportsById[entry.originAirportId]?.iata ?? entry.originAirportId} / {airportsById[entry.destinationAirportId]?.iata ?? entry.destinationAirportId}
                    </td>
                    <td className="px-3 py-2">{formatGBP.format(entry.revenue)}</td>
                    <td className="px-3 py-2">{formatGBP.format(entry.cost)}</td>
                    <td className={`px-3 py-2 font-bold ${entry.profit >= 0 ? "text-mint" : "text-coral"}`}>
                      {formatGBP.format(entry.profit)}
                    </td>
                    <td className="px-3 py-2">{entry.passengerCount}</td>
                    <td className="px-3 py-2">{entry.cargoTons.toFixed(1)} t</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      )}
    </div>
  );
}

function SortableHeading({ label, sortKey, activeKey, direction, onSort, title }: {
  label: string;
  sortKey: FlightLogSortKey;
  activeKey: FlightLogSortKey;
  direction: SortDirection;
  onSort: (key: FlightLogSortKey) => void;
  title: string;
}) {
  const active = sortKey === activeKey;
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th scope="col" aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"} className="px-3 py-2">
      <button type="button" onClick={() => onSort(sortKey)} title={title}
        className="flex items-center gap-1 py-1 font-semibold uppercase hover:text-jet">
        {label}<Icon size={14} aria-hidden="true" className={active ? "text-jet" : "text-slate-400"} />
      </button>
    </th>
  );
}

function Panel({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-1 truncate text-2xl font-black text-ink">{value}</p>
    </div>
  );
}
