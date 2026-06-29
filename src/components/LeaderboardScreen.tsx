"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "@/i18n";
import { formatGBP, formatNumber } from "@/lib/format";
import { getLeaderboard } from "@/store/gameStore";
import type { LeaderboardSort } from "@/types/game";

const sortLabels: Record<LeaderboardSort, string> = {
  valuation: "Valuation",
  profit: "Profit",
  fleet: "Fleet",
  routes: "Routes",
  completedFlights: "Flights"
};

export function LeaderboardScreen() {
  const { t } = useTranslation();
  const [sort, setSort] = useState<LeaderboardSort>("valuation");
  const entries = useMemo(() => {
    const data = getLeaderboard();
    return [...data].sort((a, b) => valueFor(b, sort) - valueFor(a, sort));
  }, [sort]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-black text-ink">{t("leaderboard.title")}</h2>
        <p className="text-slate-600">Local company rankings with mock AI competitors for V1.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(sortLabels) as LeaderboardSort[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setSort(key)}
            className={`rounded-md px-3 py-2 text-sm font-bold transition ${sort === key ? "bg-jet text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}
          >
            {sortLabels[key]}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-normal text-slate-500">
            <tr>
              <th className="px-3 py-3">Rank</th>
              <th className="px-3 py-3">Airline</th>
              <th className="px-3 py-3">Valuation</th>
              <th className="px-3 py-3">Cash</th>
              <th className="px-3 py-3">Profit</th>
              <th className="px-3 py-3">Fleet</th>
              <th className="px-3 py-3">Routes</th>
              <th className="px-3 py-3">Flights</th>
              <th className="px-3 py-3">Passengers</th>
              <th className="px-3 py-3">Cargo</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <tr key={entry.id} className={`border-t border-slate-100 ${entry.isPlayer ? "bg-mint/10" : ""}`}>
                <td className="px-3 py-3 font-black">{index + 1}</td>
                <td className="px-3 py-3 font-bold text-ink">{entry.airlineName}</td>
                <td className="px-3 py-3">{formatGBP.format(entry.valuation)}</td>
                <td className="px-3 py-3">{formatGBP.format(entry.cash)}</td>
                <td className={`px-3 py-3 font-bold ${entry.totalProfit >= 0 ? "text-mint" : "text-coral"}`}>
                  {formatGBP.format(entry.totalProfit)}
                </td>
                <td className="px-3 py-3">{entry.fleetSize}</td>
                <td className="px-3 py-3">{entry.routes}</td>
                <td className="px-3 py-3">{entry.completedFlights}</td>
                <td className="px-3 py-3">{formatNumber.format(entry.passengerCount)}</td>
                <td className="px-3 py-3">{entry.cargoTransportedTons.toFixed(1)} t</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function valueFor(entry: ReturnType<typeof getLeaderboard>[number], sort: LeaderboardSort) {
  if (sort === "valuation") return entry.valuation;
  if (sort === "profit") return entry.totalProfit;
  if (sort === "fleet") return entry.fleetSize;
  if (sort === "routes") return entry.routes;
  return entry.completedFlights;
}
