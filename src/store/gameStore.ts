import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { aircraftById } from "@/data/aircraft";
import { getDifficultyConfig, type GameDifficulty } from "@/config/difficulty";
import { airports, airportsById } from "@/data/airports";
import { validateCabinLayout } from "@/lib/cabin";
import { advanceFleetOperations } from "@/lib/fleetOperations";
import { createFlightItem, generateWeeklyEvents, mergeGeneratedEvents } from "@/lib/recurringFlights";
import { normalizeRouteMarket } from "@/lib/routeMarket";
import { copyWeeklySchedules, prepareWeeklySchedule } from "@/lib/scheduleActions";
import { beginAircraftMaintenance, getMaintenanceStatus, normalizeAircraftLifecycle, quoteMaintenance } from "@/lib/aircraftMaintenance";
import { addCash, canAfford, getCurrentCash, spendCash, updateCash } from "@/lib/cash";
import { normalizeFinancialHistory, withCashReport } from "@/lib/financialReports";
import { abandonCompanyContract, acceptCompanyContract, applyCompanyGrowth, createCompanyGrowth, normalizeCompanyGrowth, refreshContractBoard, type ContractError } from "@/lib/companyGrowth";
import { estimateDemand } from "@/lib/demand";
import {
  estimateCargoRatePerTon,
  estimateRouteOpeningCost,
  estimateTicketPrices,
  routePricingFromDefaults
} from "@/lib/economy";
import { distanceKm, routeIdFor } from "@/lib/geo";
import { flightAirportIssues } from "@/lib/airportOperations";
import { createId } from "@/lib/ids";
import { createCompactSaveState, pruneOperationalFlights, restoreGameStateFromCloudSave } from "@/lib/cloudSave";
import { gameSaveStorage, safeGetLocalStorage, safeSetLocalStorage, skipNextGameSaveWrite } from "@/lib/gameSaveStorage";
import {
  calculateScheduleBlock,
  generateDefaultFlightNumber,
  nextFlightNumber,
  normalizeFlightNumber,
  normalizeScheduleTime,
} from "@/lib/schedule";
import {
  DAY_MS,
  GAME_SPEED_OPTIONS,
  WEEK_MS
} from "@/lib/time";
import type {
  AircraftInstance,
  CabinLayout,
  GameState,
  LeaderboardEntry,
  MaintenanceKind,
  Route,
  RoutePricing,
  TimeMultiplier,
  WeeklySchedule
} from "@/types/game";

const STARTING_CAPITAL = 1000000000;
const BASE_AIRPORT_COST = 100000000;
const INITIAL_GAME_TIME = Date.UTC(2026, 0, 1, 6, 0, 0);
const LEADERBOARD_KEY = "airline-tycoon-v1-leaderboard";

