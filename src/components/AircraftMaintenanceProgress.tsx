"use client";

import { airportsById } from "@/data/airports";
import { useTranslation } from "@/i18n";
import { nextPostMaintenanceFlight } from "@/lib/homeMaintenance";
import type { AircraftInstance, GameState } from "@/types/game";

export function AircraftMaintenanceProgress({ aircraft, game, compact = false }: {
  aircraft: AircraftInstance; game: GameState; compact?: boolean;
}) {
  const { t, language } = useTranslation();
  const lifecycle = aircraft.lifecycle;
  const task = lifecycle?.maintenance;
  const plan = lifecycle?.reservation;
  const finished = lifecycle?.lastMaintenance;
  if (!task && !plan && (!finished || compact)) return null;
  const now = game.currentGameTimeMs;
  const percent = task ? Math.max(0, Math.min(100, Math.floor((now - task.startedGameTimeMs) /
    (task.completesGameTimeMs - task.startedGameTimeMs) * 100))) : plan ? 0 : 100;
  const remaining = Math.max(0, Math.ceil(((task?.completesGameTimeMs ?? now) - now) / 60000));
  const anchor = aircraft.schedule.find((flight) => flight.id === plan?.afterFlightId);
  const home = airportsById[aircraft.homeBaseAirportId]?.iata ?? aircraft.homeBaseAirportId;
  const next = nextPostMaintenanceFlight(aircraft, now);
  const atBase = aircraft.status !== "in-flight" && aircraft.currentAirportId === aircraft.homeBaseAirportId;
  const label = task ? t("maintenance.status.maintenance") : plan?.error === "cash" && plan.mode === "home" ? t("maintenance.waitingCash")
    : plan?.state === "blocked" ? t("maintenance.blocked") : plan?.mode === "home" ? t(atBase ? "maintenance.waitingBase" : "maintenance.homeRequested")
    : plan ? t("maintenance.reserved") : t(lifecycle?.recovery ? "maintenance.waitingFlight" : "maintenance.finished");
  const time = (value: number) => new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    timeZone: "UTC", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(value) + " UTC";
  return <span className={`block min-w-0 ${compact ? "mt-2 max-w-48 text-xs" : "my-4 border-y border-slate-200 py-3 text-sm"}`}
    data-testid={`maintenance-progress-${aircraft.id}`}>
    <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-bold text-jet">
      <span className="min-w-0 break-words">{label}</span><span className="whitespace-nowrap">{percent}%</span>
    </span>
    <progress max={100} value={percent} aria-label={`${t("maintenance.progress")} ${aircraft.registration}`}
      className="mt-2 block h-2 w-full accent-emerald-600" />
    {!compact ? <>
      {task ? <span className="mt-2 block text-slate-600">{t("maintenance.remaining")}: {Math.floor(remaining / 60)} {t("maintenance.hourUnit")} {remaining % 60} {t("maintenance.minuteUnit")}
        <span className="mt-1 block">{t("maintenance.completes")}: {time(task.completesGameTimeMs)}</span></span>
        : plan?.mode === "home" ? <span className="mt-2 block text-slate-600">{home}
          {anchor ? <span className="mt-1 block">{anchor.isMaintenanceFerry ? t("maintenance.ferry") : anchor.flightNumber ?? anchor.id} / {t("maintenance.starts")}: {time(anchor.readyGameTime)}</span> : null}
        </span> : finished && !plan ? <span className="mt-2 block text-slate-600">{t("maintenance.completes")}: {time(finished.completesGameTimeMs)}</span> : null}
      {plan?.error && plan.error !== "cash" ? <span role="alert" className="mt-2 block text-coral">{t(`maintenance.error.${plan.error}`)}</span> : null}
      {(task || (!plan && lifecycle?.recovery)) ? <span className="mt-2 block text-slate-600">{t("maintenance.resume")}: {next ?
        `${next.flightNumber ?? next.id} / ${time(next.departureGameTime)}` : t("maintenance.noResume")}</span> : null}
    </> : null}
  </span>;
}
