"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GameMap, type MapDisplayMode } from "@/components/GameMap";
import type { GlobeQuality, MapEngine } from "@/components/map/mapTypes";
import { getStoredGlobeQuality, getStoredMapEngine, saveGlobeQuality, saveMapEngine } from "@/lib/mapPreferences";
import { RouteOpeningModal } from "@/components/RouteOpeningModal";
import { aircraftById } from "@/data/aircraft";
import { airportsById } from "@/data/airports";
import { useTranslation } from "@/i18n";
import { formatGBP, formatNumber } from "@/lib/format";
import { createRouteOpeningPreview, type RouteOpeningPreview } from "@/lib/routeScheduling";
import { DAY_MS, dayStartMs, formatGameDate } from "@/lib/time";
import { useGameStore } from "@/store/gameStore";
import type { AircraftInstance, Airport, GameState, Route, ScheduleItem } from "@/types/game";

const mapDisplayModes = [
  { id: "all", label: "Show All" },
  { id: "network", label: "Network View" },
  { id: "airports", label: "Airports Only" },
  { id: "aircraft", label: "Aircraft Only" }
] satisfies { id: MapDisplayMode; label: string }[];

export function MapScreen() {
  const { t } = useTranslation();
  const game = useGameStore((state) => state.game);
  const openRoute = useGameStore((state) => state.openRoute);
  const buyBaseAirport = useGameStore((state) => state.buyBaseAirport);
  const setPrimaryBaseAirport = useGameStore((state) => state.setPrimaryBaseAirport);
  const [selectedAirportId, setSelectedAirportId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<MapDisplayMode>("all");
  const [mapEngine, setMapEngine] = useState<MapEngine>("2d");
  const [globeQuality, setGlobeQuality] = useState<GlobeQuality>("auto");
  const [globeQualityHydrated, setGlobeQualityHydrated] = useState(false);
  const [mapNotice, setMapNotice] = useState<string | null>(null);
  const [routeOpeningAirportId, setRouteOpeningAirportId] = useState<string | null>(null);
  const [openedRoute, setOpenedRoute] = useState<RouteOpeningPreview | null>(null);
  const [airportActionAirportId, setAirportActionAirportId] = useState<string | null>(null);
  const [airportBoardAirportId, setAirportBoardAirportId] = useState<string | null>(null);
  const [baseBoardAirportId, setBaseBoardAirportId] = useState<string | null>(null);
  const [routeOriginAirportId, setRouteOriginAirportId] = useState<string | null>(null);
  const [basePurchaseAirportId, setBasePurchaseAirportId] = useState<string | null>(null);

  const selectedAirport = game && selectedAirportId ? airportsById[selectedAirportId] : null;
  const airportActionAirport = game && airportActionAirportId ? airportsById[airportActionAirportId] : null;
  const airportBoardAirport = game && airportBoardAirportId ? airportsById[airportBoardAirportId] : null;
  const baseAirportIds = game ? game.baseAirports ?? [game.primaryBaseAirport ?? game.baseAirportId] : [];
  const primaryBaseAirportId = game ? game.primaryBaseAirport ?? game.baseAirportId : "";
  const selectedRouteOriginAirportId =
    routeOriginAirportId && baseAirportIds.includes(routeOriginAirportId) && routeOriginAirportId !== selectedAirport?.id
      ? routeOriginAirportId
      : baseAirportIds.find((airportId) => airportId !== selectedAirport?.id) ?? primaryBaseAirportId;
  const selectedAirportRoute =
    selectedAirport && game
      ? game.routes.find((route) => routeConnects(route.originAirportId, route.destinationAirportId, selectedRouteOriginAirportId, selectedAirport.id)) ?? null
      : null;
  const selectedAirportOpeningPreview = useMemo(() => {
    if (!selectedAirport || selectedAirportRoute) return null;
    return createRouteOpeningPreview(selectedRouteOriginAirportId, selectedAirport.id);
  }, [selectedAirport, selectedAirportRoute, selectedRouteOriginAirportId]);

  useEffect(() => {
    setMapEngine(getStoredMapEngine());
    setGlobeQuality(getStoredGlobeQuality());
    setGlobeQualityHydrated(true);
  }, []);

  useEffect(() => {
    saveMapEngine(mapEngine);
  }, [mapEngine]);

  useEffect(() => {
    if (globeQualityHydrated) saveGlobeQuality(globeQuality);
  }, [globeQuality, globeQualityHydrated]);

  useEffect(() => {
    if (!game) return;
    const bases = game.baseAirports ?? [game.primaryBaseAirport ?? game.baseAirportId];
    const primary = game.primaryBaseAirport ?? game.baseAirportId;
    if (!baseBoardAirportId || !bases.includes(baseBoardAirportId)) setBaseBoardAirportId(primary);
    if (!routeOriginAirportId || !bases.includes(routeOriginAirportId)) setRouteOriginAirportId(primary);
  }, [baseBoardAirportId, game, routeOriginAirportId]);

  const handleMapEngineFallback = useCallback(
    (reason: "unsupported" | "initialisation" | "render") => {
      setMapEngine("2d");
      setMapNotice(reason === "unsupported" ? t("map.globeUnsupported") : t("map.globeFallback"));
    },
    [t]
  );

  if (!game) return null;

  function confirmOpenRoute(preview: RouteOpeningPreview) {
    const result = openRoute(preview.route.originAirportId, preview.route.destinationAirportId);
    if (!result.ok || !result.route) return result;
    const successPreview = { ...preview, route: result.route };
    setRouteOpeningAirportId(null);
    setRouteOriginAirportId(preview.route.originAirportId);
    setOpenedRoute(successPreview);
    setSelectedRouteId(result.route.id);
    setSelectedAirportId(null);
    return result;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-ink">{t("map.title")}</h2>
          <p className="text-slate-600">Real airport coordinates, route distances, and your growing network.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-black text-slate-600 shadow-soft">
            <span>{t("map.engine")}</span>
            <div className="flex gap-1 rounded bg-runway p-1">
              {(["2d", "globe3d"] as MapEngine[]).map((engine) => (
                <button
                  key={engine}
                  type="button"
                  onClick={() => {
                    setMapNotice(null);
                    setMapEngine(engine);
                  }}
                  className={`rounded px-2 py-1 text-xs font-black transition ${mapEngine === engine ? "bg-jet text-white" : "text-slate-600 hover:bg-white"}`}
                >
                  {engine === "2d" ? t("map.engine2d") : t("map.engineGlobe3d")}
                </button>
              ))}
            </div>
            {mapEngine === "globe3d" ? <span className="text-coral">{t("map.globeExperimental")}</span> : null}
          </div>
          {mapEngine === "globe3d" ? (
            <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-black text-slate-600 shadow-soft">
              <span>{t("map.globeQuality")}</span>
              <select
                value={globeQuality}
                onChange={(event) => setGlobeQuality(event.target.value as GlobeQuality)}
                aria-label={t("map.globeQuality")}
                className="min-h-10 rounded border border-slate-300 bg-white px-2 text-xs font-black text-ink outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
              >
                <option value="auto">{t("map.qualityAuto")}</option>
                <option value="high">{t("map.qualityHigh")}</option>
                <option value="reduced">{t("map.qualityReduced")}</option>
              </select>
            </label>
          ) : null}
          <div className="flex flex-wrap gap-1 rounded-md border border-slate-200 bg-white p-1 shadow-soft">
            {mapDisplayModes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setDisplayMode(mode.id)}
                className={`rounded px-3 py-2 text-xs font-black transition ${
                  displayMode === mode.id ? "bg-jet text-white" : "text-slate-600 hover:bg-runway"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {mapNotice ? <p role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">{mapNotice}</p> : null}
      <section className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="h-[min(72vh,760px)] min-h-[520px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft">
          <GameMap
            baseAirportId={game.baseAirportId}
            baseAirportIds={baseAirportIds}
            primaryBaseAirportId={primaryBaseAirportId}
            expandedAirportIds={game.expandedAirportIds}
            routes={game.routes}
            fleet={game.fleet}
            currentGameTimeMs={game.currentGameTimeMs}
            selectedAirportId={selectedAirportId}
            selectedRouteId={selectedRouteId}
            displayMode={displayMode}
            mapEngine={mapEngine}
            globeQuality={globeQuality}
            onMapEngineFallback={handleMapEngineFallback}
            onSelectAirport={(airportId) => {
              setSelectedAirportId(airportId);
              setSelectedRouteId(null);
              setAirportBoardAirportId(null);
              setRouteOpeningAirportId(airportId);
            }}
            onSelectRoute={(routeId) => {
              setSelectedRouteId(routeId);
            }}
            onSelectFlight={() => undefined}
          />
        </div>
        <aside className="space-y-4">
          <BaseAirportBoardPanel
            game={game}
            baseAirportIds={baseAirportIds}
            selectedAirportId={baseBoardAirportId ?? primaryBaseAirportId}
            onSelectAirport={setBaseBoardAirportId}
          />
        </aside>
      </section>
      {routeOpeningAirportId ? (
        <RouteOpeningModal
          key={routeOpeningAirportId}
          game={game}
          airportId={routeOpeningAirportId}
          originId={selectedRouteOriginAirportId}
          onClose={() => setRouteOpeningAirportId(null)}
          onOpen={confirmOpenRoute}
          onViewRoute={(routeId) => { setSelectedRouteId(routeId); setRouteOpeningAirportId(null); }}
          onViewBoard={(airportId) => { setAirportBoardAirportId(airportId); setRouteOpeningAirportId(null); }}
          onAirportActions={(airportId) => { setSelectedAirportId(airportId); setAirportActionAirportId(airportId); setRouteOpeningAirportId(null); }}
        />
      ) : null}
      {airportActionAirport ? (
        <AirportActionModal
          airport={airportActionAirport}
          game={game}
          route={selectedAirportRoute}
          openingPreview={airportActionAirport.id === selectedAirport?.id ? selectedAirportOpeningPreview : null}
          baseAirportIds={baseAirportIds}
          primaryBaseAirportId={primaryBaseAirportId}
          routeOriginAirportId={selectedRouteOriginAirportId}
          onRouteOriginChange={setRouteOriginAirportId}
          onClose={() => setAirportActionAirportId(null)}
          onViewBoard={() => {
            setAirportBoardAirportId(airportActionAirport.id);
            setAirportActionAirportId(null);
          }}
          onViewRoute={(routeId) => {
            setSelectedRouteId(routeId);
            setAirportActionAirportId(null);
          }}
          onOpenRoute={(preview) => {
            setRouteOpeningAirportId(airportActionAirport.id);
            if (preview) setRouteOriginAirportId(preview.route.originAirportId);
            setAirportActionAirportId(null);
          }}
          onBuyBase={(airportId) => {
            setBasePurchaseAirportId(airportId);
            setAirportActionAirportId(null);
          }}
          onSetPrimaryBase={(airportId) => {
            setPrimaryBaseAirport(airportId);
            setBaseBoardAirportId(airportId);
            setAirportActionAirportId(null);
          }}
        />
      ) : null}
      {basePurchaseAirportId ? (
        <BasePurchaseConfirmModal
          airport={airportsById[basePurchaseAirportId]}
          canAfford={game.money >= 100000000}
          onCancel={() => setBasePurchaseAirportId(null)}
          onConfirm={() => {
            const result = buyBaseAirport(basePurchaseAirportId);
            if (result.ok) setBaseBoardAirportId(basePurchaseAirportId);
            setBasePurchaseAirportId(null);
          }}
        />
      ) : null}
      {airportBoardAirport ? (
        <AirportBoardModal airportId={airportBoardAirport.id} game={game} onClose={() => setAirportBoardAirportId(null)} />
      ) : null}
      {openedRoute ? (
        <RouteOpenedModal
          preview={openedRoute}
          onClose={() => setOpenedRoute(null)}
          onViewRoute={() => { setSelectedRouteId(openedRoute.route.id); setOpenedRoute(null); }}
        />
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="font-bold text-ink">{value}</p>
    </div>
  );
}

function routeConnects(originA: string, destinationA: string, originB: string, destinationB: string) {
  return (
    (originA === originB && destinationA === destinationB) ||
    (originA === destinationB && destinationA === originB)
  );
}

function RouteOpenedModal({ preview, onClose, onViewRoute }: {
  preview: RouteOpeningPreview; onClose: () => void; onViewRoute: () => void;
}) {
  const { t } = useTranslation();
  const origin = airportsById[preview.route.originAirportId];
  const destination = airportsById[preview.route.destinationAirportId];
  return (
    <div className="fixed inset-0 z-[6300] flex items-center justify-center bg-ink/50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="route-opened-title" className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
        <p id="route-opened-title" className="text-sm font-black text-mint">{t("routeOpening.opened")}</p>
        <h3 className="mt-2 break-words text-lg font-black text-ink">{origin.iata} {origin.city} - {destination.iata} {destination.city}</h3>
        <div className="mt-4 grid grid-cols-2 gap-3 border-y border-slate-200 py-3 text-sm">
          <Info label={t("routeOpening.distance")} value={formatNumber.format(preview.route.distanceKm) + " km"} />
          <Info label={t("routeOpening.cost")} value={formatGBP.format(preview.cost)} />
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onViewRoute} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-bold text-jet">{t("routeOpening.viewRoute")}</button>
          <button type="button" onClick={onClose} className="rounded-md bg-jet px-3 py-2 text-sm font-bold text-white">{t("routeOpening.close")}</button>
        </div>
      </div>
    </div>
  );
}

function BaseAirportBoardPanel({
  game,
  baseAirportIds,
  selectedAirportId,
  onSelectAirport
}: {
  game: GameState;
  baseAirportIds: string[];
  selectedAirportId: string;
  onSelectAirport: (airportId: string) => void;
}) {
  const { t } = useTranslation();
  const selectedAirport = airportsById[selectedAirportId];
  return (
    <section className="rounded-lg border border-slate-800 bg-ink p-4 text-white shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/15 pb-3">
        <div>
          <p className="text-xs font-black uppercase tracking-normal text-amber-200">{t("base.baseAirportBoard")}</p>
          <h3 className="mt-1 font-black">{selectedAirport ? `${selectedAirport.iata} ${selectedAirport.city}` : t("base.noBaseSelected")}</h3>
          <p className="mt-1 text-xs font-semibold text-slate-300">{formatGameDate(game.currentGameTimeMs)}</p>
        </div>
        {baseAirportIds.length > 1 ? (
          <label className="text-xs font-black text-slate-300">
            {t("base.selectBase")}
            <select
              value={selectedAirportId}
              onChange={(event) => onSelectAirport(event.target.value)}
              className="mt-1 block rounded-md border border-white/15 bg-white/10 px-2 py-1 text-xs font-bold text-white outline-none"
            >
              {baseAirportIds.map((airportId) => {
                const airport = airportsById[airportId];
                return airport ? (
                  <option key={airportId} value={airportId} className="text-ink">
                    {airport.iata} {airport.city}
                  </option>
                ) : null;
              })}
            </select>
          </label>
        ) : null}
      </div>
      {selectedAirport ? (
        <AirportFlightBoard airportId={selectedAirport.id} game={game} compact />
      ) : (
        <p className="mt-3 rounded bg-white/5 px-2 py-3 text-xs font-semibold text-slate-300">{t("base.noBaseSelected")}</p>
      )}
    </section>
  );
}

function BasePurchaseConfirmModal({
  airport,
  canAfford,
  onCancel,
  onConfirm
}: {
  airport: Airport;
  canAfford: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-[6250] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-soft animate-modal-in">
        <p className="text-xs font-black uppercase tracking-normal text-coral">{t("base.buyAsBase")}</p>
        <h3 className="mt-1 text-2xl font-black text-ink">
          {airport.iata} {airport.name}
        </h3>
        <p className="mt-2 text-sm font-semibold text-slate-600">{formatGBP.format(100000000)}</p>
        {!canAfford ? <p className="mt-3 rounded-md bg-coral/10 px-3 py-2 text-sm font-bold text-coral">{t("base.insufficientCash")}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md border border-slate-200 px-4 py-2 font-bold text-slate-600 hover:bg-runway">
            {t("common.close")}
          </button>
          <button type="button" onClick={onConfirm} disabled={!canAfford} className="rounded-md bg-coral px-4 py-2 font-black text-white hover:bg-coral/90 disabled:cursor-not-allowed disabled:bg-slate-300">
            {t("base.buyAsBase")}
          </button>
        </div>
      </div>
    </div>
  );
}

function AirportActionModal({
  airport,
  game,
  route,
  openingPreview,
  baseAirportIds,
  primaryBaseAirportId,
  routeOriginAirportId,
  onRouteOriginChange,
  onClose,
  onViewBoard,
  onViewRoute,
  onOpenRoute,
  onBuyBase,
  onSetPrimaryBase
}: {
  airport: Airport;
  game: GameState;
  route: Route | null;
  openingPreview: RouteOpeningPreview | null;
  baseAirportIds: string[];
  primaryBaseAirportId: string;
  routeOriginAirportId: string;
  onRouteOriginChange: (airportId: string) => void;
  onClose: () => void;
  onViewBoard: () => void;
  onViewRoute: (routeId: string) => void;
  onOpenRoute: (preview: RouteOpeningPreview | null) => void;
  onBuyBase: (airportId: string) => void;
  onSetPrimaryBase: (airportId: string) => void;
}) {
  const { t } = useTranslation();
  const isOwnedBase = baseAirportIds.includes(airport.id);
  const isPrimaryBase = airport.id === primaryBaseAirportId;
  const canBuyBase = game.money >= 100000000;
  return (
    <div className="fixed inset-0 z-[6100] flex items-center justify-center bg-ink/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-soft animate-modal-in">
        <p className="text-xs font-black uppercase tracking-normal text-coral">{t("airport.actions")}</p>
        <h3 className="mt-1 text-2xl font-black text-ink">
          {airport.iata} {airport.name}
        </h3>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <Info label="IATA" value={airport.iata} />
          <Info label="ICAO" value={airport.icao} />
          <Info label="City" value={`${airport.city}, ${airport.country}`} />
          <Info label="Base airport" value={isPrimaryBase ? t("base.primaryBase") : isOwnedBase ? t("base.secondaryBase") : "No"} />
          <Info label="Network status" value={game.expandedAirportIds.includes(airport.id) ? "Connected" : "Not connected"} />
          <Info label="Route status" value={route ? t("map.routeAlreadyOpened") : openingPreview ? t("map.openRoute") : "Unavailable"} />
        </div>
        <div className="mt-5 grid gap-2">
          <button type="button" onClick={onViewBoard} className="rounded-md bg-jet px-4 py-3 text-sm font-black text-white hover:bg-ink">
            {t("airport.viewBoard")}
          </button>
          {baseAirportIds.some((airportId) => airportId !== airport.id) ? (
            <label className="rounded-md border border-slate-200 bg-runway px-3 py-2 text-sm font-bold text-slate-700">
              <span className="mb-1 block text-xs font-black uppercase tracking-normal text-slate-500">{t("base.selectBase")}</span>
              <select value={routeOriginAirportId} onChange={(event) => onRouteOriginChange(event.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 font-bold text-jet">
                {baseAirportIds
                  .filter((airportId) => airportId !== airport.id)
                  .map((airportId) => {
                    const base = airportsById[airportId];
                    return base ? (
                      <option key={airportId} value={airportId}>
                        {base.iata} {base.city}
                      </option>
                    ) : null;
                  })}
              </select>
            </label>
          ) : null}
          {route ? (
            <button type="button" onClick={() => onViewRoute(route.id)} className="rounded-md bg-runway px-4 py-3 text-sm font-black text-jet hover:bg-slate-100">
              {t("map.viewRoute")}
            </button>
          ) : null}
          <button type="button" onClick={() => onOpenRoute(openingPreview)} className="rounded-md bg-coral px-4 py-3 text-sm font-black text-white hover:bg-coral/90">
            {t("map.openRoute")}
          </button>
          {isOwnedBase ? (
            <p className="rounded-md bg-mint/10 px-3 py-2 text-sm font-black text-mint">{t("base.ownedBase")}</p>
          ) : (
            <button
              type="button"
              onClick={() => onBuyBase(airport.id)}
              disabled={!canBuyBase}
              className="rounded-md bg-mint px-4 py-3 text-sm font-black text-white hover:bg-mint/90 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {canBuyBase ? t("base.buyAsBase") : `${t("base.insufficientCash")} (${formatGBP.format(100000000)})`}
            </button>
          )}
          {isOwnedBase && !isPrimaryBase ? (
            <button type="button" onClick={() => onSetPrimaryBase(airport.id)} className="rounded-md bg-runway px-4 py-3 text-sm font-black text-jet hover:bg-slate-100">
              {t("base.setPrimaryBase")}
            </button>
          ) : null}
          <button type="button" onClick={onClose} className="rounded-md border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-runway">
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

function AirportBoardModal({ airportId, game, onClose }: { airportId: string; game: GameState; onClose: () => void }) {
  const { t } = useTranslation();
  const airport = airportsById[airportId];
  return (
    <div className="fixed inset-0 z-[6150] flex items-center justify-center bg-ink/55 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-slate-800 bg-ink p-5 text-white shadow-soft animate-modal-in">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/15 pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-normal text-amber-200">{t("airport.viewBoard")}</p>
            <h3 className="mt-1 text-2xl font-black">
              {airport.iata} {airport.city}
            </h3>
            <p className="mt-1 text-sm font-semibold text-slate-300">{formatGameDate(game.currentGameTimeMs)}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md bg-white/10 px-3 py-2 text-sm font-black text-white hover:bg-white/15">
            {t("common.close")}
          </button>
        </div>
        <AirportFlightBoard airportId={airportId} game={game} />
      </div>
    </div>
  );
}

function AirportFlightBoard({ airportId, game, compact = false }: { airportId: string; game: GameState; compact?: boolean }) {
  const { t } = useTranslation();
  const airport = airportsById[airportId];
  const [activeTab, setActiveTab] = useState<"departure" | "arrival">("departure");
  const departures = useMemo(() => airportBoardRows(airportId, game, "departure"), [airportId, game]);
  const arrivals = useMemo(() => airportBoardRows(airportId, game, "arrival"), [airportId, game]);
  const rows = activeTab === "departure" ? departures : arrivals;
  return (
    <section className={`${compact ? "mt-3" : "mt-4"} overflow-hidden rounded-lg border border-slate-700/70 bg-slate-950 text-white shadow-[0_18px_45px_rgba(2,6,23,0.35)]`}>
      <div className="border-b border-white/10 bg-white/[0.04] px-3 py-3">
        <p className="font-mono text-[11px] font-black uppercase tracking-[0.16em] text-amber-200">
          {airport?.iata} {t("airport.todaysFlights")}
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className={`${compact ? "text-lg" : "text-2xl"} font-black text-white`}>
              {airport?.iata} Airport Board
            </h3>
            <p className="text-xs font-semibold text-slate-300">{airport?.city} - {formatGameDate(game.currentGameTimeMs)}</p>
          </div>
          <span className="rounded-md border border-white/10 bg-black/25 px-2 py-1 font-mono text-xs font-black text-slate-100">
            {formatBoardTime(game.currentGameTimeMs)}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-md border border-white/10 bg-black/30 p-1">
          <BoardTab active={activeTab === "departure"} label={t("airport.departures")} count={departures.length} onClick={() => setActiveTab("departure")} />
          <BoardTab active={activeTab === "arrival"} label={t("airport.arrivals")} count={arrivals.length} onClick={() => setActiveTab("arrival")} />
        </div>
      </div>
      <FlightBoardColumn rows={rows} emptyLabel={t("airport.noUpcomingFlights")} type={activeTab} compact={compact} />
    </section>
  );
}

function BoardTab({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between gap-2 rounded px-3 py-2 text-xs font-black uppercase tracking-normal transition ${
        active ? "bg-amber-300 text-slate-950 shadow-sm" : "text-slate-300 hover:bg-white/10 hover:text-white"
      }`}
    >
      <span>{label}</span>
      <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${active ? "bg-slate-950/15" : "bg-white/10"}`}>{count}</span>
    </button>
  );
}

function FlightBoardColumn({
  rows,
  emptyLabel,
  type,
  compact
}: {
  rows: AirportBoardRow[];
  emptyLabel: string;
  type: "departure" | "arrival";
  compact: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="p-2">
      <div className="mb-2 hidden grid-cols-[64px_72px_1fr_92px_92px] gap-2 border-b border-white/10 px-2 pb-2 text-[10px] font-black uppercase tracking-normal text-slate-400 md:grid">
        <span>{t("airport.scheduled")}</span>
        <span>{t("airport.flight")}</span>
        <span>{type === "departure" ? t("airport.destination") : t("airport.origin")}</span>
        <span>{t("schedule.aircraft")}</span>
        <span className="text-right">{t("detail.status")}</span>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-5 text-center text-xs font-semibold text-slate-300">{emptyLabel}</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((row) => (
            <div
              key={`${type}-${row.item.id}`}
              className={`grid items-center gap-2 rounded-md border px-2.5 py-2 text-xs transition ${
                compact ? "grid-cols-[52px_62px_1fr_auto]" : "grid-cols-[64px_72px_1fr_92px_92px]"
              } ${row.isDelayed ? "border-amber-300/25 bg-amber-300/12 text-amber-100" : "border-white/10 bg-white/[0.045] text-slate-100 hover:bg-white/[0.07]"}`}
            >
              <span className="font-mono text-sm font-black tabular-nums text-white">{formatBoardTime(row.scheduledTime)}</span>
              <span className={`font-mono font-black tabular-nums ${row.isDelayed ? "text-yellow-300" : "text-slate-100"}`}>{row.flightNumber}</span>
              <span className="min-w-0 truncate text-slate-300">
                {row.routeLabel}
                {!compact ? <span className="ml-2 text-slate-500">{row.aircraftModel}</span> : null}
              </span>
              {!compact ? <span className="truncate font-mono font-bold text-slate-300">{row.aircraft.registration}</span> : null}
              <span className={`justify-self-end rounded px-2 py-1 text-[10px] font-black uppercase tracking-normal ${row.isDelayed ? "bg-amber-300 text-slate-950" : "bg-white/10 text-slate-100"}`}>
                {row.item.status === "cancelled" ? t("airport.cancelled") : row.item.operationalStatus === "grounded" ? t("maintenance.status.grounded") : row.isDelayed ? `${t("airport.delayed")} ${formatBoardTime(row.actualTime)}` : airportStatusLabel(row.statusKey, t)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type AirportBoardRow = {
  item: ScheduleItem;
  aircraft: AircraftInstance;
  flightNumber: string;
  routeLabel: string;
  aircraftModel: string;
  scheduledTime: number;
  actualTime: number;
  sortTime: number;
  delayMinutes: number;
  isDelayed: boolean;
  statusKey: "onTime" | "departed" | "arrived";
};

function airportBoardRows(airportId: string, game: GameState, type: "departure" | "arrival"): AirportBoardRow[] {
  const windowStart = dayStartMs(game.currentGameTimeMs);
  const windowEnd = windowStart + DAY_MS;
  const now = game.currentGameTimeMs;
  return game.fleet
    .flatMap((aircraft) =>
      aircraft.schedule.map((item) => {
        const isDeparture = item.originAirportId === airportId;
        const isArrival = item.destinationAirportId === airportId;
        if ((type === "departure" && !isDeparture) || (type === "arrival" && !isArrival)) return null;
        const scheduledTime =
          type === "departure"
            ? item.scheduledDepartureGameTime ?? item.departureGameTime
            : item.scheduledArrivalGameTime ?? item.arrivalGameTime;
        const explicitActualTime =
          type === "departure"
            ? item.actualDepartureGameTime
            : item.actualArrivalGameTime;
        const actualTime = explicitActualTime ?? scheduledTime;
        const explicitDelayMinutes = item.delayMinutes ?? 0;
        const delayMinutes = Math.max(explicitDelayMinutes, Math.max(0, Math.round((actualTime - scheduledTime) / 60_000)));
        const isDelayed = item.operationalStatus === "grounded" || item.operationalStatus === "delayed" || explicitDelayMinutes > 0 || delayMinutes > 0 || actualTime > scheduledTime;
        const shouldShow =
          type === "departure"
            ? shouldShowDepartureOnAirportBoard({ flight: item, now, windowStart, windowEnd })
            : shouldShowArrivalOnAirportBoard({ flight: item, now, windowStart, windowEnd });
        if (!shouldShow) return null;
        const statusKey = item.status === "completed" ? "arrived" : item.status === "in-flight" ? "departed" : "onTime";
        return {
          item,
          aircraft,
          flightNumber: item.flightNumber ?? aircraft.registration,
          routeLabel: `${airportsById[item.originAirportId].iata} -> ${airportsById[item.destinationAirportId].iata}`,
          aircraftModel: aircraftById[aircraft.modelId]?.model ?? aircraft.modelId,
          scheduledTime,
          actualTime,
          sortTime: actualTime,
          delayMinutes,
          isDelayed,
          statusKey
        } satisfies AirportBoardRow;
      })
    )
    .filter((row): row is AirportBoardRow => Boolean(row))
    .sort((a, b) => a.sortTime - b.sortTime);
}

function shouldShowDepartureOnAirportBoard({
  flight,
  now,
  windowStart,
  windowEnd
}: {
  flight: ScheduleItem;
  now: number;
  windowStart: number;
  windowEnd: number;
}) {
  const scheduledTime = flight.scheduledDepartureGameTime ?? flight.departureGameTime;
  const scheduledToday = scheduledTime >= windowStart && scheduledTime < windowEnd;
  if (!scheduledToday) return false;
  if (flight.status === "cancelled") return true;
  if (flight.operationalStatus === "grounded") return true;

  const departureTime = flight.actualDepartureGameTime ?? scheduledTime;
  const minutesSinceDeparture = (now - departureTime) / 60_000;
  return minutesSinceDeparture <= 30;
}

function shouldShowArrivalOnAirportBoard({
  flight,
  now,
  windowStart,
  windowEnd
}: {
  flight: ScheduleItem;
  now: number;
  windowStart: number;
  windowEnd: number;
}) {
  const scheduledTime = flight.scheduledArrivalGameTime ?? flight.arrivalGameTime;
  const scheduledToday = scheduledTime >= windowStart && scheduledTime < windowEnd;
  if (!scheduledToday) return false;
  if (flight.status === "cancelled") return true;

  const arrivalTime = flight.actualArrivalGameTime ?? scheduledTime;
  const minutesSinceArrival = (now - arrivalTime) / 60_000;
  return minutesSinceArrival <= 30;
}

function formatBoardTime(value: number) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC"
  }).format(new Date(value));
}

function airportStatusLabel(status: AirportBoardRow["statusKey"], t: ReturnType<typeof useTranslation>["t"]) {
  if (status === "arrived") return t("airport.arrived");
  if (status === "departed") return t("airport.departed");
  return t("airport.onTime");
}