type GameStore = {
  game: GameState | null;
  notice: string | null;
  isAdminUser: boolean;
  startGame: (airlineName: string, baseAirportId: string, difficulty: GameDifficulty) => void;
  resetGame: () => void;
  setAdminUser: (isAdminUser: boolean) => void;
  clearNotice: () => void;
  acceptContract: (id: string) => { ok: boolean; error?: ContractError };
  abandonContract: (id: string) => void;
  refreshGoals: () => void;
  hydrateGameTime: () => void;
  setTimeMultiplier: (speed: TimeMultiplier) => void;
  togglePause: () => void;
  buyAircraft: (modelId: string, cabinLayout: CabinLayout, registration: string, homeBaseAirportId: string) => { ok: boolean; message: string; aircraft?: AircraftInstance };
  openRoute: (originAirportId: string, destinationAirportId: string, pricing?: Route["pricing"]) => { ok: boolean; message: string; route?: Route };
  buyBaseAirport: (airportId: string) => { ok: boolean; message: string };
  setPrimaryBaseAirport: (airportId: string) => { ok: boolean; message: string };
  updateRoutePricing: (routeId: string, pricing: RoutePricing) => void;
  copyTimetables: (sourceId: string, aircraftIds: string[], offsetMinutes: number, approvedIds?: string[]) => { outcomes: ReturnType<typeof copyWeeklySchedules>["outcomes"] };
  batchRoutePricing: (routeIds: string[], percent: number) => boolean;
  updateAircraftRegistration: (aircraftId: string, registration: string) => { ok: boolean; message: string };
  startAircraftMaintenance: (aircraftId: string, kind: MaintenanceKind) => { ok: boolean; error?: "noGame" | "airborne" | "busy" | "cash" | "missing" };
  reserveAircraftMaintenance: (plans: { aircraftId: string; kind: MaintenanceKind; afterFlightId: string }[]) => { ok: boolean; error?: "noGame" | "busy" | "missing" };
  cancelMaintenanceReservation: (aircraftId: string) => void;
  setAirportRulesEnabled: (enabled: boolean) => void;
  addConsoleMoney: (amount: number) => void;
  setConsoleMoney: (amount: number) => void;
  addConsoleStats: (input: { completedFlights?: number; passengerCount?: number; cargoTransportedTons?: number }) => void;
  unlockAllAirportsForTesting: () => void;
  clearAllSchedulesForTesting: () => void;
  importGameStateForTesting: (game: GameState) => { ok: boolean; message: string };
  loadGameStateFromCloud: (game: GameState) => { ok: boolean; message: string };
  scheduleFlight: (aircraftId: string, routeId: string, departureGameTime: number) => void;
  createWeeklySchedule: (
    input: Omit<WeeklySchedule, "id" | "createdGameTime" | "recurrenceRule" | "createdAt" | "updatedAt" | "blockMinutes" | "turnaroundMinutes"> & {
      replaceWeeklyScheduleId?: string;
      scheduleBaseAirportId?: string;
    }
  ) => { ok: boolean; message: string };
  deleteWeeklySchedule: (aircraftId: string, weeklyScheduleId: string) => void;
  tickSimulation: () => void;
};

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      game: null,
      notice: null,
      isAdminUser: false,
      startGame: (airlineName, baseAirportId, difficulty) => {
        const now = Date.now();
        const difficultyConfig = getDifficultyConfig(difficulty);
        const startingCapital = STARTING_CAPITAL * difficultyConfig.startingCashMultiplier;
        const game: GameState = {
          airlineName: airlineName.trim() || "Skyline Airways",
          difficulty: difficultyConfig.difficulty,
          difficultyConfig,
          gameStatus: "active",
          bailoutsUsed: 0,
          baseAirportId,
          baseAirports: [baseAirportId],
          primaryBaseAirport: baseAirportId,
          expandedAirportIds: [baseAirportId],
          money: startingCapital - BASE_AIRPORT_COST,
          startedAtRealMs: now,
          baseGameTimeMs: INITIAL_GAME_TIME,
          currentGameTimeMs: INITIAL_GAME_TIME,
          timeMultiplier: difficultyConfig.speedMultiplier,
          isPaused: false,
          fleet: [],
          routes: [],
          flightLog: [],
          totalProfit: 0,
          completedFlights: 0,
          passengerCount: 0,
          cargoTransportedTons: 0,
          lastTickRealMs: now,
          updatedAt: new Date(now).toISOString()
        };
        game.companyGrowth = createCompanyGrowth(game);
        const startedGame = withCashReport(game, startingCapital, "basePurchases");
        updateLeaderboard(startedGame);
        set({ game: startedGame, notice: "Base airport purchased. Your airline is cleared for startup." });
      },
      resetGame: () => set({ game: null, notice: null }),
      setAdminUser: (isAdminUser) => set({ isAdminUser }),
      clearNotice: () => set({ notice: null }),
      refreshGoals: () => {
        advanceSimulation(set, normalizeGame(get().game), Date.now());
        const game = normalizeGame(get().game);
        if (game) set({ game: { ...game, companyGrowth: refreshContractBoard(game) } });
      },
      acceptContract: (id) => {
        advanceSimulation(set, normalizeGame(get().game), Date.now());
        const game = normalizeGame(get().game);
        if (!game) return { ok: false, error: "noGame" };
        const result = acceptCompanyContract(game, id);
        set({ game: withUpdatedAt(result.game), notice: null });
        return { ok: !result.error, error: result.error };
      },
      abandonContract: (id) => {
        advanceSimulation(set, normalizeGame(get().game), Date.now());
        const game = normalizeGame(get().game);
        if (game) set({ game: withUpdatedAt(abandonCompanyContract(game, id)), notice: null });
      },
      hydrateGameTime: () => {
        const game = get().game;
        if (!game) return;
        // Startup reconciliation should not force a persistence write before migration and hydration settle.
        skipNextGameSaveWrite();
        advanceSimulation(set, normalizeGame(game), Date.now());
      },
      setTimeMultiplier: (speed) => {
        advanceSimulation(set, normalizeGame(get().game), Date.now());
        const game = normalizeGame(get().game);
        if (!game) return;
        if (!isTimeMultiplier(speed)) {
          set({ notice: "Invalid time speed." });
          return;
        }
        set({
          game: { ...game, timeMultiplier: speed, lastTickRealMs: Date.now() },
          notice: `Time speed set to ${speed}x.`
        });
      },
      togglePause: () => {
        advanceSimulation(set, normalizeGame(get().game), Date.now());
        const normalized = normalizeGame(get().game);
        if (!normalized) return;
        set({
          game: {
            ...normalized,
            isPaused: !normalized.isPaused,
            lastTickRealMs: Date.now()
          },
          notice: normalized.isPaused ? "Simulation resumed." : "Simulation paused."
        });
      },
      buyAircraft: (modelId, cabinLayout, registration, homeBaseAirportId) => {
        const game = normalizeGame(get().game);
        const model = aircraftById[modelId];
        if (!game || !model) return { ok: false, message: "Start or load a game first." };
        if (!homeBaseAirportId || !game.baseAirports.includes(homeBaseAirportId)) {
          const message = "You need to own a base airport before buying aircraft.";
          set({ notice: message });
          return { ok: false, message };
        }
        const registrationValidation = validateRegistration(registration, game.fleet);
        if (!registrationValidation.isValid) {
          set({ notice: registrationValidation.message });
          return { ok: false, message: registrationValidation.message };
        }
        const validation = validateCabinLayout(model, cabinLayout);
        if (!validation.isValid) {
          const message = validation.errors[0] ?? "Invalid cabin layout.";
          set({ notice: message });
          return { ok: false, message };
        }
        if (!canAfford(game, validation.purchasePriceGBP)) {
          const message = "Not enough cash to buy that aircraft.";
          set({ notice: message });
          return { ok: false, message };
        }

        const gameAfterPurchase = withCashReport(spendCash(game, validation.purchasePriceGBP), game.money, "aircraftPurchases");
        const aircraft: AircraftInstance = {
          id: createId("aircraft"),
          modelId,
          registration: registrationValidation.registration,
          homeBaseAirportId,
          currentAirportId: homeBaseAirportId,
          status: "idle",
          schedule: [],
          weeklySchedules: [],
          cabinLayout,
          purchasePriceGBP: validation.purchasePriceGBP,
          totalRevenue: 0,
          totalProfit: 0,
          profitHistoryIncomplete: false,
          totalFlights: 0,
          passengerCount: 0,
          cargoTransportedTons: 0
        };
        aircraft.lifecycle = normalizeAircraftLifecycle(aircraft, game.currentGameTimeMs);
        const nextGame = applyCompanyGrowth({
          ...gameAfterPurchase,
          fleet: [...game.fleet, aircraft]
        }, [], true);
        updateLeaderboard(nextGame);
        const message = `${aircraft.registration} ${model.manufacturer} ${model.model} joined the fleet with a custom cabin.`;
        set({
          game: nextGame,
          notice: message
        });
        return { ok: true, message, aircraft };
      },
      startAircraftMaintenance: (aircraftId, kind) => {
        advanceSimulation(set, normalizeGame(get().game), Date.now());
        const game = normalizeGame(get().game);
        if (!game || game.gameStatus !== "active") return { ok: false, error: "noGame" };
        const aircraft = game.fleet.find((item) => item.id === aircraftId);
        const model = aircraft && aircraftById[aircraft.modelId];
        if (!aircraft || !model || (kind !== "inspection" && kind !== "service")) return { ok: false, error: "missing" };
        if (aircraft.status === "in-flight") return { ok: false, error: "airborne" };
        const lifecycle = normalizeAircraftLifecycle(aircraft, game.currentGameTimeMs);
        if (lifecycle.maintenance || lifecycle.reservation) return { ok: false, error: "busy" };
        const quote = quoteMaintenance(model, lifecycle, kind);
        if (!canAfford(game, quote.cashCost)) return { ok: false, error: "cash" };
        const nextGame = {
          ...withCashReport(spendCash(game, quote.cashCost), game.money, "extraMaintenance"),
          totalProfit: game.totalProfit - quote.cashCost,
          fleet: game.fleet.map((item) => item.id === aircraft.id ? {
            ...item,
            status: "maintenance" as const,
            totalProfit: (item.totalProfit ?? 0) - quote.cashCost,
            lifecycle: {
              ...beginAircraftMaintenance(lifecycle, model, kind, game.currentGameTimeMs),
              recovery: { startsGameTimeMs: game.currentGameTimeMs,
                completesGameTimeMs: game.currentGameTimeMs + quote.durationMs, airportId: item.currentAirportId }
            }
          } : item)
        };
        updateLeaderboard(nextGame);
        set({ game: withUpdatedAt(nextGame), notice: null });
        return { ok: true };
      },
      reserveAircraftMaintenance: (plans) => {
        advanceSimulation(set, normalizeGame(get().game), Date.now());
        const game = normalizeGame(get().game);
        if (!game || game.gameStatus !== "active") return { ok: false, error: "noGame" };
        if (!plans.length || new Set(plans.map((plan) => plan.aircraftId)).size !== plans.length) return { ok: false, error: "missing" };
        for (const plan of plans) {
          const aircraft = game.fleet.find((item) => item.id === plan.aircraftId);
          if (!aircraft || !aircraftById[aircraft.modelId] || (plan.kind !== "inspection" && plan.kind !== "service") ||
            !aircraft.schedule.some((item) => item.id === plan.afterFlightId && (item.status === "scheduled" || item.status === "in-flight"))) {
            return { ok: false, error: "missing" };
          }
          if (aircraft.lifecycle?.maintenance || aircraft.lifecycle?.reservation) return { ok: false, error: "busy" };
        }
        const byAircraft = new Map(plans.map((plan) => [plan.aircraftId, plan]));
        set({ game: withUpdatedAt({ ...game, fleet: game.fleet.map((aircraft) => {
          const plan = byAircraft.get(aircraft.id);
          return plan ? { ...aircraft, lifecycle: { ...aircraft.lifecycle!,
            reservation: { kind: plan.kind, afterFlightId: plan.afterFlightId, state: "scheduled" as const } } } : aircraft;
        }) }), notice: null });
        return { ok: true };
      },
      cancelMaintenanceReservation: (aircraftId) => {
        advanceSimulation(set, normalizeGame(get().game), Date.now());
        const game = normalizeGame(get().game);
        if (!game) return;
        set({ game: withUpdatedAt({ ...game, fleet: game.fleet.map((aircraft) => aircraft.id === aircraftId ?
          { ...aircraft, lifecycle: { ...aircraft.lifecycle!, reservation: undefined } } : aircraft) }) });
      },
      setAirportRulesEnabled: (enabled) => {
        const game = get().game;
        if (game) set({ game: withUpdatedAt({ ...game, airportRulesEnabled: enabled }), notice: null });
      },
      openRoute: (originAirportId, destinationAirportId, pricing) => {
        const game = normalizeGame(get().game);
        if (!game) return { ok: false, message: "Start or load a game first." };
        const origin = airportsById[originAirportId];
        const destination = airportsById[destinationAirportId];
        if (!origin || !destination || origin.id === destination.id) {
          return { ok: false, message: "Select two different airports." };
        }
        if (!game.expandedAirportIds.includes(origin.id) && !game.expandedAirportIds.includes(destination.id)) {
          const message = "Routes must touch an airport already in your network.";
          set({ notice: message });
          return { ok: false, message };
        }

        const existingRoute = game.routes.find((route) => routeConnects(route, origin.id, destination.id));
        if (existingRoute) {
          const message = "That route is already open.";
          set({ notice: message });
          return { ok: false, message, route: existingRoute };
        }

        const distance = distanceKm(origin, destination);
        const hasRange = game.fleet.some((aircraft) => aircraftById[aircraft.modelId]?.rangeKm >= distance);
        if (!hasRange) {
          const message = "You need at least one owned aircraft with enough range for that route.";
          set({ notice: message });
          return { ok: false, message };
        }

        const cost = estimateRouteOpeningCost(distance);
        if (!canAfford(game, cost)) {
          const message = "Not enough cash to open that route.";
          set({ notice: message });
          return { ok: false, message };
        }

        const estimatedTicketPrices = estimateTicketPrices(distance);
        const estimatedCargoRatePerTon = estimateCargoRatePerTon(distance);
        const recommendedPricing = { ...estimatedTicketPrices, cargo: estimatedCargoRatePerTon };
        const route: Route = {
          id: routeIdFor(origin.id, destination.id),
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
          pricing: pricing ?? recommendedPricing,
          isOpen: true
        };
        const nextGame = {
          ...withCashReport(spendCash(game, cost), game.money, "routeOpening"),
          expandedAirportIds: unique([...game.expandedAirportIds, origin.id, destination.id]),
          routes: [...game.routes, route]
        };
        updateLeaderboard(nextGame);
        const message = `${origin.iata}-${destination.iata} is now open.`;
        set({ game: nextGame, notice: message });
        return { ok: true, message, route };
      },
      buyBaseAirport: (airportId) => {
        const game = normalizeGame(get().game);
        const airport = airportsById[airportId];
        if (!game || !airport) return { ok: false, message: "Airport not found." };
        if (game.baseAirports.includes(airportId)) {
          const message = "Owned Base";
          set({ notice: message });
          return { ok: false, message };
        }
        if (!canAfford(game, BASE_AIRPORT_COST)) {
          const message = "Insufficient cash to buy base";
          set({ notice: message });
          return { ok: false, message };
        }
        const nextGame = {
          ...withCashReport(spendCash(game, BASE_AIRPORT_COST), game.money, "basePurchases"),
          baseAirports: unique([...game.baseAirports, airportId]),
          expandedAirportIds: unique([...game.expandedAirportIds, airportId]),
          updatedAt: new Date().toISOString()
        };
        updateLeaderboard(nextGame);
        const message = "Base airport purchased.";
        set({ game: nextGame, notice: message });
        return { ok: true, message };
      },
      setPrimaryBaseAirport: (airportId) => {
        const game = normalizeGame(get().game);
        if (!game || !game.baseAirports.includes(airportId)) {
          const message = "Airport is not an owned base.";
          set({ notice: message });
          return { ok: false, message };
        }
        const nextGame = {
          ...game,
          baseAirportId: airportId,
          primaryBaseAirport: airportId,
          expandedAirportIds: unique([...game.expandedAirportIds, airportId]),
          updatedAt: new Date().toISOString()
        };
        updateLeaderboard(nextGame);
        const message = "Primary base updated.";
        set({ game: nextGame, notice: message });
        return { ok: true, message };
      },
      updateRoutePricing: (routeId, pricing) => {
        advanceSimulation(set, normalizeGame(get().game), Date.now());
        if (Object.values(pricing).some((value) => !Number.isFinite(value) || value < 0)) return;
        const game = normalizeGame(get().game);
        if (!game) return;
        const route = game.routes.find((item) => item.id === routeId);
        if (!route) {
          set({ notice: "Route not found." });
          return;
        }

        const nextGame = {
          ...game,
          routes: game.routes.map((item) => (item.id === routeId ? { ...item, pricing } : item))
        };
        updateLeaderboard(nextGame);
        set({ game: nextGame, notice: "Route pricing updated." });
      },
      batchRoutePricing: (routeIds, percent) => {
        advanceSimulation(set, normalizeGame(get().game), Date.now());
        const game = normalizeGame(get().game);
        const ids = new Set(routeIds);
        if (!game || !ids.size || !Number.isFinite(percent) || percent < 1 || percent > 1000 ||
          [...ids].some((id) => !game.routes.some((route) => route.id === id && route.isOpen))) return false;
        const routes = game.routes.map((route) => {
          if (!ids.has(route.id)) return route;
          const reference = route.recommendedPricing ?? routePricingFromDefaults(route);
          const pricing = { ...reference };
          for (const key of Object.keys(pricing) as (keyof RoutePricing)[]) pricing[key] = Math.round(reference[key] * percent / 100);
          return { ...route, pricing };
        });
        set({ game: { ...game, routes }, notice: "Route pricing updated." });
        return true;
      },
      updateAircraftRegistration: (aircraftId, registration) => {
        const game = normalizeGame(get().game);
        if (!game) return { ok: false, message: "Start or load a game first." };
        const aircraft = game.fleet.find((item) => item.id === aircraftId);
        if (!aircraft) return { ok: false, message: "Aircraft not found." };
        const validation = validateRegistration(registration, game.fleet, aircraftId);
        if (!validation.isValid) {
          set({ notice: validation.message });
          return { ok: false, message: validation.message };
        }

        const nextGame = {
          ...game,
          fleet: game.fleet.map((item) =>
            item.id === aircraftId ? { ...item, registration: validation.registration } : item
          ),
          flightLog: game.flightLog.map((entry) =>
            entry.aircraftId === aircraftId ? { ...entry, aircraftRegistration: validation.registration } : entry
          )
        };
        updateLeaderboard(nextGame);
        set({ game: nextGame, notice: "Aircraft registration updated." });
        return { ok: true, message: "Aircraft registration updated." };
      },
      addConsoleMoney: (amount) => {
        if (!get().isAdminUser) {
          set({ notice: "Admin only." });
          return;
        }
        const game = normalizeGame(get().game);
        if (!game) return;
        const nextGame = withCashReport(addCash(game, amount), game.money, "adjustments");
        updateLeaderboard(nextGame);
        set({ game: nextGame, notice: "Cash updated." });
      },
      setConsoleMoney: (amount) => {
        if (!get().isAdminUser) {
          set({ notice: "Admin only." });
          return;
        }
        const game = normalizeGame(get().game);
        if (!game) return;
        const nextGame = withCashReport(updateCash(game, amount), game.money, "adjustments");
        updateLeaderboard(nextGame);
        set({ game: nextGame, notice: "Cash updated." });
      },
      addConsoleStats: (input) => {
        const game = normalizeGame(get().game);
        if (!game) return;
        const nextGame = {
          ...game,
          completedFlights: game.completedFlights + Math.max(0, input.completedFlights ?? 0),
          passengerCount: game.passengerCount + Math.max(0, input.passengerCount ?? 0),
          cargoTransportedTons: Math.round((game.cargoTransportedTons + Math.max(0, input.cargoTransportedTons ?? 0)) * 10) / 10
        };
        updateLeaderboard(nextGame);
        set({ game: nextGame, notice: "Testing console: stats updated." });
      },
      unlockAllAirportsForTesting: () => {
        const game = normalizeGame(get().game);
        if (!game) return;
        const nextGame = { ...game, expandedAirportIds: airports.map((airport) => airport.id) };
        updateLeaderboard(nextGame);
        set({ game: nextGame, notice: "Testing console: all airport endpoints unlocked." });
      },
      clearAllSchedulesForTesting: () => {
        const game = normalizeGame(get().game);
        if (!game) return;
        const nextGame = {
          ...game,
          fleet: game.fleet.map((aircraft) => ({
            ...aircraft,
            status: "idle" as const,
            schedule: [],
            weeklySchedules: []
          }))
        };
        updateLeaderboard(nextGame);
        set({ game: nextGame, notice: "Testing console: schedules cleared." });
      },
      importGameStateForTesting: (importedGame) => {
        const normalized = normalizeGame(importedGame);
        if (!normalized || !Array.isArray(normalized.fleet) || !Array.isArray(normalized.routes)) {
          return { ok: false, message: "Invalid game state JSON." };
        }
        updateLeaderboard(normalized);
        set({ game: normalized, notice: "Testing console: save imported." });
        return { ok: true, message: "Save imported." };
      },
      loadGameStateFromCloud: (cloudGame) => {
        const normalized = normalizeGame(cloudGame);
        if (!normalized || !Array.isArray(normalized.fleet) || !Array.isArray(normalized.routes)) {
          return { ok: false, message: "Invalid cloud save." };
        }
        const nextGame = { ...normalized, updatedAt: cloudGame.updatedAt ?? new Date().toISOString() };
        updateLeaderboard(nextGame);
        set({ game: nextGame, notice: "Cloud save loaded." });
        return { ok: true, message: "Cloud save loaded." };
      },
      scheduleFlight: (aircraftId, routeId, departureGameTime) => {
        const game = normalizeGame(get().game);
        if (!game) return;
        const aircraft = game.fleet.find((item) => item.id === aircraftId);
        const route = game.routes.find((item) => item.id === routeId);
        if (!aircraft || !route) return;
        const model = aircraftById[aircraft.modelId];
        if (!model) return;
        if (route.distanceKm > model.rangeKm) {
          set({ notice: "That aircraft does not have enough range for the selected route." });
          return;
        }

        const latest = getLatestSchedulePosition(aircraft, game.routes);
        const originAirportId = latest.airportId;
        if (!routeHasAirport(route, originAirportId)) {
          set({ notice: "This aircraft is not positioned at either end of the selected route." });
          return;
        }
        if (departureGameTime < Math.max(game.currentGameTimeMs, latest.readyGameTime)) {
          set({ notice: "Departure must be after the aircraft is available and turned around." });
          return;
        }

        const destinationAirportId =
          originAirportId === route.originAirportId ? route.destinationAirportId : route.originAirportId;
        const item = createFlightItem({
          aircraft,
          route,
          model,
          originAirportId,
          destinationAirportId,
          departureGameTime
        });
        const curfew = game.airportRulesEnabled && flightAirportIssues(originAirportId, destinationAirportId, departureGameTime, item.arrivalGameTime)
          .find((issue) => issue.blocking);
        if (curfew) { set({ notice: "Airport curfew: " + airportsById[curfew.airportId].iata + " " + curfew.localTime }); return; }

        set({
          game: {
            ...game,
            fleet: game.fleet.map((fleetItem) =>
              fleetItem.id === aircraft.id
                ? {
                    ...fleetItem,
                    status: fleetItem.status === "idle" ? "scheduled" : fleetItem.status,
                    schedule: [...fleetItem.schedule, item].sort((a, b) => a.departureGameTime - b.departureGameTime)
                  }
                : fleetItem
            )
          },
          notice: "Flight scheduled."
        });
      },
      createWeeklySchedule: (input) => {
        advanceSimulation(set, normalizeGame(get().game), Date.now());
        const result = prepareWeeklySchedule(normalizeGame(get().game), input);
        set({ ...(result.game ? { game: result.game } : {}), notice: result.message });
        return { ok: result.ok, message: result.message };
      },
      copyTimetables: (sourceId, aircraftIds, offsetMinutes, approvedIds) => {
        advanceSimulation(set, normalizeGame(get().game), Date.now());
        const game = normalizeGame(get().game);
        if (!game) return { outcomes: [] };
        const result = copyWeeklySchedules(game, sourceId, aircraftIds, offsetMinutes, approvedIds);
        set({ game: result.game, notice: "Timetable copy completed." });
        return { outcomes: result.outcomes };
      },
      deleteWeeklySchedule: (aircraftId, weeklyScheduleId) => {
        const game = normalizeGame(get().game);
        if (!game) return;
        set({
          game: {
            ...game,
            fleet: game.fleet.map((aircraft) =>
              aircraft.id === aircraftId
                ? {
                    ...aircraft,
                    weeklySchedules: aircraft.weeklySchedules.filter((item) => item.id !== weeklyScheduleId),
                    schedule: aircraft.schedule.filter(
                      (item) => item.weeklyScheduleId !== weeklyScheduleId || item.status === "completed" || item.status === "cancelled" || item.status === "in-flight"
                    )
                  }
                : aircraft
            )
          },
          notice: "Weekly service deleted."
        });
      },
      tickSimulation: () => {
        const game = get().game;
        if (!game) return;
        advanceSimulation(set, normalizeGame(game), Date.now());
      }
    }),
    {
      name: "airline-tycoon-v1",
      version: 4,
      storage: createJSONStorage(() => gameSaveStorage),
      partialize: (state) => ({
        game: state.game ? createCompactSaveState(withUpdatedAt(normalizeGame(state.game))!) : null,
        notice: null
      }),
      migrate: (persisted) => persisted as Partial<GameStore>,
      merge: (persisted, current) => {
        const state = persisted as Partial<GameStore>;
        return {
          ...current,
          game: state.game ? normalizeGame(restoreGameStateFromCloudSave(state.game)) : null,
          notice: typeof state.notice === "string" ? state.notice : null
        };
      }
    }
  )
);

