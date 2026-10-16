"use client";

import { Wrench } from "lucide-react";
import { useState } from "react";
import { MaintenancePlanner } from "@/components/MaintenancePlanner";
import { AircraftMaintenanceProgress } from "@/components/AircraftMaintenanceProgress";
import { aircraftById } from "@/data/aircraft";
import { useTranslation, type TranslationKey } from "@/i18n";
import { aircraftAgeYears, aircraftReliability, getMaintenanceStatus, MAINTENANCE_RULES, normalizeAircraftLifecycle, quoteMaintenance } from "@/lib/aircraftMaintenance";
import { formatGBP } from "@/lib/format";
import { useGameStore } from "@/store/gameStore";
import type { AircraftInstance, GameState } from "@/types/game";

export function AircraftMaintenancePanel({ aircraft, game }: { aircraft: AircraftInstance; game: GameState }) {
  const { t } = useTranslation();
  const cancelReservation = useGameStore((state) => state.cancelMaintenanceReservation);
  const requestFullMaintenance = useGameStore((state) => state.requestFullMaintenance);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [showPlanner, setShowPlanner] = useState(false);
  const lifecycle = normalizeAircraftLifecycle(aircraft, game.currentGameTimeMs);
  const status = getMaintenanceStatus(lifecycle, game.currentGameTimeMs);
  const quote = quoteMaintenance(aircraftById[aircraft.modelId], lifecycle, "service");
  const task = lifecycle.maintenance;
  const reservation = lifecycle.reservation;
  const affectedFlights = task ? aircraft.schedule.filter((item) => item.status === "cancelled" && item.cancellationReason === "maintenance" &&
    (item.scheduledDepartureGameTime ?? item.departureGameTime) >= task.startedGameTimeMs &&
    (item.scheduledDepartureGameTime ?? item.departureGameTime) < task.completesGameTimeMs).length : 0;
  const blocked = game.gameStatus !== "active" ? "noGame" : null;
  const operationalWarnings = aircraft.schedule.filter((item) => (item.status === "scheduled" || item.status === "in-flight") &&
    (item.operationalStatus === "grounded" || (item.technicalDelayMinutes ?? 0) > 0 || (item.maintenanceDelayMinutes ?? 0) > 0)).slice(0, 3);
  return (
    <section className="mb-4 border-y border-slate-200 py-4" aria-label={t("maintenance.title")}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 font-black text-ink"><Wrench size={17} />{t("maintenance.title")}</h4>
        <span className={`text-sm font-bold ${status === "healthy" ? "text-jet" : "text-coral"}`}>{t(`maintenance.status.${status}`)}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
        <Metric label={t("maintenance.age")} value={`${aircraftAgeYears(lifecycle, game.currentGameTimeMs).toFixed(2)} ${t("maintenance.years")}`} />
        <Metric label={t("maintenance.hours")} value={`${lifecycle.flightHours.toFixed(1)} ${t("maintenance.hourUnit")}`} />
        <Metric label={t("maintenance.cycles")} value={String(lifecycle.flightCycles)} />
        <Metric label={t("maintenance.condition")} value={`${lifecycle.condition.toFixed(1)}%`} />
        <Metric label={t("maintenance.reliability")} value={`${aircraftReliability(lifecycle, game.currentGameTimeMs).toFixed(1)}%`} />
        <Metric label={t("maintenance.reserve")} value={formatGBP.format(lifecycle.reserveBalance)} />
        <Metric label={t("maintenance.serviceHours")} value={`${lifecycle.hoursSinceService.toFixed(1)} / ${MAINTENANCE_RULES.serviceHours}`} />
        <Metric label={t("maintenance.serviceCycles")} value={`${lifecycle.cyclesSinceService} / ${MAINTENANCE_RULES.serviceCycles}`} />
        <Metric label={t("maintenance.totalCashCost")} value={formatGBP.format(lifecycle.totalMaintenanceCashCost)} />
      </dl>
      <AircraftMaintenanceProgress aircraft={aircraft} game={game} />
      {reservation ? (
        <div className="mt-4 border-l-2 border-coral pl-3 text-sm">
          {reservation.mode !== "home" ? <p>{aircraft.schedule.find((flight) => flight.id === reservation.afterFlightId)?.flightNumber ?? reservation.afterFlightId}</p> : null}
          <button type="button" onClick={() => cancelReservation(aircraft.id)} className="mt-2 rounded-md border border-slate-300 px-3 py-2 font-bold">
            {t("maintenance.cancelReservation")}
          </button>
        </div>
      ) : null}
      {!task && reservation?.mode !== "home" ? (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            <Metric label={t("maintenance.labour")} value={formatGBP.format(quote.labourCost)} />
            <Metric label={t("maintenance.parts")} value={formatGBP.format(quote.partsCost)} />
            <Metric label={t("maintenance.totalCost")} value={formatGBP.format(quote.totalCost)} />
            <Metric label={t("maintenance.reserveUsed")} value={formatGBP.format(quote.reserveUsed)} />
            <Metric label={t("maintenance.cashCost")} value={formatGBP.format(quote.cashCost)} />
            <Metric label={t("maintenance.duration")} value={`${quote.durationMs / 3_600_000} ${t("maintenance.hourUnit")}`} />
            <Metric label={t("maintenance.afterCondition")} value={`${quote.resultingCondition.toFixed(1)}%`} />
          </dl>
          <p className="mt-3 text-xs font-semibold text-slate-500">{t("maintenance.reserveNote")}</p>
          <button type="button" disabled={Boolean(blocked)} onClick={() => {
            const result = requestFullMaintenance([aircraft.id]);
            setRequestError(result.ok ? null : t(`maintenance.error.${result.error ?? "missing"}`));
          }}
            className="mt-3 flex min-h-10 items-center gap-2 rounded-md bg-jet px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
            <Wrench size={16} />{t("maintenance.fullAction")}
          </button>
          {!reservation ? <button type="button" disabled={Boolean(blocked)} onClick={() => setShowPlanner(true)}
            className="mt-2 min-h-10 px-3 text-sm font-bold text-slate-600 hover:bg-runway">{t("maintenance.inspection")}</button> : null}
          {requestError ? <p role="alert" className="mt-2 text-sm text-coral">{requestError}</p> : null}
          {blocked ? <p className="mt-2 text-sm text-slate-500">{t(`maintenance.error.${blocked}`)}</p> : null}
        </div>
      ) : null}
      {affectedFlights > 0 ? <p className="mt-3 text-sm font-semibold text-coral">{t("maintenance.affectedFlights")}: {affectedFlights}. {t("maintenance.scheduleRetained")}</p> : null}
      {operationalWarnings.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs font-semibold text-coral">
          {operationalWarnings.map((item) => <li key={item.id}>
            {item.flightNumber ?? aircraft.registration}: {item.operationalStatus === "grounded" ? t("maintenance.status.grounded") :
              (item.technicalDelayMinutes ?? 0) > 0 ? `${t("maintenance.technicalDelay")} ${item.technicalDelayMinutes} ${t("maintenance.minuteUnit")}` : t("maintenance.maintenanceDelay")}
          </li>)}
        </ul>
      ) : null}
      <ul className="mt-3 space-y-1 text-xs text-coral">
        {aircraft.schedule.filter((flight) => flight.status === "cancelled").slice(-5).map((flight) => <li key={flight.id}>
          {flight.flightNumber ?? flight.id}: {t("airport.cancelled")} - {t("maintenance.reason." + (flight.cancellationReason ?? "maintenance") as TranslationKey)}
        </li>)}
      </ul>
      {showPlanner ? <MaintenancePlanner aircraft={[aircraft]} game={game} initialKind="inspection" onClose={() => setShowPlanner(false)} /> : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className="break-words font-bold text-ink">{value}</dd></div>;
}
