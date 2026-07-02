"use client";

import { aircraftById } from "@/data/aircraft";
import { airportsById } from "@/data/airports";
import { useTranslation } from "@/i18n";
import { estimateExpectedFlightProfit, estimateWeeklyScheduleFinancials, routePricingFromDefaults } from "@/lib/economy";
import { formatGBP, formatNumber } from "@/lib/format";
import { calculateRemainingDemand, type RemainingDemandSummary } from "@/lib/routeDemand";
import { formatRouteCode, formatScheduleFlightNumbers } from "@/lib/schedule";
import { useGameStore } from "@/store/gameStore";
import type { CabinDemand, GameState, Route } from "@/types/game";

export function RoutesScreen() {
  const { t } = useTranslation();
  const game = useGameStore((state) => state.game);
  if (!game) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-ink">{t("routes.openedRoutes")}</h2>
          <p className="text-slate-600">{t("routes.openRoutesFromMap")}</p>
        </div>
        <span className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-normal text-slate-500">
          {t("routes.readOnly")}
        </span>
      </div>

      {game.routes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm font-semibold text-slate-500 shadow-soft">
          {t("routes.openRoutesFromMap")}
        </div>
      ) : (
        <div className="grid gap-4">
          {game.routes.map((route) => (
            <RouteReadOnlyCard key={route.id} route={route} game={game} summary={calculateRemainingDemand(route.id, game)} />
          ))}
        </div>
      )}
    </div>
  );
}

function RouteReadOnlyCard({ route, game, summary }: { route: Route; game: GameState; summary: RemainingDemandSummary | null }) {
  const { t } = useTranslation();
  const origin = airportsById[route.originAirportId];
  const destination = airportsById[route.destinationAirportId];
  const pricing = route.pricing ?? routePricingFromDefaults(route);
  const best = bestRoutePreview(route, game);
  const scheduleTotals = routeScheduleTotals(route, game);

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-normal text-coral">Open</p>
          <h3 className="text-xl font-black text-ink">
            {origin.iata} {origin.city} - {destination.iata} {destination.city}
          </h3>
          <p className="text-sm text-slate-500">{formatNumber.format(route.distanceKm)} km</p>
        </div>
        <span className="rounded-md bg-mint/10 px-3 py-2 text-xs font-black text-mint">{t("routes.readOnly")}</span>
      </div>

      <div className="mt-4 grid gap-2 text-sm md:grid-cols-4">
        <Info label={t("routes.rangeRequirement")} value={`${formatNumber.format(route.distanceKm)} km`} />
        <Info label={t("routes.bestRevenuePerFlight")} value={best ? formatGBP.format(best.revenue) : "N/A"} />
        <Info label={t("routes.bestProfitPerFlight")} value={best ? formatGBP.format(best.profit) : "N/A"} />
        <Info label={t("routes.weeklyScheduledCapacity")} value={String(scheduleTotals.weeklyFlights)} />
        <Info label="Economy fare" value={formatGBP.format(pricing.economy)} />
        <Info label="Premium fare" value={formatGBP.format(pricing.premiumEconomy)} />
        <Info label="Business fare" value={formatGBP.format(pricing.business)} />
        <Info label="Cargo rate" value={`${formatGBP.format(pricing.cargo)}/t`} />
      </div>

      <DemandGrid title={t("routes.weeklyDemand")} demand={route.estimatedDemand} />
      {summary ? <RemainingDemandBars summary={summary} /> : null}
      <ActiveSchedules route={route} game={game} />
    </article>
  );
}