function advanceSimulation(set: (partial: Partial<GameStore>) => void, game: GameState | null, nowRealMs: number) {
  if (!game) return;
  if (game.gameStatus !== "active") {
    set({ game: { ...game, lastTickRealMs: nowRealMs } });
    return;
  }
  if (game.isPaused) {
    set({ game: { ...game, lastTickRealMs: nowRealMs } });
    return;
  }

  const elapsedRealMs = Math.max(0, nowRealMs - game.lastTickRealMs);
  const currentGameTimeMs = game.currentGameTimeMs + elapsedRealMs * game.timeMultiplier;
  let nextGame: GameState = { ...game, currentGameTimeMs, lastTickRealMs: nowRealMs };
  nextGame = instantiateRecurringFlights(nextGame, game.currentGameTimeMs);

  const beforeBankruptcyGame = advanceFleetOperations(nextGame, game.currentGameTimeMs, currentGameTimeMs).game;
  const completedNotice = beforeBankruptcyGame.completedFlights > nextGame.completedFlights ? "Flight completed. Finance log updated." : null;
  const finalGame = applyBankruptcyRules(beforeBankruptcyGame);
  const bankruptcyNotice = bankruptcyMessage(beforeBankruptcyGame, finalGame);
  updateLeaderboard(finalGame);
  set({ game: finalGame, notice: bankruptcyNotice ?? completedNotice });
}

