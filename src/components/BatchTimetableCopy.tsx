"use client";

import { Check, Copy, Eye } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "@/i18n";
import { copyWeeklySchedules } from "@/lib/scheduleActions";
import { formatScheduleFlightNumbers } from "@/lib/schedule";
import { useGameStore } from "@/store/gameStore";
import type { GameState } from "@/types/game";

export function BatchTimetableCopy({ game }: { game: GameState }) {
  const { t } = useTranslation();
  const copy = useGameStore((state) => state.copyTimetables);
  const [sourceId, setSourceId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [offset, setOffset] = useState(30);
  const [preview, setPreview] = useState<ReturnType<typeof copyWeeklySchedules>["outcomes"] | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const schedules = game.fleet.flatMap((aircraft) => aircraft.weeklySchedules.map((schedule) => ({ aircraft, schedule })));
  const source = schedules.find((value) => value.schedule.id === sourceId);
  const eligible = source ? game.fleet.filter((aircraft) => aircraft.id !== source.aircraft.id && aircraft.homeBaseAirportId === source.aircraft.homeBaseAirportId) : [];
  function invalidate() { setPreview(null); setConfirmed(false); }
  if (!schedules.length) return null;
  return <details className="border-y border-slate-200 bg-white px-4 py-3">
    <summary className="cursor-pointer text-sm font-bold text-jet"><Copy className="mr-2 inline" size={17} />{t("market.copyTimetable")}</summary>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-bold">{t("market.source")}<select value={sourceId} onChange={(event) => { setSourceId(event.target.value); setSelected([]); invalidate(); }}
        className="mt-1 w-full rounded-md border border-slate-300 p-2"><option value="">{t("market.source")}</option>
        {schedules.map(({ aircraft, schedule }) => <option key={schedule.id} value={schedule.id}>{aircraft.registration} / {formatScheduleFlightNumbers(schedule)}</option>)}
      </select></label>
      <label className="text-sm font-bold">{t("market.spacing")}<input type="number" min={0} max={1440} step={5} value={offset}
        onChange={(event) => { setOffset(event.target.valueAsNumber); invalidate(); }} className="mt-1 w-full rounded-md border border-slate-300 p-2" /></label>
    </div>
    {source && <fieldset className="mt-3"><legend className="text-sm font-bold">{t("market.targets")}</legend>
      {!eligible.length && <p className="text-sm text-slate-500">{t("market.noTargets")}</p>}
      <div className="mt-2 grid max-h-52 gap-2 overflow-y-auto sm:grid-cols-3">{eligible.map((aircraft) => <label key={aircraft.id} className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={selected.includes(aircraft.id)} onChange={() => { setSelected(selected.includes(aircraft.id) ? selected.filter((id) => id !== aircraft.id) : [...selected, aircraft.id]); invalidate(); }} />{aircraft.registration}
      </label>)}</div>
    </fieldset>}
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" disabled={!selected.length || !Number.isFinite(offset) || offset < 0 || offset > 1440 || offset % 5 !== 0}
        onClick={() => { setPreview(copyWeeklySchedules(game, sourceId, selected, offset).outcomes); setConfirmed(false); }} className="flex min-h-10 items-center gap-2 rounded-md bg-slate-100 px-3 text-sm font-bold disabled:opacity-40"><Eye size={16} />{t("market.preview")}</button>
      {preview && !confirmed && <button type="button" disabled={!preview.some((row) => row.ok)} onClick={() => {
        const result = copy(sourceId, selected, offset, preview.filter((row) => row.ok).map((row) => row.aircraftId));
        setPreview(result.outcomes); setConfirmed(true);
      }} className="flex min-h-10 items-center gap-2 rounded-md bg-jet px-3 text-sm font-bold text-white disabled:opacity-40"><Check size={16} />{t("market.copyValid")}</button>}
    </div>
    {preview && <div className="mt-3 divide-y divide-slate-200">{preview.map((row) => <div key={row.aircraftId} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
      <span className="font-bold">{game.fleet.find((aircraft) => aircraft.id === row.aircraftId)?.registration} {row.departure} UTC / {row.flights}</span>
      <span className={row.ok ? "text-mint" : "text-coral"}>{row.ok ? t(confirmed ? "market.applied" : "market.valid") : row.message}</span>
    </div>)}</div>}
  </details>;
}
