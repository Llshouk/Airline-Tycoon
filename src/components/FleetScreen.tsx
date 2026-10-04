"use client";

import { ChevronDown, ChevronRight, Plane, Wrench } from "lucide-react";
import { MaintenancePlanner } from "@/components/MaintenancePlanner";
import { useEffect, useMemo, useState } from "react";
import { AircraftDetailPanel } from "@/components/AircraftDetailPanel";
import { aircraftById } from "@/data/aircraft";
import { airportsById } from "@/data/airports";
import { useTranslation } from "@/i18n";
import { useGameStore } from "@/store/gameStore";
import { getMaintenanceStatus, normalizeAircraftLifecycle } from "@/lib/aircraftMaintenance";
import { FLEET_ALERT_FILTERS, fleetAlerts, type FleetAlertFilter } from "@/lib/fleetAlerts";
import type { AircraftInstance } from "@/types/game";

export function FleetScreen({ initialSelectedAircraftId = null }: { initialSelectedAircraftId?: string | null }) {
  const { t } = useTranslation();
  const game = useGameStore((state) => state.game);
  const [selectedAircraftId, setSelectedAircraftId] = useState<string | null>(initialSelectedAircraftId);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [baseFilter, setBaseFilter] = useState("all");
  const [needsService, setNeedsService] = useState(false);
  const [conditionFilter, setConditionFilter] = useState<FleetAlertFilter>("all");
  const alerts = useMemo(() => game ? new Map(fleetAlerts(game).map((alert) => [alert.aircraftId, alert])) : new Map(), [game]);
  const [showPlanner, setShowPlanner] = useState(false);
  const filteredFleet = useMemo(
    () => (game ? game.fleet.filter((aircraft) => (baseFilter === "all" || aircraft.homeBaseAirportId === baseFilter) &&
      (conditionFilter === "all" || alerts.get(aircraft.id)?.kinds.includes(conditionFilter)) &&
      (!needsService || aircraft.lifecycle?.reservation || getMaintenanceStatus(normalizeAircraftLifecycle(aircraft, game.currentGameTimeMs), game.currentGameTimeMs) !== "healthy")) : []),
    [baseFilter, game, needsService, conditionFilter, alerts]
  );
  const groups = useMemo(() => groupFleetByModel(filteredFleet), [filteredFleet]);
  const selectedAircraft = game && selectedAircraftId ? game.fleet.find((aircraft) => aircraft.id === selectedAircraftId) : null;

  useEffect(() => {
    if (!selectedAircraftId) return;
    if (!filteredFleet.some((aircraft) => aircraft.id === selectedAircraftId)) setSelectedAircraftId(null);
  }, [filteredFleet, selectedAircraftId]);

  if (!game) return null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-black text-ink">{t("fleet.title")}</h2>
        <p className="text-slate-600">Owned aircraft, assigned services, utilization, and lifetime operating results.</p>
      </div>
      <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-soft">
        <label className="text-sm font-bold text-slate-600">
          {t("fleet.baseFilter")}
          <select
            value={baseFilter}
            onChange={(event) => {
              setBaseFilter(event.target.value);
              setSelectedAircraftId(null);
              setExpandedGroups({});
            }}
            className="ml-2 rounded-md border border-slate-300 bg-white px-3 py-2 font-bold text-jet"
          >
            <option value="all">{t("fleet.allBases")}</option>
            {game.baseAirports.map((airportId) => {
              const airport = airportsById[airportId];
              return airport ? (
                <option key={airportId} value={airportId}>
                  {airport.iata} {airport.city}
                </option>
              ) : null;
            })}
          </select>
        </label>
      </section>
      <div className="flex flex-wrap items-center gap-3 border-y border-slate-200 py-3">
        <label className="flex items-center gap-2 text-sm font-bold text-ink">
          {t("alerts.filter")}
          <select value={conditionFilter} onChange={(event) => setConditionFilter(event.target.value as FleetAlertFilter)}
            className="h-10 max-w-[220px] rounded-md border border-slate-300 bg-white px-2">
            {FLEET_ALERT_FILTERS.map((key) => <option key={key} value={key}>{t(`alerts.${key}`)}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm font-bold text-ink">
          <input type="checkbox" checked={needsService} onChange={(event) => setNeedsService(event.target.checked)} />
          {t("maintenance.needsService")}
        </label>
        <button type="button" disabled={!filteredFleet.length} onClick={() => setShowPlanner(true)}
          className="flex min-h-10 items-center gap-2 rounded-md bg-jet px-3 py-2 text-sm font-bold text-white disabled:opacity-40">
          <Wrench size={16} />{t("maintenance.batch")}
        </button>
      </div>
      {game.fleet.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-soft">
          <Plane className="mx-auto text-coral" size={36} />
          <p className="mt-3 font-bold text-ink">{t("fleet.empty")}</p>
          <p className="text-sm text-slate-500">Buy aircraft from the Aircraft Market to build your fleet.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
          {!filteredFleet.length ? <p className="py-5 text-sm text-slate-500">{t("alerts.empty")}</p> : null}
          {groups.map((group) => {
            const isExpanded = expandedGroups[group.modelId] ?? false;
            const Icon = isExpanded ? ChevronDown : ChevronRight;
            return (
              <article key={group.modelId} className="rounded-lg border border-slate-200 bg-white shadow-soft transition duration-200 hover:border-mint">
                <button
                  type="button"
                  onClick={() => setExpandedGroups((current) => ({ ...current, [group.modelId]: !isExpanded }))}
                  className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-normal text-coral">{group.model.manufacturer}</p>
                    <h3 className="flex items-center gap-2 text-base font-black text-ink">
                      <Icon size={18} />
                      {group.model.model} x {group.aircraft.length}
                    </h3>
                  </div>
                  <span className="rounded-md bg-runway px-2 py-1 text-xs font-bold text-jet">{isExpanded ? t("fleet.collapse") : t("fleet.expand")}</span>
                </button>

                {isExpanded ? (
                  <div className="border-t border-slate-100">
                    {group.aircraft.map((aircraft) => {
                      const homeBase = airportsById[aircraft.homeBaseAirportId];
                      const lifecycle = normalizeAircraftLifecycle(aircraft, game.currentGameTimeMs);
                      const maintenanceStatus = getMaintenanceStatus(lifecycle, game.currentGameTimeMs);
                      return (
                        <button
                          key={aircraft.id}
                          type="button"
                          onClick={() => setSelectedAircraftId(aircraft.id)}
                          className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-runway ${
                            selectedAircraftId === aircraft.id ? "bg-mint/10" : "bg-white"
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-black text-ink">
                              {aircraft.registration} {homeBase ? `- ${homeBase.iata}` : ""}
                            </span>
                            <span className="block truncate text-xs font-semibold text-slate-500">
                              {homeBase ? `${t("fleet.homeBase")}: ${homeBase.iata}` : t("fleet.homeBase")}
                            </span>
                          </span>
                          <span className="max-w-[60%] shrink-0 break-words text-right text-xs font-bold text-jet">
                            <span className="block">{aircraft.status === "maintenance" || aircraft.status === "grounded" ? t(`maintenance.status.${aircraft.status}`) : t(`status.${aircraft.status}`)}</span>
                            <span className={`mt-1 block ${maintenanceStatus === "healthy" ? "text-slate-500" : "text-coral"}`}>
                              {lifecycle.condition.toFixed(1)}% · {t(`maintenance.status.${maintenanceStatus}`)}
                            </span>
                            {lifecycle.reservation ? <span className="mt-1 block text-coral">
                              {t(lifecycle.reservation.state === "blocked" ? "maintenance.blocked" : "maintenance.reserved")}
                            </span> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </article>
            );
          })}
          </div>
          <aside className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm font-semibold text-slate-500 shadow-soft">
            {selectedAircraft ? (
              <div>
                <p className="text-xs font-black uppercase tracking-normal text-coral">{t("detail.title")}</p>
                <p className="mt-2 text-base font-black text-ink">{selectedAircraft.registration}</p>
                <p>{aircraftById[selectedAircraft.modelId].model}</p>
              </div>
            ) : (
              t("fleet.selectAircraftDetails")
            )}
          </aside>
        </div>
      )}
      {selectedAircraft ? <AircraftDetailPanel aircraft={selectedAircraft} game={game} onClose={() => setSelectedAircraftId(null)} /> : null}
      {showPlanner ? <MaintenancePlanner aircraft={filteredFleet} game={game} onClose={() => setShowPlanner(false)} /> : null}
    </div>
  );
}

function groupFleetByModel(fleet: AircraftInstance[]) {
  const groups = new Map<string, AircraftInstance[]>();
  fleet.forEach((aircraft) => {
    groups.set(aircraft.modelId, [...(groups.get(aircraft.modelId) ?? []), aircraft]);
  });

  return Array.from(groups.entries())
    .map(([modelId, aircraft]) => {
      const model = aircraftById[modelId];
      return {
        modelId,
        model,
        aircraft
      };
    })
    .filter((group) => Boolean(group.model))
    .sort((a, b) => `${a.model.manufacturer} ${a.model.model}`.localeCompare(`${b.model.manufacturer} ${b.model.model}`));
}
