"use client";

import { Activity, Banknote, CheckCircle2, Gauge, Package, Plane, TrendingUp, Users } from "lucide-react";
import { aircraftById } from "@/data/aircraft";
import { airportsById } from "@/data/airports";
import { useTranslation } from "@/i18n";
import { formatGBP } from "@/lib/format";
import { calculateDashboardStats } from "@/lib/stats";
import { formatGameDate } from "@/lib/time";
import { useGameStore } from "@/store/gameStore";

export function Dashboard() {
  const { t } = useTranslation();
  const game = useGameStore((state) => state.game);
  if (!game) return null;
  const base = airportsById[game.baseAirportId];
  const stats = calculateDashboardStats(game);
  const nextFlights = game.fleet.flatMap((aircraft) =>
    aircraft.schedule
      .filter((item) => item.status !== "completed")
      .map((item) => ({ item, aircraft }))
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-black text-ink">{t("dashboard.title")}</h2>
        <p className="text-slate-600">
          {t("dashboard.base")}: {base.iata} {base.name}, {base.city}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Banknote} label={t("top.cash")} value={formatGBP.format(stats.cash)} />
        <Stat icon={Plane} label={t("dashboard.ownedAircraft")} value={String(stats.aircraftOwned)} />
        <Stat icon={Activity} label={t("dashboard.openRoutes")} value={String(stats.openRoutes)} />
        <Stat icon={TrendingUp} label="Actual profit" value={formatGBP.format(stats.totalProfit)} />
        <Stat icon={Users} label={t("dashboard.passengers")} value={stats.passengerCount.toLocaleString("en-GB")} />
        <Stat icon={Package} label={t("dashboard.cargoMoved")} value={`${stats.cargoTransportedTons.toFixed(1)} t`} />
        <Stat icon={Gauge} label={t("dashboard.speed")} value={game.isPaused ? "Paused" : `${game.timeMultiplier}x`} />
        <Stat icon={CheckCircle2} label={t("dashboard.flights")} value={String(stats.completedFlights)} />
      </div>
      <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 size={20} className="text-mint" />
            <h3 className="font-bold text-ink">Operations snapshot</h3>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Small label={t("finance.completedFlights")} value={String(stats.completedFlights)} />
            <Small label="Expanded airports" value={String(game.expandedAirportIds.length)} />
            <Small label="Current game time" value={formatGameDate(game.currentGameTimeMs)} />
            <Small label="Active aircraft" value={String(stats.activeAircraft)} />
            <Small label="Aircraft in flight" value={String(stats.aircraftInFlight)} />
            <Small label="Scheduled weekly flights" value={String(stats.scheduledWeeklyFlights)} />
            <Small label="Actual revenue" value={formatGBP.format(stats.totalRevenue)} />
            <Small label="Actual operating cost" value={formatGBP.format(stats.totalOperatingCost)} />
            <Small label="Company valuation" value={formatGBP.format(stats.companyValuation)} />
            <Small label="Estimated weekly revenue" value={formatGBP.format(stats.estimatedWeeklyRevenue)} />
            <Small label="Estimated weekly cost" value={formatGBP.format(stats.estimatedWeeklyCost)} />
            <Small label="Estimated weekly profit" value={formatGBP.format(stats.estimatedWeeklyProfit)} />
          </div>
          <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-normal text-slate-500">
                <tr>
                  <th className="px-3 py-2">Aircraft</th>
                  <th className="px-3 py-2">Model</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {game.fleet.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-5 text-center text-slate-500">
                      Buy an aircraft to begin operations.
                    </td>
                  </tr>
                ) : (
                  game.fleet.map((aircraft) => {
                    const model = aircraftById[aircraft.modelId];
                    const airport = airportsById[aircraft.currentAirportId];
                    return (
                      <tr key={aircraft.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-semibold">{aircraft.registration}</td>
                        <td className="px-3 py-2">{model?.manufacturer} {model?.model}</td>
                        <td className="px-3 py-2">{airport?.iata}</td>
                        <td className="px-3 py-2 capitalize">{aircraft.status}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <h3 className="font-bold text-ink">Upcoming flights</h3>
          <div className="mt-3 space-y-3">
            {nextFlights.length === 0 ? (
              <p className="text-sm text-slate-500">No scheduled flights yet.</p>
            ) : (
              nextFlights.slice(0, 5).map(({ item, aircraft }) => (
                <div key={item.id} className="rounded-md border border-slate-200 p-3">
                  <p className="font-semibold text-ink">
                    {airportsById[item.originAirportId].iata} to {airportsById[item.destinationAirportId].iata}
                  </p>
                  <p className="text-sm text-slate-500">
                    {aircraft.registration} departs {formatGameDate(item.departureGameTime)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Banknote; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft transition duration-200 hover:-translate-y-0.5 hover:border-mint">
      <Icon size={22} className="text-coral" />
      <p className="mt-3 text-sm font-semibold text-slate-500">{label}</p>
      <p key={value} className="animate-slide-in truncate text-2xl font-black text-ink">{value}</p>
    </div>
  );
}

function Small({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-runway p-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="font-bold text-ink">{value}</p>
    </div>
  );
}
