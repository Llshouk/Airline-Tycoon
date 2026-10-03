"use client";

import { Check, Wrench, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { airportsById } from "@/data/airports";
import { useTranslation, type TranslationKey } from "@/i18n";
import { formatGBP } from "@/lib/format";
import { maintenanceAnchorFlights, maintenancePreview } from "@/lib/maintenancePlanning";
import { useGameStore } from "@/store/gameStore";
import type { AircraftInstance, GameState, MaintenanceKind } from "@/types/game";

export function MaintenancePlanner({ aircraft, game, initialKind = "service", onClose }: {
  aircraft: AircraftInstance[]; game: GameState; initialKind?: MaintenanceKind; onClose: () => void;
}) {
  const { t, language } = useTranslation();
  const reserve = useGameStore((state) => state.reserveAircraftMaintenance);
  const startNow = useGameStore((state) => state.startAircraftMaintenance);
  const [kind, setKind] = useState(initialKind);
  const [selection, setSelection] = useState<Record<string, string>>(() => aircraft.length === 1 ?
    { [aircraft[0].id]: defaultAnchor(aircraft[0], false) } : {});
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLElement>(null);
  const batch = aircraft.length > 1;
  const eligible = aircraft.filter((item) => !item.lifecycle?.maintenance && !item.lifecycle?.reservation &&
    (!batch || maintenanceAnchorFlights(item).length > 0));
  const selected = eligible.filter((item) => selection[item.id] !== undefined && selection[item.id] !== "");
  const previews = selected.map((item) => ({ aircraft: item,
    preview: maintenancePreview(item, kind, game.currentGameTimeMs, selection[item.id] === "now" ? undefined : selection[item.id]) }));
  const cash = previews.reduce((sum, item) => sum + (item.preview?.quote.cashCost ?? 0), 0);
  const cancelled = previews.flatMap((item) => (item.preview?.cancelled ?? []).map((flight) => ({ ...flight, aircraft: item.aircraft })));
  const formatTime = (time: number) => new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    timeZone: "UTC", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(time) + " UTC";

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);

  function confirm() {
    const result = selected.length === 1 && selection[selected[0].id] === "now"
      ? startNow(selected[0].id, kind)
      : reserve(selected.map((item) => ({ aircraftId: item.id, kind, afterFlightId: selection[item.id] })));
    if (!result.ok) { setError(t("maintenance.error." + (result.error ?? "missing") as TranslationKey)); return; }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-ink/50 p-3">
      <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="maintenance-planner-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.stopPropagation(); onClose(); }
          if (event.key !== "Tab") return;
          const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)');
          if (!controls?.length) return;
          const first = controls[0];
          const last = controls[controls.length - 1];
          if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
            event.preventDefault();
            (event.shiftKey ? last : first).focus();
          }
        }}
        className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
        <header className="flex items-center justify-between gap-3">
          <h3 id="maintenance-planner-title" className="flex items-center gap-2 text-lg font-black text-ink"><Wrench size={19} />{t("maintenance.planner")}</h3>
          <button onClick={onClose} title={t("maintenance.close")} aria-label={t("maintenance.close")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-runway"><X size={18} /></button>
        </header>
        <fieldset className="my-4 flex flex-wrap gap-4 text-sm font-bold">
          <legend className="sr-only">{t("maintenance.type")}</legend>
          {(["inspection", "service"] as const).map((option) => <label key={option} className="flex items-center gap-2">
            <input type="radio" name="planner-kind" checked={kind === option} onChange={() => setKind(option)} />{t("maintenance." + option as TranslationKey)}
          </label>)}
        </fieldset>
        {batch ? <label className="mb-3 flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={eligible.length > 0 && eligible.every((item) => Boolean(selection[item.id]))}
            onChange={(event) => setSelection(event.target.checked ?
              Object.fromEntries(eligible.map((item) => [item.id, defaultAnchor(item, true)])) : {})} />{t("maintenance.selectAll")}
        </label> : null}
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {eligible.map((item) => {
            const anchors = maintenanceAnchorFlights(item);
            return <div key={item.id} className="grid gap-2 py-3 text-sm sm:grid-cols-[140px_minmax(0,1fr)]">
              <label className="flex items-center gap-2 font-black text-ink">
                {batch ? <input type="checkbox" checked={Boolean(selection[item.id])}
                  onChange={(event) => setSelection({ ...selection, [item.id]: event.target.checked ? defaultAnchor(item, true) : "" })} /> : null}
                {item.registration}
              </label>
              <label className="min-w-0 text-xs font-semibold text-slate-500">{t("maintenance.afterFlight")}
                <select aria-label={t("maintenance.afterFlight") + " " + item.registration}
                  value={selection[item.id] ?? ""} onChange={(event) => setSelection({ ...selection, [item.id]: event.target.value })}
                  className="mt-1 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-ink">
                  <option value="">-</option>
                  {!batch ? <option value="now" disabled={item.status === "in-flight"}>{t("maintenance.now")}</option> : null}
                  {anchors.map((flight) => <option key={flight.id} value={flight.id}>
                    {flight.flightNumber ?? flight.id} - {airportsById[flight.destinationAirportId]?.iata} - {formatTime(flight.arrivalGameTime)}
                  </option>)}
                </select>
              </label>
            </div>;
          })}
          {!eligible.length ? <p className="py-4 text-sm text-slate-500">{t("maintenance.noEligible")}</p> : null}
        </div>
        {previews.map(({ aircraft: item, preview }) => preview ? <dl key={item.id} className="grid grid-cols-2 gap-2 border-b border-slate-200 py-3 text-xs sm:grid-cols-3">
          <div><dt className="font-bold text-ink">{item.registration} - {airportsById[preview.airportId]?.iata}</dt><dd>{t("maintenance.starts")}: {formatTime(preview.start)}</dd></div>
          <div><dt>{t("maintenance.completes")}</dt><dd className="font-bold">{formatTime(preview.end)}</dd></div>
          <div><dt>{t("maintenance.resume")}</dt><dd className="font-bold">{preview.resume ?
            (preview.resume.flightNumber ?? preview.resume.id) + " - " + formatTime(preview.resume.departureGameTime) : t("maintenance.noResume")}</dd></div>
        </dl> : null)}
        <div className="my-3 flex flex-wrap justify-between gap-2 text-sm font-bold">
          <span>{t("maintenance.selected")}: {selected.length}</span>
          <span>{t("maintenance.estimatedCash")}: {formatGBP.format(cash)}</span>
          <span>{t("maintenance.cancelled")}: {cancelled.length}</span>
        </div>
        {cancelled.length ? <ul className="max-h-48 divide-y divide-slate-100 overflow-auto border-y border-slate-200 text-xs">
          {cancelled.map(({ aircraft: item, flight, reason }) => <li key={item.id + flight.id} className="flex flex-wrap justify-between gap-2 py-2">
            <span className="font-bold">{item.registration} / {flight.flightNumber ?? flight.id} / {formatTime(flight.scheduledDepartureGameTime ?? flight.departureGameTime)}</span>
            <span className="text-coral">{t("maintenance.reason." + reason as TranslationKey)}</span>
          </li>)}
        </ul> : null}
        {error ? <p role="alert" className="mt-3 text-sm font-bold text-coral">{error}</p> : null}
        <button type="button" disabled={!selected.length || previews.some((item) => !item.preview)}
          onClick={confirm} className="mt-4 flex min-h-10 items-center gap-2 rounded-md bg-jet px-4 py-2 text-sm font-black text-white disabled:opacity-40">
          <Check size={17} />{selected.length === 1 && selection[selected[0].id] === "now" ? t("maintenance.confirmNow") : t("maintenance.confirm")}
        </button>
      </section>
    </div>
  );
}

function defaultAnchor(aircraft: AircraftInstance, batch: boolean) {
  const flights = maintenanceAnchorFlights(aircraft);
  return flights.find((item) => item.destinationAirportId === aircraft.homeBaseAirportId)?.id ??
    flights[0]?.id ?? (!batch && aircraft.status !== "in-flight" ? "now" : "");
}
