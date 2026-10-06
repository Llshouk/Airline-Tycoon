"use client";

import { ArrowRight, CalendarDays, Check, MoreHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { aircraftById } from "@/data/aircraft";
import { airports, airportsById } from "@/data/airports";
import { useTranslation } from "@/i18n";
import { formatGBP, formatNumber } from "@/lib/format";
import { createRouteOpeningPreview, routeAircraftAvailability, type RouteOpeningPreview } from "@/lib/routeScheduling";
import type { GameState } from "@/types/game";

export function RouteOpeningModal({ game, airportId, originId, onClose, onOpen, onViewRoute, onViewBoard, onAirportActions }: {
  game: GameState; airportId: string; originId: string;
  onClose: () => void;
  onOpen: (preview: RouteOpeningPreview) => { ok: boolean; message: string };
  onViewRoute: (routeId: string) => void;
  onViewBoard: (airportId: string) => void;
  onAirportActions: (airportId: string) => void;
}) {
  const { t } = useTranslation();
  const bases = game.baseAirports ?? [game.primaryBaseAirport ?? game.baseAirportId];
  const [origin, setOrigin] = useState(() => bases.includes(originId) ? originId : bases[0]);
  const [destination, setDestination] = useState(airportId === originId ? "" : airportId);
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const preview = useMemo(() => createRouteOpeningPreview(origin, destination), [origin, destination]);
  const existing = game.routes.find((route) => (route.originAirportId === origin && route.destinationAirportId === destination) ||
    (route.originAirportId === destination && route.destinationAirportId === origin));
  const availability = useMemo(() => preview && !existing ? routeAircraftAvailability(game, preview.route) : [], [game, preview, existing]);
  const availableCount = availability.filter((row) => row.status === "available").length;
  const hasRange = Boolean(preview && game.fleet.some((aircraft) => (aircraftById[aircraft.modelId]?.rangeKm ?? 0) >= preview.route.distanceKm));

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("select")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const elements = [...(panel.current?.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled)") ?? [])];
      const first = elements[0];
      const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKey); previousFocus?.focus(); };
  }, []);

  return <div className="fixed inset-0 z-[6200] flex items-center justify-center bg-ink/50 p-3 sm:p-5">
    <section ref={panel} role="dialog" aria-modal="true" aria-labelledby="route-opening-title"
      className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-soft">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <h3 id="route-opening-title" className="text-lg font-black text-ink">{t("routeOpening.title")}</h3>
        <button type="button" title={t("routeOpening.close")} aria-label={t("routeOpening.close")} onClick={onClose} className="rounded-md p-2 text-slate-600 hover:bg-runway"><X size={20} /></button>
      </header>
      <div className="p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <label className="min-w-0 text-sm font-bold text-slate-600">{t("routeOpening.origin")}
            <select aria-label={t("routeOpening.origin")} value={origin} onChange={(event) => { setOrigin(event.target.value); if (event.target.value === destination) setDestination(""); setError(null); }} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-jet">
              {bases.map((id) => <option key={id} value={id}>{airportsById[id]?.iata} {airportsById[id]?.city}</option>)}
            </select>
          </label>
          <ArrowRight size={18} className="mb-3 hidden text-slate-400 sm:block" aria-hidden="true" />
          <label className="min-w-0 text-sm font-bold text-slate-600">{t("routeOpening.destination")}
            <select aria-label={t("routeOpening.destination")} value={destination} onChange={(event) => { setDestination(event.target.value); setError(null); }} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-jet">
              <option value="">{t("routeOpening.chooseDestination")}</option>
              {airports.filter((airport) => airport.id !== origin).sort((a, b) => a.iata.localeCompare(b.iata)).map((airport) =>
                <option key={airport.id} value={airport.id}>{airport.iata} {airport.city}</option>)}
            </select>
          </label>
        </div>
        {preview ? <div className="mt-4 flex flex-wrap justify-between gap-3 border-y border-slate-200 py-3 text-sm">
          <p><span className="text-slate-500">{t("routeOpening.distance")}</span><strong className="ml-2 text-ink">{formatNumber.format(preview.route.distanceKm)} km</strong></p>
          <p><span className="text-slate-500">{t("routeOpening.cost")}</span><strong className="ml-2 text-ink">{formatGBP.format(preview.cost)}</strong></p>
        </div> : null}
        {existing ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-y border-slate-200 py-4">
          <p className="text-sm font-bold text-jet">{t("routeOpening.alreadyOpen")}</p>
          <button type="button" onClick={() => onViewRoute(existing.id)} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-bold text-jet">{t("routeOpening.viewRoute")}</button>
        </div> : preview ? <section className="mt-4">
          <div className="flex flex-wrap justify-between gap-2">
            <h4 className="text-sm font-black text-ink">{t("routeOpening.aircraft")}</h4>
            <span className="text-sm font-bold text-jet">{availableCount} / {availability.length}</span>
          </div>
          {!availableCount ? <p role="status" className="mt-2 text-sm text-slate-500">{t("routeOpening.noneAvailable")}</p> : null}
          <ul className="mt-2 max-h-80 divide-y divide-slate-200 overflow-y-auto">
            {availability.map(({ aircraft, status, departureGameTime }) => <li key={aircraft.id} className="py-3">
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <div className="min-w-0"><strong className="break-words text-ink">{aircraft.registration}</strong><span className="ml-2 text-slate-600">{aircraftById[aircraft.modelId]?.model}</span></div>
                <span className={`font-bold ${status === "available" ? "text-mint" : "text-slate-500"}`}>{t(`routeOpening.${status}`)}</span>
              </div>
              {departureGameTime !== undefined ? <p className="mt-1 text-xs text-slate-500">{t("routeOpening.slot")}: {new Date(departureGameTime).toISOString().slice(0, 16).replace("T", " ")} UTC</p> : null}
            </li>)}
          </ul>
        </section> : null}
        {preview && game.money < preview.cost && !existing ? <p role="alert" className="mt-3 text-sm font-bold text-coral">{t("routeOpening.insufficientCash")}</p> : null}
        {error ? <p role="alert" className="mt-3 text-sm font-bold text-coral">{error}</p> : null}
        <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <div className="flex gap-2">
            <button type="button" onClick={() => onViewBoard(destination || airportId)} title={t("routeOpening.board")} aria-label={t("routeOpening.board")} className="rounded-md border border-slate-300 p-2 text-jet"><CalendarDays size={18} /></button>
            <button type="button" onClick={() => onAirportActions(destination || airportId)} title={t("routeOpening.actions")} aria-label={t("routeOpening.actions")} className="rounded-md border border-slate-300 p-2 text-jet"><MoreHorizontal size={18} /></button>
          </div>
          <button type="button" disabled={!preview || Boolean(existing) || !hasRange || game.money < preview.cost} onClick={() => {
            if (!preview) return;
            const result = onOpen(preview);
            if (!result.ok) setError(result.message);
          }} className="flex items-center gap-2 rounded-md bg-coral px-4 py-2 text-sm font-black text-white disabled:opacity-40"><Check size={18} />{t("routeOpening.title")}</button>
        </footer>
      </div>
    </section>
  </div>;
}