function instantiateRecurringFlights(game: GameState, fromGameTime = game.currentGameTimeMs) {
  const horizonEnd = game.currentGameTimeMs + WEEK_MS * 2;
  return {
    ...game,
    fleet: game.fleet.map((aircraft) => {
      const merged = mergeGeneratedEvents(
        aircraft.schedule,
        generateWeeklyEvents(aircraft, game.routes, aircraft.operationsThroughGameTimeMs ?? fromGameTime - DAY_MS, horizonEnd)
          .filter((item) => aircraft.operationsThroughGameTimeMs === undefined || item.departureGameTime > aircraft.operationsThroughGameTimeMs)
      );
      return {
        ...aircraft,
        schedule: pruneOperationalFlights(merged, game.currentGameTimeMs)
      };
    })
  };
}



function getLatestSchedulePosition(aircraft: AircraftInstance, routes: Route[]) {
  const latest = [...aircraft.schedule]
    .filter((item) => item.status === "scheduled" || item.status === "in-flight")
    .sort((a, b) => b.readyGameTime - a.readyGameTime)[0];

  if (!latest) {
    return { airportId: aircraft.currentAirportId, readyGameTime: 0 };
  }

  const route = routes.find((item) => item.id === latest.routeId);
  return {
    airportId: latest.destinationAirportId || route?.destinationAirportId || aircraft.currentAirportId,
    readyGameTime: latest.readyGameTime
  };
}

