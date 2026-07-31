"use client";

import { useState } from "react";
import { GameMap } from "@/components/GameMap";
import type { MapEngine } from "@/components/map/mapTypes";
import { I18nProvider, useTranslation } from "@/i18n";
import type { AircraftInstance, Route } from "@/types/game";

const HARNESS_TIME = Date.UTC(2026, 6, 31, 12);
const harnessRoutes: Route[] = [
  createRoute("lhr-hkg", "lhr", "LHR", "hkg", "HKG", 9614),
  createRoute("lax-hnd", "lax", "LAX", "hnd", "HND", 8812)
];
const harnessFleet: AircraftInstance[] = [
  createAircraft("harness-a350", "a350-900", "G-HARN", "lhr-hkg", "lhr", "hkg", HARNESS_TIME - 3 * 60 * 60 * 1000, HARNESS_TIME + 8 * 60 * 60 * 1000),
  createAircraft("harness-787", "787-9", "N-HARN", "lax-hnd", "lax", "hnd", HARNESS_TIME - 4 * 60 * 60 * 1000, HARNESS_TIME + 6 * 60 * 60 * 1000)
];

export function MapHarnessClient() {
  return (
    <I18nProvider>
      <MapHarness />
    </I18nProvider>
  );
}

function MapHarness() {
  const { language, setLanguage } = useTranslation();
  const [mapEngine, setMapEngine] = useState<MapEngine>("2d");
  const [lastSelection, setLastSelection] = useState("none");

  return (
    <main className="min-h-screen bg-runway p-4">
      <div className="mx-auto max-w-6xl space-y-3">
        <div className="flex items-center gap-2">
          <button data-testid="engine-2d" type="button" onClick={() => setMapEngine("2d")} className="rounded bg-white px-3 py-2 font-bold text-ink">
            2D
          </button>
          <button data-testid="engine-3d" type="button" onClick={() => setMapEngine("globe3d")} className="rounded bg-ink px-3 py-2 font-bold text-white">
            3D
          </button>
          <button data-testid="language-en" type="button" onClick={() => setLanguage("en")} className="rounded bg-white px-3 py-2 font-bold text-ink">
            EN
          </button>
          <button data-testid="language-zh" type="button" onClick={() => setLanguage("zh")} className="rounded bg-white px-3 py-2 font-bold text-ink">
            ZH
          </button>
          <output data-testid="selected-engine">{mapEngine}</output>
          <output data-testid="selected-language">{language}</output>
          <output data-testid="last-selection">{lastSelection}</output>
        </div>
        <div className="h-[720px] overflow-hidden rounded-lg border border-slate-200 bg-white">
          <GameMap
            baseAirportId="lhr"
            baseAirportIds={["lhr"]}
            primaryBaseAirportId="lhr"
            expandedAirportIds={["jfk", "cdg", "hkg", "lax", "hnd"]}
            routes={harnessRoutes}
            fleet={harnessFleet}
            currentGameTimeMs={HARNESS_TIME}
            selectedAirportId={null}
            selectedRouteId={null}
            displayMode="all"
            mapEngine={mapEngine}
            globeQuality="reduced"
            onSelectAirport={(airportId) => setLastSelection(`airport:${airportId}`)}
            onSelectRoute={(routeId) => setLastSelection(`route:${routeId}`)}
            onSelectFlight={(flightId) => setLastSelection(`flight:${flightId}`)}
          />
        </div>
      </div>
    </main>
  );
}

function createRoute(id: string, originAirportId: string, originIata: string, destinationAirportId: string, destinationIata: string, distanceKm: number): Route {
  return {
    id,
    originAirportId,
    originIata,
    destinationAirportId,
    destinationIata,
    distanceKm,
    estimatedDemand: { first: 10, business: 60, premiumEconomy: 100, economy: 300, cargoTons: 20 },
    estimatedTicketPrices: { first: 2000, business: 1200, premiumEconomy: 650, economy: 350 },
    estimatedCargoRatePerTon: 1200,
    isOpen: true
  };
}

function createAircraft(
  id: string,
  modelId: string,
  registration: string,
  routeId: string,
  originAirportId: string,
  destinationAirportId: string,
  departureGameTime: number,
  arrivalGameTime: number
): AircraftInstance {
  return {
    id,
    modelId,
    registration,
    homeBaseAirportId: originAirportId,
    currentAirportId: originAirportId,
    status: "in-flight",
    schedule: [
      {
        id: `${id}-flight`,
        routeId,
        aircraftId: id,
        flightNumber: registration.replace("-", ""),
        originAirportId,
        destinationAirportId,
        departureGameTime,
        arrivalGameTime,
        readyGameTime: arrivalGameTime + 60 * 60 * 1000,
        status: "in-flight",
        operationalStatus: "departed"
      }
    ],
    weeklySchedules: [],
    cabinLayout: { first: 4, business: 36, premiumEconomy: 48, economy: 208, cargoTons: 20 },
    purchasePriceGBP: 250_000_000,
    totalRevenue: 0,
    totalFlights: 0,
    passengerCount: 0,
    cargoTransportedTons: 0
  };
}
