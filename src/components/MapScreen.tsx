"use client";

import { useEffect, useMemo, useState } from "react";
import { AircraftSideImage } from "@/components/AircraftSideImage";
import { GameMap, type MapDisplayMode } from "@/components/GameMap";
import { aircraftById } from "@/data/aircraft";
import { airportsById } from "@/data/airports";
import { useTranslation } from "@/i18n";
import {
  estimateCargoRatePerTon,
  estimateExpectedFlightProfit,
  estimateFlightFinancials,
  estimateRouteOpeningCost,
  estimateTicketPrices,
  routePricingFromDefaults
} from "@/lib/economy";
import { estimateDemand } from "@/lib/demand";
import { formatGBP, formatNumber } from "@/lib/format";
import { distanceKm } from "@/lib/geo";
import { DAY_MS, dayStartMs, formatDuration, formatGameDate } from "@/lib/time";
import { useGameStore } from "@/store/gameStore";
import type { AircraftInstance, AircraftModel, Airport, GameState, Route, ScheduleItem } from "@/types/game";

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
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<MapDisplayMode>("all");
  const [routeToConfirm, setRouteToConfirm] = useState<RouteOpeningPreview | null>(null);
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
    if (!game || !selectedAirport || !selectedRouteOriginAirportId || selectedAirport.id === selectedRouteOriginAirportId || selectedAirportRoute) return null;
    const origin = airportsById[selectedRouteOriginAirportId];
    if (!origin) return null;
    const distance = distanceKm(origin, selectedAirport);
    const estimatedTicketPrices = estimateTicketPrices(distance);
    const estimatedCargoRatePerTon = estimateCargoRatePerTon(distance);
    const recommendedPricing = { ...estimatedTicketPrices, cargo: estimatedCargoRatePerTon };
    const route: Route = {
      id: `${origin.id}-${selectedAirport.id}`,
      originAirportId: origin.id,
      originBaseAirportId: origin.id,
      originIata: origin.iata,
      destinationAirportId: selectedAirport.id,
      destinationIata: selectedAirport.iata,
      distanceKm: distance,
      estimatedDemand: estimateDemand(origin, selectedAirport, distance),
      estimatedTicketPrices,
      estimatedCargoRatePerTon,
      recommendedPricing,
      pricing: recommendedPricing,
      isOpen: false
    };
    return { route, cost: estimateRouteOpeningCost(distance) };
  }, [game, selectedAirport, selectedAirportRoute, selectedRouteOriginAirportId]);

  useEffect(() => {
    if (!game) return;
    const bases = game.baseAirports ?? [game.primaryBaseAirport ?? game.baseAirportId];
    const primary = game.primaryBaseAirport ?? game.baseAirportId;
    if (!baseBoardAirportId || !bases.includes(baseBoardAirportId)) setBaseBoardAirportId(primary);
    if (!routeOriginAirportId || !bases.includes(routeOriginAirportId)) setRouteOriginAirportId(primary);
  }, [baseBoardAirportId, game, routeOriginAirportId]);

  if (!game) return null;
  const selectedRoute = selectedRouteId ? game.routes.find((route) => route.id === selectedRouteId) : null;
  const activeFlights = game.fleet.flatMap((aircraft) =>
    aircraft.schedule
      .filter((item) => item.status === "in-flight")
      .map((item) => ({ item, aircraft }))
  );
  const selectedFlight = selectedFlightId ? activeFlights.find(({ item }) => item.id === selectedFlightId) : null;
  const selectedFlightRoute = selectedFlight ? game.routes.find((route) => route.id === selectedFlight.item.routeId) : null;
  const selectedFlightModel = selectedFlight ? aircraftById[selectedFlight.aircraft.modelId] : null;
  const selectedFlightFinancials =
    selectedFlight && selectedFlightRoute && selectedFlightModel
      ? estimateFlightFinancials(selectedFlightRoute, selectedFlightModel, selectedFlight.aircraft, selectedFlight.item.departureGameTime, game.difficultyConfig)
      : null;
  const selectedFlightImageModel =
    selectedFlight && selectedFlightModel
      ? ({
          ...selectedFlightModel,
          imageUrl: (selectedFlight.aircraft as { imageUrl?: string }).imageUrl ?? selectedFlightModel.imageUrl
        } satisfies AircraftModel)
      : null;

  function confirmOpenRoute(preview: RouteOpeningPreview) {
    const result = openRoute(preview.route.originAirportId, preview.route.destinationAirportId);
    if (!result.ok || !result.route) return;
    const successPreview = { ...preview, route: result.route };
    setRouteToConfirm(null);
    setOpenedRoute(successPreview);
    setSelectedRouteId(result.route.id);
    setSelectedAirportId(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-ink">{t("map.title")}</h2>
          <p className="text-slate-600">Real airport coordinates, route distances, and your growing network.</p>
        </div>
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
            onSelectAirport={(airportId) => {
              setSelectedAirportId(airportId);
              setSelectedRouteId(null);
              setSelectedFlightId(null);
              setAirportBoardAirportId(null);
              setAirportActionAirportId(airportId);
            }}
            onSelectRoute={(routeId) => {
              setSelectedRouteId(routeId);
              setSelectedFlightId(null);
            }}
            onSelectFlight={(flightId) => setSelectedFlightId(flightId)}
          />
        </div>
        <aside className="space-y-4">
          <BaseAirportBoardPanel
            game={game}
            baseAirportIds={baseAirportIds}
            selectedAirportId={baseBoardAirportId ?? primaryBaseAirportId}
            onSelectAirport={setBaseBoardAirportId}
          />
          <RouteOpportunitiesPanel
            game={game}
            baseAirportIds={baseAirportIds}
            onOpenRoute={(preview) => setRouteToConfirm(preview)}
          />
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
            <h3 className="font-bold text-ink">Airport</h3>
            {selectedAirport ? (
              <div className="mt-3 space-y-2 text-sm">
                <Info label="IATA" value={selectedAirport.iata} />
                <Info label="ICAO" value={selectedAirport.icao} />
                <Info label="Name" value={selectedAirport.name} />
                <Info label="City" value={`${selectedAirport.city}, ${selectedAirport.country}`} />
                <Info label="Tier" value={selectedAirport.sizeTier} />
                <Info label="Base airport" value={baseAirportIds.includes(selectedAirport.id) ? selectedAirport.id === primaryBaseAirportId ? t("base.primaryBase") : t("base.secondaryBase") : "No"} />
                <Info label="Network status" value={game.expandedAirportIds.includes(selectedAirport.id) ? "Connected" : "Not connected"} />
                {selectedAirport.id === game.baseAirportId ? (
                  <p className="rounded-md bg-runway px-3 py-2 text-sm font-bold text-slate-600">This is your base airport.</p>
                ) : selectedAirportRoute ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRouteId(selectedAirportRoute.id);
                      setSelectedFlightId(null);
                    }}
                    className="w-full rounded-md bg-runway px-3 py-2 text-sm font-black text-jet transition hover:bg-slate-100"
                  >
                    {t("map.routeAlreadyOpened")} - {t("map.viewRoute")}
                  </button>
                ) : selectedAirportOpeningPreview ? (
                  <button
                    type="button"
                    onClick={() => setAirportActionAirportId(selectedAirport.id)}
                    className="w-full rounded-md bg-coral px-3 py-2 text-sm font-black text-white transition hover:bg-coral/90"
                  >
                    {t("map.openRoute")}
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Click airport to view details.</p>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
            <h3 className="font-bold text-ink">Route</h3>
            {selectedRoute ? (
              <div className="mt-3 space-y-2 text-sm">
                <Info
                  label="Route"
                  value={`${airportsById[selectedRoute.originAirportId].iata} - ${airportsById[selectedRoute.destinationAirportId].iata}`}
                />
                <Info label="Distance" value={`${formatNumber.format(selectedRoute.distanceKm)} km`} />
                <Info label="Economy fare" value={formatGBP.format((selectedRoute.pricing ?? routePricingFromDefaults(selectedRoute)).economy)} />
                <Info label="Business fare" value={formatGBP.format((selectedRoute.pricing ?? routePricingFromDefaults(selectedRoute)).business)} />
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Click an open route line to inspect it.</p>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
            <h3 className="font-bold text-ink">Active aircraft</h3>
            {selectedFlight && selectedFlightRoute && selectedFlightModel && selectedFlightImageModel && selectedFlightFinancials ? (
              <div className="mt-3 space-y-2 text-sm">
                <AircraftSideImage src={selectedFlightImageModel.sideImageUrl} alt={selectedFlightImageModel.sideImageAlt} size="small" />
                <Info label="Flight" value={selectedFlight.item.flightNumber ?? "-"} />
                <Info label="Aircraft" value={`${selectedFlight.aircraft.registration} ${selectedFlightModel.model}`} />
                <Info label="Manufacturer" value={selectedFlightModel.manufacturer} />
                <Info
                  label="Route"
                  value={`${airportsById[selectedFlight.item.originAirportId].iata} to ${airportsById[selectedFlight.item.destinationAirportId].iata}`}
                />
                <Info label="Origin" value={`${airportsById[selectedFlight.item.originAirportId].iata} ${airportsById[selectedFlight.item.originAirportId].city}`} />
                <Info label="Destination" value={`${airportsById[selectedFlight.item.destinationAirportId].iata} ${airportsById[selectedFlight.item.destinationAirportId].city}`} />
                <Info
                  label="Progress"
                  value={`${Math.round(((game.currentGameTimeMs - selectedFlight.item.departureGameTime) / (selectedFlight.item.arrivalGameTime - selectedFlight.item.departureGameTime)) * 100)}%`}
                />
                <Info label="ETA" value={formatGameDate(selectedFlight.item.arrivalGameTime)} />
                <Info label="Status" value={selectedFlight.item.status} />
                <Info label="Revenue estimate" value={formatGBP.format(selectedFlightFinancials.revenue)} />
                <Info label="Profit estimate" value={formatGBP.format(selectedFlightFinancials.profit)} />
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Click a moving aircraft to inspect it.</p>
            )}
          </div>
        </aside>
      </section>
      {routeToConfirm ? (
        <RouteOpeningConfirmModal
          preview={routeToConfirm}
          game={game}
          labels={{
            cancel: "Cancel",
            confirm: "Confirm",
            continue: t("common.continue"),
            managePricing: t("map.managePricingInRoutes"),
            openingCost: t("map.openingCost"),
            openRoute: t("map.openRoute"),
            routeLaunchVideoPlaceholder: t("map.routeLaunchVideoPlaceholder"),
            routeOpened: t("map.routeOpened"),
            viewRoute: t("map.viewRoute"),
            availableAircraft: t("map.availableAircraftForRoute"),
            noAircraft: t("map.noAircraftForRoute"),
            available: t("map.available"),
            rangeTooShort: t("map.rangeTooShort")
          }}
          onCancel={() => setRouteToConfirm(null)}
          onConfirm={() => confirmOpenRoute(routeToConfirm)}
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
            setRouteToConfirm(preview);
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
          game={game}
          labels={{
            cancel: "Cancel",
            confirm: "Confirm",
            continue: t("common.continue"),
            managePricing: t("map.managePricingInRoutes"),
            openingCost: t("map.openingCost"),
            openRoute: t("map.openRoute"),
            routeLaunchVideoPlaceholder: t("map.routeLaunchVideoPlaceholder"),
            routeOpened: t("map.routeOpened"),
            viewRoute: t("map.viewRoute"),
            availableAircraft: t("map.availableAircraftForRoute"),
            noAircraft: t("map.noAircraftForRoute"),
            available: t("map.available"),
            rangeTooShort: t("map.rangeTooShort")
          }}
          onClose={() => setOpenedRoute(null)}
          onViewRoute={() => {
            setSelectedRouteId(openedRoute.route.id);
            setOpenedRoute(null);
          }}
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

type RouteOpeningPreview = {
  route: Route;
  cost: number;
};

type MapModalLabels = {
  cancel: string;
  confirm: string;
  continue: string;
  managePricing: string;
  openingCost: string;
  openRoute: string;
  routeLaunchVideoPlaceholder: string;
  routeOpened: string;
  viewRoute: string;
  availableAircraft: string;
  noAircraft: string;
  available: string;
  rangeTooShort: string;
};

function RouteOpeningConfirmModal({
  preview,
  game,
  labels,
  onCancel,
  onConfirm
}: {
  preview: RouteOpeningPreview;
  game: GameState;
  labels: MapModalLabels;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const origin = airportsById[preview.route.originAirportId];
  const destination = airportsById[preview.route.destinationAirportId];
  const revenuePreview = bestRoutePreview(preview.route, game);

  return (
    <div className="fixed inset-0 z-[6200] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-soft animate-modal-in">
        <p className="text-xs font-black uppercase tracking-normal text-coral">{labels.openRoute}</p>
        <h3 className="mt-1 text-2xl font-black text-ink">
          {origin.iata} {origin.city} - {destination.iata} {destination.city}
        </h3>
        <p className="mt-2 text-sm text-slate-600">{labels.managePricing}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <Info label="Origin" value={`${origin.iata} ${origin.city}`} />
          <Info label="Destination" value={`${destination.iata} ${destination.city}`} />
          <Info label="Distance" value={`${formatNumber.format(preview.route.distanceKm)} km`} />
          <Info label={labels.openingCost} value={formatGBP.format(preview.cost)} />
        </div>
        <DemandSummary route={preview.route} />
        {revenuePreview ? (
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <Info label="Revenue/flight" value={formatGBP.format(revenuePreview.revenue)} />
            <Info label="Profit/flight" value={formatGBP.format(revenuePreview.profit)} />
          </div>
        ) : null}
        <AvailableAircraftForRoute route={preview.route} game={game} labels={labels} />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md border border-slate-200 px-4 py-2 font-bold text-slate-600 hover:bg-runway">
            {labels.cancel}
          </button>
          <button type="button" onClick={onConfirm} className="rounded-md bg-coral px-4 py-2 font-black text-white hover:bg-coral/90">
            {labels.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

function RouteOpenedModal({
  preview,
  game,
  labels,
  onClose,
  onViewRoute
}: {
  preview: RouteOpeningPreview;
  game: GameState;
  labels: MapModalLabels;
  onClose: () => void;
  onViewRoute: () => void;
}) {
  const origin = airportsById[preview.route.originAirportId];
  const destination = airportsById[preview.route.destinationAirportId];
  const revenuePreview = bestRoutePreview(preview.route, game);

  return (
    <div className="fixed inset-0 z-[6300] flex items-center justify-center bg-ink/55 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-soft animate-modal-in">
        <p className="text-xs font-black uppercase tracking-normal text-mint">{labels.routeOpened}</p>
        <h3 className="mt-1 text-2xl font-black text-ink">
          {origin.iata} {origin.city} - {destination.iata} {destination.city}
        </h3>
        <div className="mt-4 aspect-video rounded-lg border border-dashed border-slate-300 bg-runway p-4">
          <div className="flex h-full items-center justify-center rounded-md bg-white text-center text-sm font-black text-slate-500">
            {labels.routeLaunchVideoPlaceholder}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <Info label="Distance" value={`${formatNumber.format(preview.route.distanceKm)} km`} />
          <Info label={labels.openingCost} value={formatGBP.format(preview.cost)} />
        </div>
        <DemandSummary route={preview.route} />
        {revenuePreview ? (
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <Info label="Revenue/flight" value={formatGBP.format(revenuePreview.revenue)} />
            <Info label="Profit/flight" value={formatGBP.format(revenuePreview.profit)} />
          </div>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onViewRoute} className="rounded-md border border-slate-200 px-4 py-2 font-bold text-slate-700 hover:bg-runway">
            {labels.viewRoute}
          </button>
          <button type="button" onClick={onClose} className="rounded-md bg-jet px-4 py-2 font-black text-white hover:bg-jet/90">
            {labels.continue}
          </button>
        </div>
      </div>
    </div>
  );
}

function DemandSummary({ route }: { route: Route }) {
  return (
    <div className="mt-4 rounded-md border border-slate-200 p-3">
      <p className="mb-2 text-sm font-black text-ink">Estimated weekly demand</p>
      <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
        <Info label="First" value={formatNumber.format(route.estimatedDemand.first)} />
        <Info label="Business" value={formatNumber.format(route.estimatedDemand.business)} />
        <Info label="Premium" value={formatNumber.format(route.estimatedDemand.premiumEconomy)} />
        <Info label="Economy" value={formatNumber.format(route.estimatedDemand.economy)} />
        <Info label="Cargo" value={`${route.estimatedDemand.cargoTons.toFixed(1)} t`} />
      </div>
    </div>
  );
}

function AvailableAircraftForRoute({ route, game, labels }: { route: Route; game: GameState; labels: MapModalLabels }) {
  const aircraftRows = game.fleet
    .map((aircraft) => {
      const model = aircraftById[aircraft.modelId];
      if (!model) return null;
      const canFly = model.rangeKm >= route.distanceKm;
      const activeWeeklySchedules = aircraft.weeklySchedules.length;
      const seatCount =
        aircraft.cabinLayout.first +
        aircraft.cabinLayout.business +
        aircraft.cabinLayout.premiumEconomy +
        aircraft.cabinLayout.economy;
      return {
        aircraft,
        model,
        canFly,
        activeWeeklySchedules,
        seatCount,
        flightTime: formatDuration((route.distanceKm / model.cruiseSpeedKmh) * 60 * 60 * 1000)
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(b?.canFly) - Number(a?.canFly));

  return (
    <div className="mt-4 rounded-md border border-slate-200 p-3">
      <p className="mb-2 text-sm font-black text-ink">{labels.availableAircraft}</p>
      {aircraftRows.length === 0 ? (
        <p className="rounded-md bg-runway px-3 py-3 text-sm font-semibold text-slate-500">{labels.noAircraft}</p>
      ) : (
        <div className="grid gap-2">
          {aircraftRows.map((row) => {
            if (!row) return null;
            return (
              <div key={row.aircraft.id} className={`rounded-md border px-3 py-2 text-sm ${row.canFly ? "border-mint/30 bg-mint/5" : "border-coral/20 bg-coral/5"}`}>
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-black text-ink">
                    {row.aircraft.registration} - {row.model.manufacturer} {row.model.model}
                  </p>
                  <span className={`rounded px-2 py-1 text-xs font-black ${row.canFly ? "bg-mint/15 text-mint" : "bg-coral/10 text-coral"}`}>
                    {row.canFly ? labels.available : labels.rangeTooShort}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600 md:grid-cols-4">
                  <span>Range {formatNumber.format(row.model.rangeKm)} km</span>
                  <span>{row.seatCount} seats</span>
                  <span>{row.aircraft.cabinLayout.cargoTons.toFixed(1)} t cargo</span>
                  <span>{row.flightTime}</span>
                  <span className="md:col-span-4">{row.activeWeeklySchedules} weekly services already assigned</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
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

type RouteOpportunitySort = "distance-asc" | "distance-desc" | "revenue-desc" | "revenue-asc";

function RouteOpportunitiesPanel({
  game,
  baseAirportIds,
  onOpenRoute
}: {
  game: GameState;
  baseAirportIds: string[];
  onOpenRoute: (preview: RouteOpeningPreview) => void;
}) {
  const { t } = useTranslation();
  const [baseFilter, setBaseFilter] = useState("all");
  const [sortMode, setSortMode] = useState<RouteOpportunitySort>("revenue-desc");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const opportunities = useMemo(() => {
    const baseIds = baseFilter === "all" ? baseAirportIds : baseAirportIds.filter((airportId) => airportId === baseFilter);
    return baseIds
      .flatMap((baseId) => {
        const origin = airportsById[baseId];
        if (!origin) return [];
        return Object.values(airportsById)
          .filter((destination) => destination.id !== origin.id)
          .filter((destination) => !game.routes.some((route) => routeConnects(route.originAirportId, route.destinationAirportId, origin.id, destination.id)))
          .map((destination) => {
            const distance = distanceKm(origin, destination);
            const estimatedTicketPrices = estimateTicketPrices(distance);
            const estimatedCargoRatePerTon = estimateCargoRatePerTon(distance);
            const recommendedPricing = { ...estimatedTicketPrices, cargo: estimatedCargoRatePerTon };
            const route: Route = {
              id: `${origin.id}-${destination.id}`,
              originAirportId: origin.id,
              originBaseAirportId: origin.id,
              originIata: origin.iata,
              destinationAirportId: destination.id,
              destinationIata: destination.iata,
              distanceKm: distance,
              estimatedDemand: estimateDemand(origin, destination, distance),
              estimatedTicketPrices,
              estimatedCargoRatePerTon,
              recommendedPricing,
              pricing: recommendedPricing,
              isOpen: false
            };
            const revenuePreview = bestRoutePreview(route, game);
            return {
              key: `${origin.id}-${destination.id}`,
              preview: { route, cost: estimateRouteOpeningCost(distance) },
              origin,
              destination,
              estimatedRevenue: revenuePreview?.revenue ?? 0,
              estimatedProfit: revenuePreview?.profit ?? 0
            };
          });
      })
      .sort((a, b) => {
        if (sortMode === "distance-asc") return a.preview.route.distanceKm - b.preview.route.distanceKm;
        if (sortMode === "distance-desc") return b.preview.route.distanceKm - a.preview.route.distanceKm;
        if (sortMode === "revenue-asc") return a.estimatedRevenue - b.estimatedRevenue;
        return b.estimatedRevenue - a.estimatedRevenue;
      })
      .slice(0, 24);
  }, [baseAirportIds, baseFilter, game, sortMode]);
  const selected = opportunities.find((item) => item.key === selectedKey) ?? opportunities[0] ?? null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold text-ink">{t("map.routeOpportunities")}</h3>
        <span className="rounded-md bg-runway px-2 py-1 text-xs font-bold text-jet">{opportunities.length}</span>
      </div>
      <div className="mt-3 grid gap-2 text-sm">
        <label className="font-bold text-slate-600">
          {t("map.originBase")}
          <select value={baseFilter} onChange={(event) => setBaseFilter(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 font-bold text-jet">
            <option value="all">{t("fleet.allBases")}</option>
            {baseAirportIds.map((airportId) => {
              const airport = airportsById[airportId];
              return airport ? (
                <option key={airportId} value={airportId}>
                  {airport.iata} {airport.city}
                </option>
              ) : null;
            })}
          </select>
        </label>
        <label className="font-bold text-slate-600">
          {sortMode.startsWith("distance") ? t("map.sortByDistance") : t("map.sortByRevenue")}
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as RouteOpportunitySort)} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 font-bold text-jet">
            <option value="distance-asc">{t("map.shortestFirst")}</option>
            <option value="distance-desc">{t("map.longestFirst")}</option>
            <option value="revenue-desc">{t("map.highestRevenueFirst")}</option>
            <option value="revenue-asc">{t("map.lowestRevenueFirst")}</option>
          </select>
        </label>
      </div>
      <div className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
        {opportunities.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setSelectedKey(item.key)}
            className={`grid w-full grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md px-2 py-2 text-left text-xs transition ${
              selected?.key === item.key ? "bg-coral/10 text-ink" : "bg-runway text-slate-700 hover:bg-slate-100"
            }`}
          >
            <span className="font-black">{item.origin.iata} - {item.destination.iata}</span>
            <span className="font-bold">{formatNumber.format(item.preview.route.distanceKm)} km</span>
            <span className="font-black">{formatGBP.format(item.estimatedRevenue)}</span>
          </button>
        ))}
        {opportunities.length === 0 ? <p className="rounded-md bg-runway px-3 py-3 text-sm text-slate-500">{t("map.selectRouteDetails")}</p> : null}
      </div>
      {selected ? (
        <div className="mt-3 rounded-md border border-slate-200 p-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Info label="Route" value={`${selected.origin.iata} - ${selected.destination.iata}`} />
            <Info label="Distance" value={`${formatNumber.format(selected.preview.route.distanceKm)} km`} />
            <Info label={t("map.estimatedRevenue")} value={formatGBP.format(selected.estimatedRevenue)} />
            <Info label="Profit" value={formatGBP.format(selected.estimatedProfit)} />
          </div>
          <DemandSummary route={selected.preview.route} />
          <AvailableAircraftForRoute
            route={selected.preview.route}
            game={game}
            labels={{
              cancel: "Cancel",
              confirm: "Confirm",
              continue: t("common.continue"),
              managePricing: t("map.managePricingInRoutes"),
              openingCost: t("map.openingCost"),
              openRoute: t("map.openRoute"),
              routeLaunchVideoPlaceholder: t("map.routeLaunchVideoPlaceholder"),
              routeOpened: t("map.routeOpened"),
              viewRoute: t("map.viewRoute"),
              availableAircraft: t("map.availableAircraftForRoute"),
              noAircraft: t("map.noAircraftForRoute"),
              available: t("map.available"),
              rangeTooShort: t("map.rangeTooShort")
            }}
          />
          <button type="button" onClick={() => onOpenRoute(selected.preview)} className="mt-3 w-full rounded-md bg-coral px-3 py-2 text-sm font-black text-white hover:bg-coral/90">
            {t("map.openRoute")}
          </button>
        </div>
      ) : null}
    </section>
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
  onOpenRoute: (preview: RouteOpeningPreview) => void;
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
          ) : openingPreview ? (
            <button type="button" onClick={() => onOpenRoute(openingPreview)} className="rounded-md bg-coral px-4 py-3 text-sm font-black text-white hover:bg-coral/90">
              {t("map.openRoute")}
            </button>
          ) : null}
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
  const departures = airportBoardRows(airportId, game, "departure");
  const arrivals = airportBoardRows(airportId, game, "arrival");
  return (
    <section className={`${compact ? "mt-3" : "mt-4"} rounded-md border border-white/15 bg-black/20 p-3 text-white`}>
      <p className="mb-3 text-xs font-black uppercase tracking-normal text-slate-300">{t("airport.upcomingFlights")} - {t("airport.within30Minutes")}</p>
      <div className={`grid gap-3 ${compact ? "" : "md:grid-cols-2"}`}>
        <FlightBoardColumn title={t("airport.departures")} rows={departures} emptyLabel={t("airport.noUpcomingFlights")} type="departure" />
        <FlightBoardColumn title={t("airport.arrivals")} rows={arrivals} emptyLabel={t("airport.noUpcomingFlights")} type="arrival" />
      </div>
    </section>
  );
}

function FlightBoardColumn({
  title,
  rows,
  emptyLabel,
  type
}: {
  title: string;
  rows: AirportBoardRow[];
  emptyLabel: string;
  type: "departure" | "arrival";
}) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-white/15 pb-2">
        <p className="text-xs font-black uppercase tracking-normal text-amber-200">{title}</p>
        <span className="text-[11px] font-bold text-slate-300">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="rounded bg-white/5 px-2 py-3 text-xs font-semibold text-slate-300">{emptyLabel}</p>
      ) : (
        <div className="space-y-1">
          {rows.map((row) => (
            <div key={`${type}-${row.item.id}`} className={`grid grid-cols-[52px_1fr_64px_72px] gap-2 rounded px-2 py-2 text-xs ${row.isDelayed ? "bg-amber-300/15 text-amber-100" : "bg-white/5 text-slate-100"}`}>
              <span className="font-mono font-black tabular-nums">{formatBoardTime(row.scheduledTime)}</span>
              <span className="min-w-0">
                <span className={`block truncate font-black ${row.isDelayed ? "text-yellow-400" : "text-white"}`}>{row.flightNumber}</span>
                <span className="block truncate text-slate-300">
                  {type === "departure" ? t("airport.destination") : t("airport.origin")}: {row.counterparty}
                </span>
                <span className="block truncate text-slate-400">{row.aircraft.registration}</span>
              </span>
              <span className={`text-right font-mono font-black tabular-nums ${row.isDelayed ? "text-yellow-400" : "text-slate-100"}`}>
                {row.isDelayed ? formatBoardTime(row.actualTime) : "-"}
              </span>
              <span className={`text-right font-black ${row.isDelayed ? "text-yellow-400" : "text-slate-100"}`}>
                {row.isDelayed ? `${t("airport.delayed")} ${row.delayMinutes}m` : airportStatusLabel(row.statusKey, t)}
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
  counterparty: string;
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
        const actualTime =
          type === "departure"
            ? item.actualDepartureGameTime ?? item.departureGameTime
            : item.actualArrivalGameTime ?? item.arrivalGameTime;
        const counterpartyAirport = airportsById[type === "departure" ? item.destinationAirportId : item.originAirportId];
        const explicitDelayMinutes = item.delayMinutes ?? 0;
        const delayMinutes = Math.max(explicitDelayMinutes, Math.max(0, Math.round((actualTime - scheduledTime) / 60_000)));
        const isDelayed = (item.status as string) === "delayed" || item.operationalStatus === "delayed" || explicitDelayMinutes > 0 || delayMinutes > 0 || actualTime > scheduledTime;
        if (!shouldShowBoardFlight(type, item, scheduledTime, actualTime, isDelayed, now, windowStart, windowEnd)) return null;
        const statusKey = item.status === "completed" ? "arrived" : item.status === "in-flight" ? "departed" : "onTime";
        return {
          item,
          aircraft,
          flightNumber: item.flightNumber ?? aircraft.registration,
          counterparty: `${counterpartyAirport.iata} ${counterpartyAirport.city}`,
          scheduledTime,
          actualTime,
          sortTime: isDelayed ? actualTime : scheduledTime,
          delayMinutes,
          isDelayed,
          statusKey
        } satisfies AirportBoardRow;
      })
    )
    .filter((row): row is AirportBoardRow => Boolean(row))
    .sort((a, b) => a.sortTime - b.sortTime);
}

function shouldShowBoardFlight(
  type: "departure" | "arrival",
  item: ScheduleItem,
  scheduledTime: number,
  actualTime: number,
  isDelayed: boolean,
  now: number,
  windowStart: number,
  windowEnd: number
) {
  const scheduledToday = scheduledTime >= windowStart && scheduledTime < windowEnd;
  const actualToday = actualTime >= windowStart && actualTime < windowEnd;
  const minutesUntilScheduled = (scheduledTime - now) / 60_000;
  const minutesUntilActual = (actualTime - now) / 60_000;
  const dueSoon = (minutesUntilScheduled >= 0 && minutesUntilScheduled <= 30) || (minutesUntilActual >= 0 && minutesUntilActual <= 30);

  if (type === "departure") {
    const hasNotDeparted = item.status === "scheduled" && actualTime >= now;
    const delayedNotDeparted = isDelayed && hasNotDeparted;
    return scheduledToday && (dueSoon || hasNotDeparted || delayedNotDeparted);
  }

  const inFlight = item.status === "in-flight";
  const hasNotArrived = item.status !== "completed" && actualTime >= now;
  const delayedNotArrived = isDelayed && item.status !== "completed";
  return (scheduledToday || actualToday) && (dueSoon || hasNotArrived || delayedNotArrived || inFlight);
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

function bestRoutePreview(route: Route, game: GameState) {
  return game.fleet
    .map((aircraft) => {
      const model = aircraftById[aircraft.modelId];
      if (!model || model.rangeKm < route.distanceKm) return null;
      return estimateExpectedFlightProfit(route, model, aircraft.cabinLayout, game.difficultyConfig);
    })
    .filter(Boolean)
    .sort((a, b) => (b?.profit ?? 0) - (a?.profit ?? 0))[0] ?? null;
}