type LegacyGameState = GameState & {
  cash?: unknown;
  capital?: unknown;
  playerMoney?: unknown;
  baseAirport?: unknown;
  airline?: { cash?: unknown; money?: unknown };
};

function stripLegacyCashFields(game: LegacyGameState): GameState {
  const cleanGame = { ...game };
  delete cleanGame.cash;
  delete cleanGame.capital;
  delete cleanGame.playerMoney;
  delete cleanGame.airline;
  return cleanGame;
}

export function normalizeGame(game: GameState | null | undefined): GameState | null {
  if (!game) return null;
  const rawGame = game as LegacyGameState;
  const cleanGame = stripLegacyCashFields(rawGame);
  const money = getCurrentCash(rawGame);
  const difficultyConfig = getDifficultyConfig(game.difficulty);
  const timeMultiplier = isTimeMultiplier(game.timeMultiplier) ? game.timeMultiplier : difficultyConfig.speedMultiplier;
  const legacyBaseAirport =
    typeof rawGame.baseAirportId === "string"
      ? rawGame.baseAirportId
      : typeof rawGame.baseAirport === "string"
        ? rawGame.baseAirport
        : "lhr";
  const rawBaseAirports = Array.isArray(rawGame.baseAirports)
    ? rawGame.baseAirports.filter((airportId): airportId is string => typeof airportId === "string" && Boolean(airportsById[airportId]))
    : [];
  const requestedPrimary =
    typeof rawGame.primaryBaseAirport === "string" && airportsById[rawGame.primaryBaseAirport]
      ? rawGame.primaryBaseAirport
      : legacyBaseAirport;
  const baseAirports = unique([requestedPrimary, legacyBaseAirport, ...rawBaseAirports].filter((airportId) => Boolean(airportsById[airportId])));
  const primaryBaseAirport = baseAirports.includes(requestedPrimary) ? requestedPrimary : baseAirports[0] ?? "lhr";
  return {
    ...cleanGame,
    difficulty: difficultyConfig.difficulty,
    difficultyConfig,
    gameStatus: game.gameStatus ?? "active",
    bailoutsUsed: game.bailoutsUsed ?? 0,
    baseAirportId: primaryBaseAirport,
    baseAirports,
    primaryBaseAirport,
    expandedAirportIds: unique([...(game.expandedAirportIds ?? []), ...baseAirports]),
    money,
    timeMultiplier,
    isPaused: game.isPaused ?? false,
    airportRulesEnabled: game.airportRulesEnabled === true,
    financialHistory: normalizeFinancialHistory(game.financialHistory, game.currentGameTimeMs, money),
    companyGrowth: normalizeCompanyGrowth(game.companyGrowth, game),
    routeMarket: normalizeRouteMarket(game.routeMarket, game.currentGameTimeMs),
    routes: game.routes.map((route) => {
      const estimatedTicketPrices = route.estimatedTicketPrices ?? estimateTicketPrices(route.distanceKm);
      const estimatedCargoRatePerTon = route.estimatedCargoRatePerTon ?? estimateCargoRatePerTon(route.distanceKm);
      const origin = airportsById[route.originAirportId];
      const destination = airportsById[route.destinationAirportId];
      const estimatedDemand =
        origin && destination
          ? estimateDemand(origin, destination, route.distanceKm)
          : {
              ...route.estimatedDemand,
              cargoTons: route.estimatedDemand.cargoTons ?? 0
            };
      const normalizedRoute = {
        ...route,
        estimatedTicketPrices,
        estimatedCargoRatePerTon,
        estimatedDemand
      };
      const recommendedPricing = route.recommendedPricing ?? routePricingFromDefaults(normalizedRoute);
      return {
        ...normalizedRoute,
        originBaseAirportId: route.originBaseAirportId ?? route.originAirportId,
        originIata: route.originIata ?? origin?.iata,
        destinationIata: route.destinationIata ?? destination?.iata,
        recommendedPricing,
        pricing: route.pricing ?? recommendedPricing
      };
    }),
    fleet: syncWeeklyFlightNumbers(game.fleet.map((aircraft) => {
      const model = aircraftById[aircraft.modelId];
      const weeklySchedules = (aircraft.weeklySchedules ?? []).map((schedule, index) => {
        const route = game.routes.find((item) => item.id === schedule.routeId);
        const block = route && model
          ? calculateScheduleBlock(route, aircraft)
          : { oneWayBlockMinutes: 0, roundTripBlockMinutes: 0, turnaroundMinutes: model?.turnaroundMinutes ?? 0 };
        const legacyFlightNumber = (schedule as WeeklySchedule & { flightNumber?: string }).flightNumber;
        const outboundFlightNumber = normalizeFlightNumber(schedule.outboundFlightNumber ?? legacyFlightNumber ?? generateDefaultFlightNumber(game.airlineName, index));
        const returnFlightNumber =
          schedule.isRoundTrip ? normalizeFlightNumber(schedule.returnFlightNumber ?? nextFlightNumber(outboundFlightNumber)) : undefined;
        return {
          ...schedule,
          outboundFlightNumber,
          returnFlightNumber,
          departureTimeLocal: normalizeScheduleTime(schedule.departureTimeLocal),
          blockMinutes: schedule.blockMinutes ?? (schedule.isRoundTrip ? block.roundTripBlockMinutes : block.oneWayBlockMinutes),
          turnaroundMinutes: schedule.turnaroundMinutes ?? block.turnaroundMinutes,
          createdAt: schedule.createdAt ?? new Date(game.startedAtRealMs).toISOString(),
          updatedAt: schedule.updatedAt ?? new Date(game.startedAtRealMs).toISOString()
        };
      });
      const lifecycle = normalizeAircraftLifecycle(aircraft, game.currentGameTimeMs);
      const maintenanceStatus = getMaintenanceStatus(lifecycle, game.currentGameTimeMs);
      const recordedFlights = game.flightLog.filter((entry) => entry.aircraftId === aircraft.id);
      const hasProfit = typeof aircraft.totalProfit === "number" && Number.isFinite(aircraft.totalProfit);
      return {
        ...aircraft,
        totalRevenue: typeof aircraft.totalRevenue === "number" && Number.isFinite(aircraft.totalRevenue) ? Math.max(0, aircraft.totalRevenue) : 0,
        totalFlights: typeof aircraft.totalFlights === "number" && Number.isFinite(aircraft.totalFlights) ? Math.max(0, Math.floor(aircraft.totalFlights)) : 0,
        totalProfit: hasProfit ? aircraft.totalProfit : recordedFlights.reduce((sum, entry) => sum + entry.profit, 0) - lifecycle.totalMaintenanceCashCost,
        profitHistoryIncomplete: hasProfit ? aircraft.profitHistoryIncomplete === true : aircraft.totalFlights > recordedFlights.length,
        operationsThroughGameTimeMs: Number.isFinite(aircraft.operationsThroughGameTimeMs)
          ? Math.min(aircraft.operationsThroughGameTimeMs!, game.currentGameTimeMs) : undefined,
        lastCompletedFlightGameTimeMs: Number.isFinite(aircraft.lastCompletedFlightGameTimeMs)
          ? Math.min(aircraft.lastCompletedFlightGameTimeMs!, game.currentGameTimeMs)
          : recordedFlights.reduce((latest, entry) => Math.max(latest, entry.completedGameTime), 0) || undefined,
        lifecycle,
        status: aircraft.status !== "in-flight" && (maintenanceStatus === "grounded" || maintenanceStatus === "maintenance") ? maintenanceStatus : aircraft.status,
        homeBaseAirportId:
          (aircraft.homeBaseAirportId && baseAirports.includes(aircraft.homeBaseAirportId))
            ? aircraft.homeBaseAirportId
            : baseAirports.includes(aircraft.currentAirportId)
              ? aircraft.currentAirportId
              : primaryBaseAirport,
        currentAirportId: aircraft.currentAirportId ?? aircraft.homeBaseAirportId ?? primaryBaseAirport,
        weeklySchedules,
        schedule: aircraft.schedule.map((item) => ({
          ...item,
          scheduledDepartureGameTime: item.scheduledDepartureGameTime ?? item.departureGameTime,
          scheduledArrivalGameTime: item.scheduledArrivalGameTime ?? item.arrivalGameTime,
          actualDepartureGameTime: item.status === "cancelled" ? undefined : item.actualDepartureGameTime ?? item.departureGameTime,
          actualArrivalGameTime: item.status === "cancelled" ? undefined : item.actualArrivalGameTime ?? item.arrivalGameTime,
          delayMinutes: item.delayMinutes ?? 0,
          operationalStatus: item.status === "cancelled" ? "cancelled" as const :
            item.operationalStatus ?? (item.status === "completed" ? "arrived" : item.status === "in-flight" ? "departed" : "onTime")
        })),
        cabinLayout: aircraft.cabinLayout ?? model?.suggestedLayout ?? { first: 0, business: 0, premiumEconomy: 0, economy: 100, cargoTons: 0 },
        purchasePriceGBP: aircraft.purchasePriceGBP ?? model?.estimatedPriceGBP ?? 0,
        passengerCount: aircraft.passengerCount ?? 0,
        cargoTransportedTons: aircraft.cargoTransportedTons ?? 0
      };
    })),
    passengerCount: game.passengerCount ?? 0,
    cargoTransportedTons: game.cargoTransportedTons ?? 0,
    flightLog: game.flightLog.map((entry) => ({ ...entry, passengerCount: entry.passengerCount ?? 0, cargoTons: entry.cargoTons ?? 0 }))
  };
}