function ActiveSchedules({ route, game }: { route: Route; game: GameState }) {
  const { t } = useTranslation();
  const schedules = game.fleet.flatMap((aircraft) =>
    aircraft.weeklySchedules
      .filter((schedule) => schedule.routeId === route.id)
      .map((schedule) => ({ aircraft, schedule, model: aircraftById[aircraft.modelId] }))
  );

  return (
    <div className="mt-4 rounded-md border border-slate-200 p-3">
      <p className="mb-2 text-sm font-black text-ink">{t("routes.activeSchedules")}</p>
      {schedules.length === 0 ? (
        <p className="text-sm text-slate-500">{t("routes.noWeeklyServices")}</p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {schedules.map(({ aircraft, schedule, model }) => {
            const estimate = estimateWeeklyScheduleFinancials(schedule, route, model, aircraft, game.difficultyConfig);
            return (
              <div key={`${aircraft.id}-${schedule.id}`} className="rounded-md bg-runway px-3 py-2 text-sm">
                <p className="font-bold text-ink">
                  <span className="block truncate whitespace-nowrap tabular-nums">
                    {formatScheduleFlightNumbers(schedule)} {formatRouteCode(route)} - {aircraft.registration} - {model.model}
                  </span>
                </p>
                <p className="text-slate-500">
                  {schedule.daysOfWeek.length} days - {formatGBP.format(estimate.weeklyRevenue)} revenue - {formatGBP.format(estimate.weeklyProfit)} profit
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DemandGrid({ title, demand }: { title: string; demand: CabinDemand }) {
  return (
    <div className="mt-4 rounded-md border border-slate-200 p-3">
      <p className="mb-2 text-sm font-black text-ink">{title}</p>
      <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
        <Info label="First" value={formatNumber.format(demand.first)} />
        <Info label="Business" value={formatNumber.format(demand.business)} />
        <Info label="Premium" value={formatNumber.format(demand.premiumEconomy)} />
        <Info label="Economy" value={formatNumber.format(demand.economy)} />
        <Info label="Cargo" value={`${demand.cargoTons.toFixed(1)} t`} />
      </div>
    </div>
  );
}

function RemainingDemandBars({ summary }: { summary: RemainingDemandSummary }) {
  const { t } = useTranslation();
  return (
    <div className="mt-4 space-y-3 rounded-md border border-slate-200 p-3">
      <p className="text-sm font-black text-ink">{t("routes.remainingDemand")}</p>
      <DemandBar label="First" total={summary.totalDemand.first} used={summary.usedDemand.first} remaining={summary.remainingDemand.first} />
      <DemandBar label="Business" total={summary.totalDemand.business} used={summary.usedDemand.business} remaining={summary.remainingDemand.business} />
      <DemandBar label="Premium" total={summary.totalDemand.premiumEconomy} used={summary.usedDemand.premiumEconomy} remaining={summary.remainingDemand.premiumEconomy} />
      <DemandBar label="Economy" total={summary.totalDemand.economy} used={summary.usedDemand.economy} remaining={summary.remainingDemand.economy} />
      <DemandBar label="Cargo" total={summary.totalDemand.cargoTons} used={summary.usedDemand.cargoTons} remaining={summary.remainingDemand.cargoTons} suffix=" t" />
    </div>
  );
}

function DemandBar({ label, total, used, remaining, suffix = "" }: { label: string; total: number; used: number; remaining: number; suffix?: string }) {
  const safeTotal = Math.max(total, 1);
  const usedPercent = Math.min((used / safeTotal) * 100, 100);
  return (
    <div>
      <div className="mb-1 flex flex-wrap justify-between gap-2 text-xs">
        <span className="font-black text-ink">{label}</span>
        <span className="font-semibold text-slate-500">
          Used {formatDemand(used, suffix)} - Remaining {formatDemand(remaining, suffix)} - Total {formatDemand(total, suffix)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-runway">
        <div className="h-full rounded-full bg-mint" style={{ width: `${usedPercent}%` }} />
      </div>
    </div>
  );
}

function bestRoutePreview(route: Route, game: GameState) {
  return game.fleet
    .map((aircraft) => {
      const model = aircraftById[aircraft.modelId];
      if (!model || model.rangeKm < route.distanceKm) return null;
      return estimateExpectedFlightProfit(route, model, aircraft.cabinLayout, game.difficultyConfig);
    })
    .filter(Boolean)
    .sort((a, b) => (b?.profit ?? 0) - (a?.profit ?? 0))[0] ?? null;
}

function routeScheduleTotals(route: Route, game: GameState) {
  return game.fleet.reduce(
    (totals, aircraft) => {
      const model = aircraftById[aircraft.modelId];
      aircraft.weeklySchedules
        .filter((schedule) => schedule.routeId === route.id)
        .forEach((schedule) => {
          const estimate = estimateWeeklyScheduleFinancials(schedule, route, model, aircraft, game.difficultyConfig);
          totals.weeklyFlights += estimate.weeklyFlights;
        });
      return totals;
    },
    { weeklyFlights: 0 }
  );
}

function formatDemand(value: number, suffix: string) {
  return `${suffix ? value.toFixed(1) : formatNumber.format(Math.round(value))}${suffix}`;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-runway px-3 py-2">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="truncate font-bold text-ink">{value}</p>
    </div>
  );
}
