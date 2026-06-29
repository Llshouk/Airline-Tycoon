"use client";

import { airportsById } from "@/data/airports";
import { useTranslation } from "@/i18n";
import { getCurrentCash } from "@/lib/cash";
import { formatGBP } from "@/lib/format";
import { formatGameDate } from "@/lib/time";
import { useGameStore } from "@/store/gameStore";

export function FinanceScreen() {
  const { t } = useTranslation();
  const game = useGameStore((state) => state.game);
  if (!game) return null;
  const cash = getCurrentCash(game);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-black text-ink">{t("finance.title")}</h2>
        <p className="text-slate-600">Completed flight revenue, operating costs, and profit.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Panel label={t("top.cash")} value={formatGBP.format(cash)} />
        <Panel label={t("dashboard.totalProfit")} value={formatGBP.format(game.totalProfit)} />
        <Panel label={t("finance.completedFlights")} value={String(game.completedFlights)} />
        <Panel label={t("dashboard.passengers")} value={game.passengerCount.toLocaleString("en-GB")} />
        <Panel label="Cargo transported" value={`${game.cargoTransportedTons.toFixed(1)} t`} />
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
        <h3 className="mb-3 font-bold text-ink">Flight log</h3>
        <div className="overflow-hidden rounded-md border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-normal text-slate-500">
              <tr>
                <th className="px-3 py-2">Completed</th>
                <th className="px-3 py-2">Flight</th>
                <th className="px-3 py-2">Aircraft</th>
                <th className="px-3 py-2">Route</th>
                <th className="px-3 py-2">{t("finance.revenue")}</th>
                <th className="px-3 py-2">{t("finance.cost")}</th>
                <th className="px-3 py-2">{t("finance.profit")}</th>
                <th className="px-3 py-2">Pax</th>
                <th className="px-3 py-2">Cargo</th>
              </tr>
            </thead>
            <tbody>
              {game.flightLog.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-5 text-center text-slate-500">
                    Completed flights will appear here.
                  </td>
                </tr>
              ) : (
                game.flightLog.map((entry) => (
                  <tr key={entry.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{formatGameDate(entry.completedGameTime)}</td>
                    <td className="px-3 py-2 font-semibold">{entry.flightNumber ?? "-"}</td>
                    <td className="px-3 py-2 font-semibold">{entry.aircraftRegistration}</td>
                    <td className="px-3 py-2">
                      {airportsById[entry.originAirportId].iata} to {airportsById[entry.destinationAirportId].iata}
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
      </div>
    </div>
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
