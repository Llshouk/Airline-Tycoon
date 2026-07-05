"use client";

import { ChevronDown, ChevronRight, Plane } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AircraftDetailPanel } from "@/components/AircraftDetailPanel";
import { aircraftById } from "@/data/aircraft";
import { airportsById } from "@/data/airports";
import { useTranslation } from "@/i18n";
import { useGameStore } from "@/store/gameStore";
import type { AircraftInstance } from "@/types/game";

export function FleetScreen() {
  const { t } = useTranslation();
  const game = useGameStore((state) => state.game);
  const [selectedAircraftId, setSelectedAircraftId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [baseFilter, setBaseFilter] = useState("all");
  const filteredFleet = useMemo(
    () => (game ? (baseFilter === "all" ? game.fleet : game.fleet.filter((aircraft) => aircraft.homeBaseAirportId === baseFilter)) : []),
    [baseFilter, game]
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
      {game.fleet.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-soft">
          <Plane className="mx-auto text-coral" size={36} />
          <p className="mt-3 font-bold text-ink">{t("fleet.empty")}</p>
          <p className="text-sm text-slate-500">Buy aircraft from the Aircraft Market to build your fleet.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
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
                      const model = aircraftById[aircraft.modelId];
                      const homeBase = airportsById[aircraft.homeBaseAirportId];
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
                            <span className="block truncate font-black text-ink">{model.model}</span>
                            <span className="block truncate text-xs font-semibold text-slate-500">
                              {aircraft.registration} {homeBase ? `- ${homeBase.iata}` : ""}
                            </span>
                          </span>
                          <span className="shrink-0 rounded-md bg-runway px-2 py-1 text-xs font-bold capitalize text-jet">{aircraft.status}</span>
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
