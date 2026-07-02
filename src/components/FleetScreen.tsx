"use client";

import { CalendarClock, ChevronDown, ChevronRight, Pencil, Plane } from "lucide-react";
import { useMemo, useState } from "react";
import { AircraftDetailPanel } from "@/components/AircraftDetailPanel";
import { AircraftImage } from "@/components/AircraftImage";
import { aircraftById } from "@/data/aircraft";
import { airportsById } from "@/data/airports";
import { useTranslation } from "@/i18n";
import { estimateWeeklyScheduleFinancials } from "@/lib/economy";
import { formatGBP, formatNumber } from "@/lib/format";
import { formatRouteCode, formatScheduleFlightNumbers } from "@/lib/schedule";
import { useGameStore } from "@/store/gameStore";
import type { AircraftInstance, FlightLogEntry } from "@/types/game";

export function FleetScreen() {
  const { t } = useTranslation();
  const game = useGameStore((state) => state.game);
  const updateAircraftRegistration = useGameStore((state) => state.updateAircraftRegistration);
  const [selectedAircraftId, setSelectedAircraftId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [editingAircraftId, setEditingAircraftId] = useState<string | null>(null);
  const [registrationDraft, setRegistrationDraft] = useState("");
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const groups = useMemo(() => (game ? groupFleetByModel(game.fleet, game.flightLog) : []), [game]);

  if (!game) return null;
  const selectedAircraft = selectedAircraftId ? game.fleet.find((aircraft) => aircraft.id === selectedAircraftId) : null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-black text-ink">{t("fleet.title")}</h2>
        <p className="text-slate-600">Owned aircraft, assigned services, utilization, and lifetime operating results.</p>
      </div>
      {game.fleet.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-soft">
          <Plane className="mx-auto text-coral" size={36} />
          <p className="mt-3 font-bold text-ink">{t("fleet.empty")}</p>
          <p className="text-sm text-slate-500">Buy aircraft from the Aircraft Market to build your fleet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const isExpanded = expandedGroups[group.modelId] ?? true;
            const Icon = isExpanded ? ChevronDown : ChevronRight;
            return (
              <article key={group.modelId} className="rounded-lg border border-slate-200 bg-white p-3 shadow-soft transition duration-200 hover:border-mint">
                <button
                  type="button"
                  onClick={() => setExpandedGroups((current) => ({ ...current, [group.modelId]: !isExpanded }))}
                  className="flex w-full flex-wrap items-start justify-between gap-3 text-left"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <AircraftImage model={group.model} className="h-16 w-28 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-normal text-coral">{group.model.manufacturer}</p>
                      <h3 className="flex items-center gap-2 text-base font-black text-ink">
                        <Icon size={18} />
                        {group.model.model} x {group.aircraft.length}
                      </h3>
                      <p className="text-xs text-slate-600">Visual grouping only; each aircraft record remains separate.</p>
                    </div>
                  </div>
                  <span className="rounded-md bg-runway px-2 py-1 text-xs font-bold text-jet">{isExpanded ? "Collapse" : "Expand"}</span>
                </button>
                <div className="mt-3 grid grid-cols-2 gap-1.5 text-xs md:grid-cols-4">
                  <Spec label="Owned" value={String(group.aircraft.length)} />
                  <Spec label="Active aircraft" value={String(group.activeCount)} />
                  <Spec label="In-flight aircraft" value={String(group.inFlightCount)} />
                  <Spec label="Total seats" value={formatNumber.format(group.totalSeats)} />
                  <Spec label="Total cargo" value={`${group.totalCargo.toFixed(1)} t`} />
                  <Spec label="Average utilization" value={`${group.averageUtilization}%`} />
                  <Spec label={t("detail.totalRevenue")} value={formatGBP.format(group.totalRevenue)} />
                  <Spec label={t("detail.totalProfit")} value={formatGBP.format(group.totalProfit)} />
                </div>

                {isExpanded ? (
                  <div className="mt-3 grid gap-2 lg:grid-cols-2">
                    {group.aircraft.map((aircraft) => {
                      const model = aircraftById[aircraft.modelId];
                      const airport = airportsById[aircraft.currentAirportId];
                      const weeklyFlights = aircraft.weeklySchedules.reduce((sum, schedule) => sum + schedule.daysOfWeek.length * (schedule.isRoundTrip ? 2 : 1), 0);
                      const weeklyBlockMinutes = aircraft.weeklySchedules.reduce((sum, schedule) => sum + schedule.daysOfWeek.length * schedule.blockMinutes, 0);
                      const utilization = Math.round((weeklyBlockMinutes / (7 * 24 * 60)) * 100);
                      const totalProfit = game.flightLog.filter((entry) => entry.aircraftId === aircraft.id).reduce((sum, entry) => sum + entry.profit, 0);
                      const isEditing = editingAircraftId === aircraft.id;
                      return (
                        <div key={aircraft.id} className="rounded-md border border-slate-200 p-2.5">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                              <AircraftImage model={model} className="h-14 w-24 shrink-0" />
                              <div>
                                {isEditing ? (
                                  <div>
                                    <input
                                      value={registrationDraft}
                                      onChange={(event) => setRegistrationDraft(event.target.value.toUpperCase())}
                                      className="w-36 rounded-md border border-slate-300 px-2 py-1 font-black text-ink outline-none focus:border-jet focus:ring-2 focus:ring-jet/20"
                                    />
                                    {registrationError ? <p className="mt-1 text-xs font-bold text-coral">{registrationError}</p> : null}
                                  </div>
                                ) : (
                                  <h4 className="text-base font-black text-ink">{aircraft.registration}</h4>
                                )}
                                <p className="text-sm text-slate-600">{model.model}</p>
                              </div>
                            </div>
                            <span className="rounded-md bg-runway px-2 py-1 text-xs font-bold capitalize text-jet">{aircraft.status}</span>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs">
                            <Spec label={t("fleet.airport")} value={airport.iata} />
                            <Spec label="Cabin" value={`${aircraft.cabinLayout.first}F/${aircraft.cabinLayout.business}J/${aircraft.cabinLayout.premiumEconomy}W/${aircraft.cabinLayout.economy}Y`} />
                            <Spec label={t("fleet.cargo")} value={`${aircraft.cabinLayout.cargoTons} t`} />
                            <Spec label="Weekly flights" value={String(weeklyFlights)} />
                            <Spec label="Weekly utilization" value={`${utilization}%`} />
                            <Spec label={t("detail.totalRevenue")} value={formatGBP.format(aircraft.totalRevenue)} />
                            <Spec label={t("detail.totalProfit")} value={formatGBP.format(totalProfit)} />
                          </div>
                          <div className="mt-2 rounded-md border border-slate-200 p-2">
                            <div className="mb-2 flex items-center gap-2">
                              <CalendarClock size={16} className="text-coral" />
                              <p className="font-bold text-ink">Assigned schedules</p>
                            </div>
                            {aircraft.weeklySchedules.length === 0 ? (
                              <p className="text-sm text-slate-500">No weekly services assigned.</p>
                            ) : (
                              <div className="space-y-2">
                                {aircraft.weeklySchedules.map((schedule) => {
                                  const route = game.routes.find((item) => item.id === schedule.routeId);
                                  if (!route) return null;
                                  const estimate = estimateWeeklyScheduleFinancials(schedule, route, model, aircraft, game.difficultyConfig);
                                  return (
                                    <div key={schedule.id} className="rounded-md bg-runway px-3 py-2 text-sm">
                                      <p className="font-bold text-ink">
                                        <span className="block truncate whitespace-nowrap tabular-nums">
                                          {formatScheduleFlightNumbers(schedule)} {formatRouteCode(route)}
                                        </span>
                                      </p>
                                      <p className="text-slate-500">
                                        {schedule.daysOfWeek.length} days | {formatGBP.format(estimate.weeklyProfit)} weekly profit
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedAircraftId(aircraft.id)}
                              className="rounded-md bg-jet px-3 py-2 text-sm font-bold text-white hover:bg-jet/90"
                            >
                              {t("fleet.viewDetails")}
                            </button>
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const result = updateAircraftRegistration(aircraft.id, registrationDraft);
                                    if (!result.ok) {
                                      setRegistrationError(result.message);
                                      return;
                                    }
                                    setEditingAircraftId(null);
                                    setRegistrationError(null);
                                  }}
                                  className="rounded-md bg-coral px-3 py-2 text-sm font-bold text-white hover:bg-coral/90"
                                >
                                  Save Registration
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingAircraftId(null);
                                    setRegistrationError(null);
                                  }}
                                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingAircraftId(aircraft.id);
                                  setRegistrationDraft(aircraft.registration);
                                  setRegistrationError(null);
                                }}
                                className="flex items-center gap-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
                              >
                                <Pencil size={14} />
                                Edit Registration
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
      {selectedAircraft ? <AircraftDetailPanel aircraft={selectedAircraft} game={game} onClose={() => setSelectedAircraftId(null)} /> : null}
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-runway px-3 py-2">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="truncate font-bold text-ink">{value}</p>
    </div>
  );
}

function groupFleetByModel(fleet: AircraftInstance[], flightLog: FlightLogEntry[]) {
  const groups = new Map<string, AircraftInstance[]>();
  fleet.forEach((aircraft) => {
    groups.set(aircraft.modelId, [...(groups.get(aircraft.modelId) ?? []), aircraft]);
  });

  return Array.from(groups.entries())
    .map(([modelId, aircraft]) => {
      const model = aircraftById[modelId];
      const totalSeats = aircraft.reduce(
        (sum, item) => sum + item.cabinLayout.first + item.cabinLayout.business + item.cabinLayout.premiumEconomy + item.cabinLayout.economy,
        0
      );
      const totalCargo = aircraft.reduce((sum, item) => sum + item.cabinLayout.cargoTons, 0);
      const totalRevenue = aircraft.reduce((sum, item) => sum + item.totalRevenue, 0);
      const aircraftIds = new Set(aircraft.map((item) => item.id));
      const totalProfit = flightLog
        .filter((entry) => aircraftIds.has(entry.aircraftId))
        .reduce((sum, entry) => sum + entry.profit, 0);
      const totalUtilization = aircraft.reduce((sum, item) => {
        const weeklyBlockMinutes = item.weeklySchedules.reduce((scheduleSum, schedule) => scheduleSum + schedule.daysOfWeek.length * schedule.blockMinutes, 0);
        return sum + Math.round((weeklyBlockMinutes / (7 * 24 * 60)) * 100);
      }, 0);

      return {
        modelId,
        model,
        aircraft,
        totalSeats,
        totalCargo,
        totalRevenue,
        totalProfit,
        activeCount: aircraft.filter((item) => item.status !== "idle").length,
        inFlightCount: aircraft.filter((item) => item.status === "in-flight").length,
        averageUtilization: aircraft.length > 0 ? Math.round(totalUtilization / aircraft.length) : 0
      };
    })
    .filter((group) => Boolean(group.model))
    .sort((a, b) => `${a.model.manufacturer} ${a.model.model}`.localeCompare(`${b.model.manufacturer} ${b.model.model}`));
}