function applyBankruptcyRules(game: GameState): GameState {
  if (game.money >= 0 || game.gameStatus === "gameOver") return game;
  const config = game.difficultyConfig;
  if (config.difficulty === "simulation") {
    return withCashReport({
      ...game,
      money: game.money + config.bankruptcyBailoutAmount,
      bailoutsUsed: game.bailoutsUsed + 1,
      gameStatus: "active"
    }, game.money, "subsidies");
  }
  if (config.difficulty === "easy" && (config.bankruptcyBailoutLimit === "unlimited" || game.bailoutsUsed < config.bankruptcyBailoutLimit)) {
    return withCashReport({
      ...game,
      money: game.money + config.bankruptcyBailoutAmount,
      bailoutsUsed: game.bailoutsUsed + 1,
      gameStatus: "active"
    }, game.money, "subsidies");
  }
  return {
    ...game,
    gameStatus: config.gameOverOnBankruptcy ? "gameOver" : "bankrupt"
  };
}

function isTimeMultiplier(value: unknown): value is TimeMultiplier {
  return GAME_SPEED_OPTIONS.includes(value as TimeMultiplier);
}

function syncWeeklyFlightNumbers(fleet: AircraftInstance[]) {
  return fleet.map((aircraft) => {
    const weeklySchedules = aircraft.weeklySchedules.map((schedule) => ({
      ...schedule,
      outboundFlightNumber: normalizeFlightNumber(schedule.outboundFlightNumber),
      returnFlightNumber: schedule.isRoundTrip && schedule.returnFlightNumber ? normalizeFlightNumber(schedule.returnFlightNumber) : undefined
    }));
    return {
      ...aircraft,
      weeklySchedules,
      schedule: aircraft.schedule.map((item) => {
        if (!item.weeklyScheduleId || !item.flightNumber) return item;
        const schedule = weeklySchedules.find((candidate) => candidate.id === item.weeklyScheduleId);
        if (!schedule) return item;
        const flightNumber = item.legType === "return" ? schedule.returnFlightNumber ?? item.flightNumber : schedule.outboundFlightNumber;
        return { ...item, flightNumber };
      })
    };
  });
}

