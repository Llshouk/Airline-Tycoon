"use client";

import { useMemo, useState } from "react";
import { AircraftImage } from "@/components/AircraftImage";
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
import { formatGameDate } from "@/lib/time";
import { useGameStore } from "@/store/gameStore";
import type { AircraftModel, GameState, Route } from "@/types/game";

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
  const [selectedAirportId, setSelectedAirportId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<MapDisplayMode>("all");
  const [routeToConfirm, setRouteToConfirm] = useState<RouteOpeningPreview | null>(null);
  const [openedRoute, setOpenedRoute] = useState<RouteOpeningPreview | null>(null);

  const selectedAirport = game && selectedAirportId ? airportsById[selectedAirportId] : null;
  const selectedAirportRoute =
    selectedAirport && game
      ? game.routes.find((route) => routeConnects(route.originAirportId, route.destinationAirportId, game.baseAirportId, selectedAirport.id)) ?? null
      : null;
  const selectedAirportOpeningPreview = useMemo(() => {
    if (!game || !selectedAirport || selectedAirport.id === game.baseAirportId || selectedAirportRoute) return null;
    const origin = airportsById[game.baseAirportId];
    const distance = distanceKm(origin, selectedAirport);
    const estimatedTicketPrices = estimateTicketPrices(distance);
    const estimatedCargoRatePerTon = estimateCargoRatePerTon(distance);
    const recommendedPricing = { ...estimatedTicketPrices, cargo: estimatedCargoRatePerTon };
    const route: Route = {
      id: `${origin.id}-${selectedAirport.id}`,
      originAirportId: origin.id,
      destinationAirportId: selectedAirport.id,
      distanceKm: distance,
      estimatedDemand: estimateDemand(origin, selectedAirport, distance),
      estimatedTicketPrices,
      estimatedCargoRatePerTon,
      recommendedPricing,
      pricing: recommendedPricing,
      isOpen: false
    };
    return { route, cost: estimateRouteOpeningCost(distance) };
  }, [game, selectedAirport, selectedAirportRoute]);

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
      ? estimateFlightFinancials(selectedFlightRoute, selectedFlightModel, selectedFlight.aircraft, selectedFlight.item.departureGameTime)
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
            }}
            onSelectRoute={(routeId) => {
              setSelectedRouteId(routeId);
              setSelectedFlightId(null);
            }}
            onSelectFlight={(flightId) => setSelectedFlightId(flightId)}
          />
        </div>
        <aside className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
            <h3 className="font-bold text-ink">Airport</h3>
            {selectedAirport ? (
              <div className="mt-3 space-y-2 text-sm">
                <Info label="IATA" value={selectedAirport.iata} />
                <Info label="ICAO" value={selectedAirport.icao} />
                <Info label="Name" value={selectedAirport.name} />
                <Info label="City" value={`${selectedAirport.city}, ${selectedAirport.country}`} />
                <Info label="Tier" value={selectedAirport.sizeTier} />
                <Info label="Base airport" value={selectedAirport.id === game.baseAirportId ? "Yes" : "No"} />
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
                    onClick={() => setRouteToConfirm(selectedAirportOpeningPreview)}
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
                <AircraftImage model={selectedFlightImageModel} className="h-24 w-full" />
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
            viewRoute: t("map.viewRoute")
          }}
          onCancel={() => setRouteToConfirm(null)}
          onConfirm={() => confirmOpenRoute(routeToConfirm)}
        />
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
            viewRoute: t("map.viewRoute")
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

function bestRoutePreview(route: Route, game: GameState) {
  return game.fleet
    .map((aircraft) => {
      const model = aircraftById[aircraft.modelId];
      if (!model || model.rangeKm < route.distanceKm) return null;
      return estimateExpectedFlightProfit(route, model, aircraft.cabinLayout);
    })
    .filter(Boolean)
    .sort((a, b) => (b?.profit ?? 0) - (a?.profit ?? 0))[0] ?? null;
}
