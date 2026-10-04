"use client";

import { ArrowRight, AlertTriangle } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "@/i18n";
import { FLEET_ALERT_FILTERS, fleetAlerts } from "@/lib/fleetAlerts";
import { formatGBP } from "@/lib/format";
import type { GameState } from "@/types/game";

export function FleetAlerts({ game, onOpenAircraft }: { game: GameState; onOpenAircraft: (id: string) => void }) {
  const { t } = useTranslation();
  const alerts = useMemo(() => fleetAlerts(game), [game]);
  const byId = new Map(game.fleet.map((aircraft) => [aircraft.id, aircraft]));
  const exceptions = alerts.filter((alert) => alert.kinds.some((kind) => kind !== "arranged"))
    .sort((a, b) => Number(b.kinds.includes("urgent")) - Number(a.kinds.includes("urgent")));
  return (
    <section className="border-y border-slate-200 bg-white py-4">
      <h3 className="flex items-center gap-2 font-bold text-ink"><AlertTriangle size={18} className="text-coral" />{t("alerts.title")}</h3>
      <div className="my-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {FLEET_ALERT_FILTERS.filter((key) => key !== "all").map((key) =>
          <span key={key} className={key === "urgent" ? "font-bold text-coral" : "text-slate-600"}>
            {t(`alerts.${key}`)}: {alerts.filter((alert) => alert.kinds.includes(key)).length}
          </span>)}
      </div>
      {!exceptions.length ? <p className="text-sm text-slate-500">{t("alerts.clear")}</p> :
        <ul className="divide-y divide-slate-100">
          {exceptions.slice(0, 8).map((alert) => <li key={alert.aircraftId}>
            <button type="button" onClick={() => onOpenAircraft(alert.aircraftId)}
              className="flex min-h-12 w-full items-center justify-between gap-3 py-2 text-left hover:bg-runway">
              <span className="min-w-0">
                <span className="font-bold text-ink">{byId.get(alert.aircraftId)?.registration}</span>
                <span className="ml-3 text-sm text-slate-600">{alert.kinds.map((kind) => t(`alerts.${kind}`)).join(" / ")}</span>
                {byId.get(alert.aircraftId)?.lifecycle?.reservation?.error ? <span className="block text-xs text-coral">
                  {t(`maintenance.error.${byId.get(alert.aircraftId)!.lifecycle!.reservation!.error!}`)}
                </span> : null}
                {alert.kinds.includes("loss") ? <span className="block text-xs text-coral">{t("alerts.recent")}: {formatGBP.format(alert.recentProfit)} · {alert.recentFlights} {t("finance.completedFlights")}</span> : null}
              </span>
              <ArrowRight size={17} className="shrink-0 text-jet" />
            </button>
          </li>)}
        </ul>}
      {exceptions.length > 8 ? <button type="button" onClick={() => onOpenAircraft("")}
        className="mt-2 flex items-center gap-2 text-sm font-bold text-jet">{t("alerts.viewFleet")} ({exceptions.length})<ArrowRight size={16} /></button> : null}
    </section>
  );
}