function bankruptcyMessage(before: GameState, after: GameState) {
  if (before.bailoutsUsed !== after.bailoutsUsed && after.difficulty === "simulation") {
    return "Government simulation subsidy received: £10,000,000,000.";
  }
  if (before.bailoutsUsed !== after.bailoutsUsed && after.difficulty === "easy") {
    return "Emergency bailout received: £1,000,000,000.";
  }
  if (before.gameStatus !== after.gameStatus && after.gameStatus === "gameOver") {
    return "Airline bankrupt. Game over.";
  }
  if (before.gameStatus !== after.gameStatus && after.gameStatus === "bankrupt") {
    return "Airline bankrupt. No bailout remains.";
  }
  return null;
}

function withUpdatedAt(game: GameState | null): GameState | null {
  return game ? { ...game, updatedAt: new Date().toISOString() } : null;
}

function updateLeaderboard(game: GameState) {
  if (typeof window === "undefined") return;
  const entries = getLeaderboard();
  const player: LeaderboardEntry = {
    id: "player",
    airlineName: game.airlineName,
    isPlayer: true,
    valuation: estimateCompanyValuation(game),
    cash: getCurrentCash(game),
    totalProfit: game.totalProfit,
    fleetSize: game.fleet.length,
    routes: game.routes.length,
    completedFlights: game.completedFlights,
    passengerCount: game.passengerCount,
    cargoTransportedTons: game.cargoTransportedTons,
    updatedAt: Date.now()
  };
  const next = [player, ...entries.filter((entry) => !entry.isPlayer)];
  safeSetLocalStorage(LEADERBOARD_KEY, JSON.stringify(next));
}

