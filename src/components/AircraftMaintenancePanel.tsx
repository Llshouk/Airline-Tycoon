"use client";

import { Wrench } from "lucide-react";
import { useState } from "react";
import { aircraftById } from "@/data/aircraft";
import { useTranslation } from "@/i18n";
import { aircraftAgeYears, aircraftReliability, getMaintenanceStatus, MAINTENANCE_RULES, normalizeAircraftLifecycle, quoteMaintenance } from "@/lib/aircraftMaintenance";
import { canAfford } from "@/lib/cash";
import { formatGBP } from "@/lib/format";
import { useGameStore } from "@/store/gameStore";
import type { AircraftInstance, GameState, MaintenanceKind } from "@/types/game";

export function AircraftMaintenancePanel({ aircraft, game }: { aircraft: AircraftInstance; game: GameState }) {
  const { t, language } = useTranslation();
  const startMaintenance = useGameStore((state) => state.startAircraftMaintenance);
  const [kind, setKind] = useState<MaintenanceKind>("service");
  const [error, setError] = useState<string | null>(null);
  const lifecycle = normalizeAircraftLifecycle(aircraft, game.currentGameTimeMs);
  const status = getMaintenanceStatus(lifecycle, game.currentGameTimeMs);
  const quote = quoteMaintenance(aircraftById[aircraft.modelId], lifecycle, kind);
  const task = lifecycle.maintenance;
  const finishTime = task?.completesGameTimeMs ?? game.currentGameTimeMs + quote.durationMs;
  const affectedFlights = aircraft.schedule.filter((item) => item.status === "scheduled" &&
    (item.scheduledDepartureGameTime ?? item.departureGameTime) < finishTime).length;
  const blocked = aircraft.status === "in-flight" ? "airborne" : task ? "busy" :
    !canAfford(game, quote.cashCost) ? "cash" : game.gameStatus !== "active" ? "noGame" : null;
  const operationalWarnings = aircraft.schedule.filter((item) => item.status !== "completed" &&
    (item.operationalStatus === "grounded" || (item.technicalDelayMinutes ?? 0) > 0 || (item.maintenanceDelayMinutes ?? 0) > 0)).slice(0, 3);
  const formatTime = (time: number) => new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC"
  }).format(new Date(time));

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
      {task ? (
        <div className="mt-4 border-l-2 border-coral pl-3 text-sm">
          <p className="font-bold text-ink">{t(`maintenance.${task.kind}`)}</p>
          <p>{t("maintenance.completes")}: {formatTime(task.completesGameTimeMs)} UTC</p>
          <progress className="mt-2 h-2 w-full accent-emerald-600" max={task.completesGameTimeMs - task.startedGameTimeMs}
            value={Math.max(0, game.currentGameTimeMs - task.startedGameTimeMs)} aria-label={t("maintenance.progress")} />
        </div>
      ) : (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <fieldset className="mb-3 flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold text-ink">
            <legend className="sr-only">{t("maintenance.type")}</legend>
            {(["inspection", "service"] as const).map((option) => (
              <label key={option} className="flex items-center gap-2">
                <input type="radio" name={`maintenance-${aircraft.id}`} checked={kind === option}
                  onChange={() => { setKind(option); setError(null); }} className="accent-emerald-600" />
                {t(`maintenance.${option}`)}
              </label>
            ))}
          </fieldset>
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
            const result = startMaintenance(aircraft.id, kind);
            setError(result.ok ? null : t(`maintenance.error.${result.error ?? "missing"}`));
          }} className="mt-3 flex min-h-10 items-center gap-2 rounded-md bg-jet px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
            <Wrench size={16} />{t("maintenance.start")}
          </button>
          {blocked ? <p className="mt-2 text-sm text-slate-500">{t(`maintenance.error.${blocked}`)}</p> : null}
        </div>
      )}
      {affectedFlights > 0 ? <p className="mt-3 text-sm font-semibold text-coral">{t("maintenance.affectedFlights")}: {affectedFlights}. {t("maintenance.scheduleRetained")}</p> : null}
      {operationalWarnings.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs font-semibold text-coral">
          {operationalWarnings.map((item) => <li key={item.id}>
            {item.flightNumber ?? aircraft.registration}: {item.operationalStatus === "grounded" ? t("maintenance.status.grounded") :
              (item.technicalDelayMinutes ?? 0) > 0 ? `${t("maintenance.technicalDelay")} ${item.technicalDelayMinutes} ${t("maintenance.minuteUnit")}` : t("maintenance.maintenanceDelay")}
          </li>)}
        </ul>
      ) : null}
      {error ? <p role="alert" className="mt-2 text-sm font-bold text-coral">{error}</p> : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className="break-words font-bold text-ink">{value}</dd></div>;
}
