"use client";

import { useMemo } from "react";
import { AircraftImage } from "@/components/AircraftImage";
import { CompanyAge } from "@/components/CompanyAge";
import { CompanyGrowthSummary } from "@/components/CompanyGoalsScreen";
import { FleetAlerts } from "@/components/FleetAlerts";
import { PassengerSatisfaction } from "@/components/PassengerSatisfaction";
import { aircraftById } from "@/data/aircraft";
import { airportsById } from "@/data/airports";
import { useTranslation } from "@/i18n";
import { formatGBP } from "@/lib/format";
import { getRecommendedRouteOpportunities, type RouteGrade } from "@/lib/routeEvaluation";
import { calculateDashboardStats } from "@/lib/stats";
import { formatGameDate } from "@/lib/time";
import { usePanelGame } from "@/hooks/usePanelGame";
import type { GameState } from "@/types/game";

export function Dashboard({ onOpenAircraft, onOpenGoals }: { onOpenAircraft: (id: string) => void; onOpenGoals?: () => void }) {
  const { t } = useTranslation();
  const game = usePanelGame();
  const recommendedRoutes = useMemo(() => (game ? getRecommendedRouteOpportunities(game, 4) : []), [game]);
  const departures = useMemo(() => (game ? game.fleet.flatMap((aircraft) => aircraft.schedule
    .filter((item) => item.status === "scheduled" || item.status === "in-flight")
    .map((item) => ({ item, aircraft })))
    .sort((left, right) => (left.item.scheduledDepartureGameTime ?? left.item.departureGameTime) - (right.item.scheduledDepartureGameTime ?? right.item.departureGameTime)).slice(0, 8) : []), [game]);
  if (!game) return null;
  const base = airportsById[game.baseAirportId];
  const stats = calculateDashboardStats(game);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="screen-title">{t("dashboard.title")}</h2>
        <p className="text-sm text-slate-600">
          {t("dashboard.base")}: <span className="font-semibold text-ink">{base.iata} {base.name}, {base.city}</span>
        </p>
        <CompanyAge game={game} />
      </div>

      <dl className="figure-strip">
        <Figure label={t("top.cash")} value={formatGBP.format(stats.cash)} tone={stats.cash < 0 ? "bad" : undefined} wide />
        <Figure label={t("dashboard.profitToDate")} value={formatGBP.format(stats.totalProfit)} tone={stats.totalProfit < 0 ? "bad" : "good"} wide />
        <Figure label={t("dashboard.ownedAircraft")} value={String(stats.aircraftOwned)} />
        <Figure label={t("dashboard.openRoutes")} value={String(stats.openRoutes)} />
        <Figure label={t("dashboard.flights")} value={stats.completedFlights.toLocaleString("en-GB")} />
        <Figure label={t("dashboard.passengers")} value={stats.passengerCount.toLocaleString("en-GB")} />
        <Figure label={t("dashboard.cargoMoved")} value={`${stats.cargoTransportedTons.toLocaleString("en-GB", { maximumFractionDigits: 1 })} t`} />
      </dl>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flight-board">
          <h3>{t("dashboard.departures")}</h3>
          {departures.length === 0 ? <p className="flight-board-empty">{t("dashboard.noDepartures")}</p> : (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>{t("dashboard.colTime")}</th>
                    <th>{t("dashboard.colFlight")}</th>
                    <th>{t("dashboard.colRoute")}</th>
                    <th>{t("dashboard.colAircraft")}</th>
                    <th>{t("dashboard.colStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {departures.map(({ item, aircraft }) => {
                    const delay = item.delayMinutes ?? 0;
                    const state = item.status === "in-flight" ? "airborne" : item.operationalStatus === "grounded" ? "held" : delay > 0 ? "late" : "ontime";
                    return (
                      <tr key={item.id}>
                        <td className="flight-board-time">{formatGameDate(item.scheduledDepartureGameTime ?? item.departureGameTime)}</td>
                        <td>{item.flightNumber ?? (item.isMaintenanceFerry ? t("dashboard.ferry") : "")}</td>
                        <td className="flight-board-route">{airportsById[item.originAirportId].iata}<span aria-hidden="true"> – </span><span className="sr-only"> to </span>{airportsById[item.destinationAirportId].iata}</td>
                        <td>{aircraft.registration}</td>
                        <td><span className={`flight-board-status is-${state}`}>
                          {state === "airborne" ? t("status.in-flight") : state === "held" ? t("maintenance.status.grounded")
                            : state === "late" ? `${t("airport.delayed")} +${delay}${t("maintenance.minuteUnit")}` : t("airport.onTime")}
                        </span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <RecommendedRoutesPanel opportunities={recommendedRoutes} game={game} />
      </section>

      <FleetAlerts game={game} onOpenAircraft={onOpenAircraft} />
      <PassengerSatisfaction fleet={game.fleet} now={game.currentGameTimeMs} company />
      <CompanyGrowthSummary game={game} onOpen={onOpenGoals} />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 rounded-lg border border-slate-200 bg-white">
          <h3 className="px-4 pt-4 text-lg font-bold text-ink">{t("dashboard.fleetStatus")}</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("dashboard.colAircraft")}</th>
                  <th>{t("dashboard.colModel")}</th>
                  <th>{t("dashboard.colLocation")}</th>
                  <th>{t("dashboard.colStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {game.fleet.length === 0 ? (
                  <tr><td colSpan={4} className="py-6 text-center text-slate-500">{t("dashboard.buyFirst")}</td></tr>
                ) : (
                  game.fleet.map((aircraft) => {
                    const model = aircraftById[aircraft.modelId];
                    const airport = airportsById[aircraft.currentAirportId];
                    const troubled = aircraft.status === "maintenance" || aircraft.status === "grounded";
                    return (
                      <tr key={aircraft.id}>
                        <td>
                          <button type="button" onClick={() => onOpenAircraft(aircraft.id)} className="flex items-center gap-3 text-left font-semibold text-ink hover:text-jet">
                            {model ? <AircraftImage model={model} className="h-9 w-16 shrink-0" /> : null}
                            <span>{aircraft.registration}</span>
                          </button>
                        </td>
                        <td>{model?.manufacturer} {model?.model}</td>
                        <td>{airport?.iata}</td>
                        <td className={aircraft.status === "grounded" ? "font-semibold text-coral" : aircraft.status === "maintenance" ? "font-semibold text-caution" : ""}>
                          {troubled ? t(`maintenance.status.${aircraft.status as "maintenance" | "grounded"}`) : t(`status.${aircraft.status as "idle" | "scheduled" | "in-flight"}`)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-lg font-bold text-ink">{t("dashboard.figures")}</h3>
          <dl className="ledger mt-2">
            <Ledger label={t("dashboard.revenueToDate")} value={formatGBP.format(stats.totalRevenue)} />
            <Ledger label={t("dashboard.costToDate")} value={formatGBP.format(stats.totalOperatingCost)} />
            <Ledger label={t("dashboard.valuation")} value={formatGBP.format(stats.companyValuation)} />
            <Ledger label={t("dashboard.weeklyRevenue")} value={formatGBP.format(stats.estimatedWeeklyRevenue)} />
            <Ledger label={t("dashboard.weeklyCost")} value={formatGBP.format(stats.estimatedWeeklyCost)} />
            <Ledger label={t("dashboard.weeklyProfit")} value={formatGBP.format(stats.estimatedWeeklyProfit)} />
            <Ledger label={t("dashboard.weeklyFlights")} value={String(stats.scheduledWeeklyFlights)} />
            <Ledger label={t("dashboard.activeAircraft")} value={`${stats.activeAircraft} / ${stats.aircraftOwned}`} />
            <Ledger label={t("dashboard.inFlight")} value={String(stats.aircraftInFlight)} />
            <Ledger label={t("dashboard.airportsServed")} value={String(game.expandedAirportIds.length)} />
          </dl>
        </div>
      </section>
    </div>
  );
}

function RecommendedRoutesPanel({ opportunities, game }: { opportunities: ReturnType<typeof getRecommendedRouteOpportunities>; game: GameState }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-lg font-bold text-ink">{t("dashboard.recommendedRoutes")}</h3>
      <div className="mt-2 divide-y divide-slate-200">
        {opportunities.length === 0 ? (
          <p className="text-sm text-slate-500">{t("dashboard.noRecommendedRoutes")}</p>
        ) : (
          opportunities.map(({ route, evaluation }) => {
            const origin = airportsById[route.originAirportId];
            const destination = airportsById[route.destinationAirportId];
            const aircraft = evaluation.recommendedAircraftIds[0] ? opportunitiesAircraftLabel(evaluation.recommendedAircraftIds[0], game) : null;
            return (
              <div key={route.id} className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-lg font-semibold text-ink">
                    {origin.iata}<span aria-hidden="true"> – </span><span className="sr-only"> to </span>{destination.iata}
                  </p>
                  <span className={`rounded px-2 py-1 text-xs font-black ${gradeClass(evaluation.overallGrade)}`}>{evaluation.overallGrade} / {evaluation.overallScore}</span>
                </div>
                <p className="mt-1 text-sm font-bold text-mint">{formatGBP.format(evaluation.estimatedWeeklyRevenue)}{t("dashboard.perWeek")}</p>
                <p className="text-xs font-semibold text-slate-500">{t("routeEvaluation.bestAircraft")}: {aircraft ?? t("routeEvaluation.noSuitableAircraft")}</p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function opportunitiesAircraftLabel(aircraftId: string, game: GameState) {
  const aircraft = game.fleet.find((item) => item.id === aircraftId);
  const model = aircraft ? aircraftById[aircraft.modelId] : null;
  return aircraft && model ? `${aircraft.registration} ${model.model}` : null;
}

function gradeClass(grade: RouteGrade) {
  if (grade === "A+" || grade === "A") return "bg-mint/15 text-mint";
  if (grade === "B") return "bg-sky-100 text-sky-700";
  if (grade === "C") return "bg-amber-100 text-amber-700";
  return "bg-coral/10 text-coral";
}

function Figure({ label, value, tone, wide = false }: { label: string; value: string; tone?: "good" | "bad"; wide?: boolean }) {
  return (
    <div className={wide ? "is-wide" : undefined}>
      <dt>{label}</dt>
      <dd className={tone === "bad" ? "text-coral" : tone === "good" ? "text-mint" : undefined}>{value}</dd>
    </div>
  );
}

function Ledger({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}
