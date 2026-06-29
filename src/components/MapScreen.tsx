"use client";

import { useState } from "react";
import { aircraftById } from "@/data/aircraft";
import { airportsById } from "@/data/airports";
import { useTranslation } from "@/i18n";
import { estimateFlightFinancials, routePricingFromDefaults } from "@/lib/economy";
import { formatGBP, formatNumber } from "@/lib/format";
import { formatGameDate } from "@/lib/time";
import { useGameStore } from "@/store/gameStore";
import { GameMap, type MapDisplayMode } from "@/components/GameMap";

const mapDisplayModes = [
  { id: "all", label: "Show All" },
  { id: "network", label: "Network View" },
  { id: "airports", label: "Airports Only" },
  { id: "aircraft", label: "Aircraft Only" }
] satisfies { id: MapDisplayMode; label: string }[];

export function MapScreen() {
  const { t } = useTranslation();
  const game = useGameStore((state) => state.game);
  const [selectedAirportId, setSelectedAirportId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<MapDisplayMode>("all");

  if (!game) return null;
  const selectedAirport = selectedAirportId ? airportsById[selectedAirportId] : null;
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
                <Info label="Demand score" value={String(selectedAirport.baseDemandScore)} />
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
                <Info label="Cargo demand" value={`${selectedRoute.estimatedDemand.cargoTons.toFixed(1)} t`} />
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Click an open route line to inspect it.</p>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
            <h3 className="font-bold text-ink">Active aircraft</h3>
            {selectedFlight && selectedFlightRoute && selectedFlightModel && selectedFlightFinancials ? (
              <div className="mt-3 space-y-2 text-sm">
                <Info label="Flight" value={selectedFlight.item.flightNumber ?? "-"} />
                <Info label="Aircraft" value={`${selectedFlight.aircraft.registration} ${selectedFlightModel.model}`} />
                <Info
                  label="Route"
                  value={`${airportsById[selectedFlight.item.originAirportId].iata} to ${airportsById[selectedFlight.item.destinationAirportId].iata}`}
                />
                <Info
                  label="Progress"
                  value={`${Math.round(((game.currentGameTimeMs - selectedFlight.item.departureGameTime) / (selectedFlight.item.arrivalGameTime - selectedFlight.item.departureGameTime)) * 100)}%`}
                />
                <Info label="ETA" value={formatGameDate(selectedFlight.item.arrivalGameTime)} />
                <Info label="Profit estimate" value={formatGBP.format(selectedFlightFinancials.profit)} />
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Click a moving aircraft to inspect it.</p>
            )}
          </div>
        </aside>
      </section>
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
