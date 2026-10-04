"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { airportsById } from "@/data/airports";
import { useTranslation, type TranslationKey } from "@/i18n";
import { createFinancialHistory, financialDays, financialWeeks, recentOperatingTotals, type FinancialPeriod } from "@/lib/financialReports";
import { formatGBP } from "@/lib/format";
import type { FinanceValues } from "@/types/finance";
import type { GameState } from "@/types/game";

const breakdown: [keyof FinanceValues, TranslationKey][] = [
  ["passengerRevenue", "reports.passengerRevenue"], ["cargoRevenue", "reports.cargoRevenue"],
  ["fuelCost", "reports.fuel"], ["crewCost", "reports.crew"], ["airportCost", "reports.airport"],
  ["maintenanceReserve", "reports.reserve"], ["extraMaintenance", "reports.maintenance"],
  ["aircraftPurchases", "reports.aircraftPurchases"], ["routeOpening", "reports.routeOpening"],
  ["basePurchases", "reports.basePurchases"], ["subsidies", "reports.subsidies"],
  ["adjustments", "reports.adjustments"], ["earlierSettlements", "reports.earlier"]
];

export function FinancialReports({ game, period }: { game: GameState; period: "daily" | "weekly" }) {
  const { language, t } = useTranslation();
  const [range, setRange] = useState<7 | 30 | 90>(7);
  const [selectedStart, setSelectedStart] = useState<number | null>(null);
  const history = useMemo(() => game.financialHistory ?? createFinancialHistory(game.currentGameTimeMs, game.money),
    [game.financialHistory, game.currentGameTimeMs, game.money]);
  const days = useMemo(() => financialDays(history, game.currentGameTimeMs), [history, game.currentGameTimeMs]);
  const periods = useMemo(() => period === "daily" ? days : financialWeeks(days, history, game.currentGameTimeMs),
    [period, days, history, game.currentGameTimeMs]);
  const selected = periods.find((value) => value.startsGameTimeMs === selectedStart) ?? periods[periods.length - 1];
  const routeTotals = useMemo(() => recentOperatingTotals(history, game.currentGameTimeMs, "routes"), [history, game.currentGameTimeMs]);
  const routeNames = new Map(game.routes.map((route) => [route.id,
    `${airportsById[route.originAirportId]?.iata ?? route.originAirportId} / ${airportsById[route.destinationAirportId]?.iata ?? route.destinationAirportId}`]));
  const date = (time: number) => new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC"
  }).format(time);
  const routeRows = Object.entries(routeTotals);
  if (!selected) return null;

  return (
    <div className="space-y-5">
      <section className="border-y border-slate-200 bg-white py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-ink">{t("reports.trend")}</h3>
            <p className="text-xs text-slate-500">{t("reports.tracking")}: {date(history.trackingStartedGameTimeMs)}</p>
          </div>
          <div role="group" aria-label={t("reports.trend")} className="flex gap-1">
            {([7, 30, 90] as const).map((value) => <button key={value} type="button" aria-pressed={range === value}
              onClick={() => setRange(value)} className={`h-9 rounded-md px-3 text-sm font-bold ${range === value ? "bg-jet text-white" : "bg-slate-100 text-slate-600"}`}>
              {t(`reports.days${value}`)}
            </button>)}
          </div>
        </div>
        <TrendChart days={days.slice(-range)} date={date} />
      </section>
      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[760px] whitespace-nowrap text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500">
              <tr>{(["reports.period", "finance.revenue", "finance.cost", "reports.operatingProfit", "reports.cashChange", "finance.completedFlights", "reports.closingCash"] as const)
                .map((key) => <th key={key} className="px-3 py-2">{t(key)}</th>)}</tr>
            </thead>
            <tbody>{[...periods].reverse().map((value) => <tr key={value.startsGameTimeMs}
              className={`border-b border-slate-100 ${selected.startsGameTimeMs === value.startsGameTimeMs ? "bg-sky-50" : "bg-white"}`}>
              <td className="px-3 py-2">
                <button type="button" onClick={() => setSelectedStart(value.startsGameTimeMs)} aria-pressed={selected.startsGameTimeMs === value.startsGameTimeMs}
                  className="text-left font-bold text-jet underline-offset-4 hover:underline">
                  {date(value.startsGameTimeMs)}
                  <span className="block text-xs font-normal text-slate-500">
                    {[value.partial ? t("reports.partial") : "", value.inProgress ? t("reports.current") : ""].filter(Boolean).join(" · ")}
                  </span>
                </button>
              </td>
              <td className="px-3 py-2">{formatGBP.format(value.revenue)}</td>
              <td className="px-3 py-2">{formatGBP.format(value.cost + value.extraMaintenance)}</td>
              <td className={`px-3 py-2 font-bold ${value.profit >= 0 ? "text-mint" : "text-coral"}`}>{formatGBP.format(value.profit)}</td>
              <td className="px-3 py-2">{formatGBP.format(value.cashChange)}</td>
              <td className="px-3 py-2">{value.flights}</td>
              <td className="px-3 py-2">{formatGBP.format(value.closingCash)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="min-w-0 border-t border-slate-200 pt-3 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
          <h3 className="mb-3 font-bold text-ink">{date(selected.startsGameTimeMs)}{period === "weekly" ? ` - ${date(selected.endsGameTimeMs - 1)}` : ""}</h3>
          <dl className="space-y-2 text-sm">
            <MoneyRow label={t("reports.openingCash")} value={selected.openingCash} />
            {breakdown.map(([key, label]) => <MoneyRow key={key} label={t(label)} value={selected[key]} />)}
            <MoneyRow label={t("reports.operatingProfit")} value={selected.profit} bold />
            <MoneyRow label={t("reports.cashChange")} value={selected.cashChange} bold />
            <MoneyRow label={t("reports.closingCash")} value={selected.closingCash} bold />
            <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-2">
              <dt className="text-slate-500">{t("reports.load")}</dt>
              <dd className="font-bold">{percent(selected.passengers, selected.passengerCapacity)} / {percent(selected.cargoTons, selected.cargoCapacity)}</dd>
            </div>
            <div className="flex justify-between gap-2"><dt>{t("finance.pax")} / {t("finance.cargo")}</dt><dd>{selected.passengers} / {selected.cargoTons.toFixed(1)} t</dd></div>
          </dl>
        </div>
      </section>
      <section className="grid gap-5 border-t border-slate-200 pt-4 md:grid-cols-2">
        {[true, false].map((winning) => {
          const rows = routeRows.filter(([, value]) => winning ? value.profit >= 0 : value.profit < 0)
            .sort((a, b) => winning ? b[1].profit - a[1].profit : a[1].profit - b[1].profit).slice(0, 5);
          return <div key={String(winning)}>
            <h3 className="mb-2 font-bold text-ink">{t(winning ? "reports.routeWinners" : "reports.routeLosers")}</h3>
            {!rows.length ? <p className="text-sm text-slate-500">{t("reports.emptyRoutes")}</p> :
              <ul className="divide-y divide-slate-200 text-sm">{rows.map(([id, value]) => <li key={id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 break-words font-semibold">{routeNames.get(id) ?? id}<span className="block text-xs font-normal text-slate-500">{value.flights} {t("finance.completedFlights")}</span></span>
                <span className={winning ? "text-mint" : "text-coral"}>{formatGBP.format(value.profit)}</span>
              </li>)}</ul>}
          </div>;
        })}
      </section>
    </div>
  );
}

function MoneyRow({ label, value, bold = false }: { label: string; value: number; bold?: boolean }) {
  return <div className={`flex flex-wrap justify-between gap-x-3 gap-y-1 ${bold ? "border-t border-slate-200 pt-2 font-bold text-ink" : ""}`}>
    <dt className={bold ? "" : "text-slate-500"}>{label}</dt><dd className="break-all tabular-nums">{formatGBP.format(value)}</dd>
  </div>;
}

function percent(value: number, capacity: number) { return capacity > 0 ? `${(Math.min(1, value / capacity) * 100).toFixed(1)}%` : "-"; }

function TrendChart({ days, date }: { days: FinancialPeriod[]; date: (time: number) => string }) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const series = [
    { key: "revenue", label: "finance.revenue", color: "#17805c" },
    { key: "cost", label: "finance.cost", color: "#d45a40" },
    { key: "profit", label: "reports.operatingProfit", color: "#2469b2" }
  ] as const;
  const value = (day: FinancialPeriod, key: typeof series[number]["key"]) => key === "cost" ? day.cost + day.extraMaintenance : day[key];
  const numbers = days.flatMap((day) => series.map(({ key }) => value(day, key)));
  const min = Math.min(0, ...numbers), max = Math.max(1, ...numbers);
  const y = (amount: number) => 174 - (amount - min) / (max - min) * 150;
  const x = (index: number) => days.length < 2 ? (width + 58) / 2 : 70 + index / (days.length - 1) * (width - 82);
  const axisMoney = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", notation: "compact", maximumFractionDigits: 1 });
  return <div ref={container} className="mt-3">
    <div className="flex flex-wrap gap-4 text-xs">{series.map(({ key, label, color }) => <span key={key} className="flex items-center gap-1.5"><span className="h-2 w-2" style={{ background: color }} />{t(label)}</span>)}</div>
    <svg role="img" aria-label={t("reports.trend")} viewBox={`0 0 ${width} 215`} className="mt-2 h-[215px] w-full">
      <title>{t("reports.trend")}</title>
      <line x1="70" x2={width - 12} y1={y(0)} y2={y(0)} stroke="#cbd5e1" />
      <text x="4" y="24" fontSize="11" fill="#64748b">{axisMoney.format(max)}</text>
      <text x="4" y="174" fontSize="11" fill="#64748b">{axisMoney.format(min)}</text>
      {series.map(({ key, label, color }) => <g key={key}>
        <polyline points={days.map((day, index) => `${x(index)},${y(value(day, key))}`).join(" ")} fill="none" stroke={color} strokeWidth="2" />
        {days.map((day, index) => <circle key={day.startsGameTimeMs} cx={x(index)} cy={y(value(day, key))} r="3" fill={color}>
          <title>{date(day.startsGameTimeMs)} · {t(label)}: {formatGBP.format(value(day, key))}</title>
        </circle>)}
      </g>)}
      {days.length ? <><text x="70" y="206" fontSize="11" fill="#64748b">{date(days[0].startsGameTimeMs)}</text><text x={width - 12} y="206" textAnchor="end" fontSize="11" fill="#64748b">{date(days[days.length - 1].startsGameTimeMs)}</text></> : null}
    </svg>
  </div>;
}