export function getLeaderboard() {
  if (typeof window === "undefined") return mockLeaderboard();
  const stored = safeGetLocalStorage(LEADERBOARD_KEY);
  if (!stored) return mockLeaderboard();
  try {
    const parsed = JSON.parse(stored) as LeaderboardEntry[];
    const hasAi = parsed.some((entry) => !entry.isPlayer);
    return hasAi ? parsed : [...parsed, ...mockLeaderboard()];
  } catch {
    return mockLeaderboard();
  }
}

function mockLeaderboard(): LeaderboardEntry[] {
  return [
    mock("ai-1", "Northstar Global", 1420000000, 420000000, 118000000, 9, 18, 340, 55200, 940),
    mock("ai-2", "Meridian Wings", 1090000000, 280000000, 76000000, 7, 12, 220, 34400, 610),
    mock("ai-3", "Cobalt Atlantic", 880000000, 190000000, 39000000, 5, 9, 135, 21300, 420)
  ];
}

function mock(
  id: string,
  airlineName: string,
  valuation: number,
  cash: number,
  totalProfit: number,
  fleetSize: number,
  routes: number,
  completedFlights: number,
  passengerCount: number,
  cargoTransportedTons: number
): LeaderboardEntry {
  return {
    id,
    airlineName,
    isPlayer: false,
    valuation,
    cash,
    totalProfit,
    fleetSize,
    routes,
    completedFlights,
    passengerCount,
    cargoTransportedTons,
    updatedAt: Date.now()
  };
}

function estimateCompanyValuation(game: GameState) {
  const fleetValue = game.fleet.reduce((sum, aircraft) => sum + aircraft.purchasePriceGBP * 0.82, 0);
  const routeValue = game.routes.reduce((sum, route) => sum + estimateRouteOpeningCost(route.distanceKm) * 0.75, 0);
  return Math.round(getCurrentCash(game) + fleetValue + routeValue + Math.max(0, game.totalProfit) * 2.5);
}

function routeConnects(route: Route, airportA: string, airportB: string) {
  return (
    (route.originAirportId === airportA && route.destinationAirportId === airportB) ||
    (route.originAirportId === airportB && route.destinationAirportId === airportA)
  );
}

function routeHasAirport(route: Route, airportId: string) {
  return route.originAirportId === airportId || route.destinationAirportId === airportId;
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function validateRegistration(value: string, fleet: AircraftInstance[], excludeAircraftId?: string) {
  const registration = value.trim().toUpperCase();
  if (!registration) return { isValid: false, registration, message: "Aircraft registration cannot be empty." };
  if (registration.length < 3 || registration.length > 12) {
    return { isValid: false, registration, message: "Aircraft registration must be 3 to 12 characters." };
  }
  if (!/^[A-Z0-9-]+$/.test(registration)) {
    return { isValid: false, registration, message: "Aircraft registration can only use letters, numbers and hyphen." };
  }
  if (fleet.some((aircraft) => aircraft.id !== excludeAircraftId && aircraft.registration.toUpperCase() === registration)) {
    return { isValid: false, registration, message: "Aircraft registration must be unique." };
  }
  return { isValid: true, registration, message: "" };
}

export { BASE_AIRPORT_COST, STARTING_CAPITAL };
