"use client";

import { X } from "lucide-react";
import { AircraftImage } from "@/components/AircraftImage";
import { aircraftById } from "@/data/aircraft";
import { airportsById } from "@/data/airports";
import { useTranslation } from "@/i18n";
import { estimateWeeklyScheduleFinancials } from "@/lib/economy";
import { formatGBP } from "@/lib/format";
import { weeklyScheduleLabel } from "@/lib/schedule";
import { dayOfWeekForGameTime, formatDuration, formatTimeOfDay } from "@/lib/time";
import type { AircraftInstance, DayOfWeek, FlightStatus, GameState, ScheduleItem } from "@/types/game";

const days = [
  { id: 0, key: "Monday" },
  { id: 1, key: "Tuesday" },
  { id: 2, key: "Wednesday" },
  { id: 3, key: "Thursday" },
  { id: 4, key: "Friday" },
  { id: 5, key: "Saturday" },
  { id: 6, key: "Sunday" }
] satisfies { id: DayOfWeek; key: string }[];

export function AircraftDetailPanel({
  aircraft,
  game,
  onClose
}: {
  aircraft: AircraftInstance;
  game: GameState;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const model = aircraftById[aircraft.modelId];
  const airport = airportsById[aircraft.currentAirportId];
  const totalProfit = game.flightLog
    .filter((entry) => entry.aircraftId === aircraft.id)
    .reduce((sum, entry) => sum + entry.profit, 0);

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-ink/35 p-4">
      <section className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-lg border border-slate-200 bg-white shadow-soft">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-coral">{t("detail.title")}</p>
            <h3 className="text-xl font-black text-ink">
              {aircraft.registration} - {model.manufacturer} {model.model}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="flex h-9 w-9 items-center justify-center rounded-md bg-runway text-jet transition hover:bg-slate-200"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-4">
            <AircraftImage model={model} className="h-40" />
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Info label={t("detail.location")} value={airport.iata} />
              <Info label={t("detail.status")} value={statusLabel(aircraft.status, t)} />
              <Info label={t("detail.totalFlights")} value={String(aircraft.totalFlights)} />
              <Info label={t("detail.totalRevenue")} value={formatGBP.format(aircraft.totalRevenue)} />
              <Info label={t("detail.totalProfit")} value={formatGBP.format(totalProfit)} />
              <Info label="Cargo" value={`${aircraft.cargoTransportedTons.toFixed(1)} t`} />
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="mb-2 text-sm font-black text-ink">{t("detail.cabin")}</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Info label={t("fleet.firstClass")} value={String(aircraft.cabinLayout.first)} />
                <Info label={t("fleet.business")} value={String(aircraft.cabinLayout.business)} />
                <Info label={t("fleet.premiumEconomy")} value={String(aircraft.cabinLayout.premiumEconomy)} />
                <Info label={t("fleet.economy")} value={String(aircraft.cabinLayout.economy)} />
                <Info label={t("fleet.cargo")} value={`${aircraft.cabinLayout.cargoTons} t`} />
              </div>
            </div>
          </aside>

          <div>
            <h4 className="mb-3 font-black text-ink">{t("detail.weeklyTimetable")}</h4>
            {aircraft.weeklySchedules.length > 0 ? (
              <div className="mb-4 grid gap-2 md:grid-cols-2">
                {aircraft.weeklySchedules.map((schedule) => {
                  const route = game.routes.find((item) => item.id === schedule.routeId);
                  if (!route) return null;
                  const estimate = estimateWeeklyScheduleFinancials(schedule, route, model, aircraft);
                  return (
                    <div key={schedule.id} className="rounded-md border border-slate-200 bg-runway p-3">
                      <p className="font-bold text-ink">
                        {weeklyScheduleLabel(schedule)} {airportsById[route.originAirportId].iata}-{airportsById[route.destinationAirportId].iata}
                      </p>
                      <p className="text-sm text-slate-500">
                        Weekly revenue {formatGBP.format(estimate.weeklyRevenue)} | Profit {formatGBP.format(estimate.weeklyProfit)}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : null}
            <div className="grid gap-3">
              {days.map((day) => {
                const items = aircraft.schedule
                  .filter((item) => (item.operatingDay ?? dayOfWeekForGameTime(item.departureGameTime)) === day.id)
                  .sort((a, b) => a.departureGameTime - b.departureGameTime);
                return (
                  <section key={day.id} className="rounded-md border border-slate-200">
                    <div className="border-b border-slate-200 bg-runway px-3 py-2 font-black text-ink">{day.key}</div>
                    <div className="grid gap-2 p-3">
                      {items.length === 0 ? (
                        <p className="text-sm text-slate-500">{t("detail.noSchedule")}</p>
                      ) : (
                        items.map((item, index) => (
                          <FlightRow
                            key={item.id}
                            item={item}
                            previous={items[index - 1]}
                            modelTurnaroundMinutes={model.turnaroundMinutes}
                          />
                        ))
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function FlightRow({
  item,
  previous,
  modelTurnaroundMinutes
}: {
  item: ScheduleItem;
  previous?: ScheduleItem;
  modelTurnaroundMinutes: number;
}) {
  const { t } = useTranslation();
  const conflict = Boolean(previous && item.departureGameTime < previous.readyGameTime);
  const routeDirection = item.legType === "return" ? t("detail.return") : t("detail.outbound");
  return (
    <div className={`rounded-md border p-3 ${conflict ? "border-coral bg-coral/10" : "border-slate-200 bg-white"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-ink">
          {item.flightNumber ? `${item.flightNumber} ` : ""}
          {airportsById[item.originAirportId].iata} to {airportsById[item.destinationAirportId].iata}
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge status={conflict ? "conflict" : item.status} />
          <span className="rounded-md bg-runway px-2 py-1 text-xs font-bold text-jet">{routeDirection}</span>
        </div>
      </div>
      <div className="mt-2 grid gap-2 text-sm md:grid-cols-4">
        <Info label="Departure" value={formatTimeOfDay(item.departureGameTime)} />
        <Info label="Arrival" value={formatTimeOfDay(item.arrivalGameTime)} />
        <Info label={t("detail.duration")} value={formatDuration(item.arrivalGameTime - item.departureGameTime)} />
        <Info label={t("detail.turnaround")} value={`${modelTurnaroundMinutes}m`} />
      </div>
    </div>
  );
}

function Badge({ status }: { status: FlightStatus | "conflict" }) {
  const { t } = useTranslation();
  const color =
    status === "conflict"
      ? "bg-coral/10 text-coral"
      : status === "in-flight"
        ? "bg-sky/20 text-jet"
        : status === "completed"
          ? "bg-mint/15 text-mint"
          : "bg-runway text-jet";
  return <span className={`rounded-md px-2 py-1 text-xs font-black ${color}`}>{statusLabel(status, t)}</span>;
}

function statusLabel(status: FlightStatus | AircraftInstance["status"] | "conflict", t: ReturnType<typeof useTranslation>["t"]) {
  if (status === "in-flight") return t("status.in-flight");
  if (status === "completed") return t("status.completed");
  if (status === "conflict") return t("status.conflict");
  return t("status.scheduled");
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-runway px-3 py-2">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="truncate font-bold text-ink">{value}</p>
    </div>
  );
}
