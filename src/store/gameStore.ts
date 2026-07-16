import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { aircraftById } from "@/data/aircraft";
import { getDifficultyConfig, type GameDifficulty } from "@/config/difficulty";
import { airports, airportsById } from "@/data/airports";
import { validateCabinLayout } from "@/lib/cabin";
import { addCash, canAfford, getCurrentCash, spendCash, updateCash } from "@/lib/cash";
import { estimateDemand } from "@/lib/demand";
import {
  estimateCargoRatePerTon,
  estimateFlightFinancials,
  estimateRouteOpeningCost,
  estimateTicketPrices,
  routePricingFromDefaults
} from "@/lib/economy";
import { distanceKm, routeIdFor } from "@/lib/geo";
import { createId, createRegistration } from "@/lib/ids";
import { createCompactSaveState, pruneOperationalFlights, restoreGameStateFromCloudSave } from "@/lib/cloudSave";
import { gameSaveStorage, safeGetLocalStorage, safeSetLocalStorage, skipNextGameSaveWrite } from "@/lib/gameSaveStorage";
import {
  calculateScheduleBlock,
  findDuplicateFlightNumber,
  generateDefaultFlightNumber,
  isAllowedScheduleMinute,
  nextFlightNumber,
  normalizeFlightNumber,
  normalizeScheduleTime,
  validateFlightNumber,
  validateWeeklySchedule
} from "@/lib/schedule";
import {
  DAY_MS,
  GAME_SPEED_OPTIONS,
  flightWaitMs,
  timeOfDayMs,
  turnaroundWaitMs,
  WEEK_MS,
  weekStartMs
} from "@/lib/time";
import type {
  AircraftInstance,
  CabinLayout,
  DayOfWeek,
  GameState,
  LeaderboardEntry,
  Route,
  RoutePricing,
  ScheduleItem,
  TimeMultiplier,
  WeeklySchedule
} from "@/types/game";

const STARTING_CAPITAL = 1000000000;
const BASE_AIRPORT_COST = 100000000;
const INITIAL_GAME_TIME = Date.UTC(2026, 0, 1, 6, 0, 0);
const LEADERBOARD_KEY = "airline-tycoon-v1-leaderboard";
const BASE_DELAY_PROBABILITY = 0.3;
const DELAY_PROBABILITY_JITTER = 0.05;
const MAX_DELAY_MINUTES = 180;

type GameStore = {
  game: GameState | null;
  notice: string | null;
  isAdminUser: boolean;
  startGame: (airlineName: string, baseAirportId: string, difficulty: GameDifficulty) => void;
  resetGame: () => void;
  setAdminUser: (isAdminUser: boolean) => void;
  clearNotice: () => void;
  hydrateGameTime: () => void;
  setTimeMultiplier: (speed: TimeMultiplier) => void;
  togglePause: () => void;
  buyAircraft: (modelId: string, cabinLayout: CabinLayout, registration: string, homeBaseAirportId: string) => { ok: boolean; message: string; aircraft?: AircraftInstance };
  openRoute: (originAirportId: string, destinationAirportId: string, pricing?: Route["pricing"]) => { ok: boolean; message: string; route?: Route };
  buyBaseAirport: (airportId: string) => { ok: boolean; message: string };
  setPrimaryBaseAirport: (airportId: string) => { ok: boolean; message: string };
  updateRoutePricing: (routeId: string, pricing: RoutePricing) => void;
  updateAircraftRegistration: (aircraftId: string, registration: string) => { ok: boolean; message: string };
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
        updateLeaderboard(game);
        set({ game, notice: "Base airport purchased. Your airline is cleared for startup." });
      },
      resetGame: () => set({ game: null, notice: null }),
      setAdminUser: (isAdminUser) => set({ isAdminUser }),
      clearNotice: () => set({ notice: null }),
      hydrateGameTime: () => {
        const game = get().game;
        if (!game) return;
        // Startup reconciliation should not force a persistence write before migration and hydration settle.
        skipNextGameSaveWrite();
        advanceSimulation(set, normalizeGame(game), Date.now());
      },
      setTimeMultiplier: (speed) => {
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

        const gameAfterPurchase = spendCash(game, validation.purchasePriceGBP);
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
          totalFlights: 0,
          passengerCount: 0,
          cargoTransportedTons: 0
        };
        const nextGame = {
          ...gameAfterPurchase,
          fleet: [...game.fleet, aircraft]
        };
        updateLeaderboard(nextGame);
        const message = `${aircraft.registration} ${model.manufacturer} ${model.model} joined the fleet with a custom cabin.`;
        set({
          game: nextGame,
          notice: message
        });
        return { ok: true, message, aircraft };
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
          ...spendCash(game, cost),
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
          ...spendCash(game, BASE_AIRPORT_COST),
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
        const nextGame = addCash(game, amount);
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
        const nextGame = updateCash(game, amount);
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
        const game = normalizeGame(get().game);
        if (!game) return { ok: false, message: "Start or load a game before saving a timetable." };
        const aircraft = game.fleet.find((item) => item.id === input.aircraftId);
        const route = game.routes.find((item) => item.id === input.routeId);
        if (!aircraft || !route) {
          const message = !aircraft ? "Select an aircraft." : "Select a route.";
          set({ notice: message });
          return { ok: false, message };
        }
        const model = aircraftById[aircraft.modelId];
        if (!model) {
          const message = "Aircraft model data is missing.";
          set({ notice: message });
          return { ok: false, message };
        }
        const scheduleBaseAirportId = input.scheduleBaseAirportId ?? route.originAirportId;
        if (!game.baseAirports.includes(scheduleBaseAirportId)) {
          const message = "No base airport available.";
          set({ notice: message });
          return { ok: false, message };
        }
        if (route.originAirportId !== scheduleBaseAirportId) {
          const message = "Schedule save failed: this route does not belong to the selected base.";
          set({ notice: message });
          return { ok: false, message };
        }
        if (aircraft.homeBaseAirportId !== scheduleBaseAirportId) {
          const message = "Schedule save failed: this aircraft is not based at the selected airport.";
          set({ notice: message });
          return { ok: false, message };
        }
        const normalizedOutbound = validateFlightNumber(input.outboundFlightNumber);
        const normalizedReturn = input.isRoundTrip ? validateFlightNumber(input.returnFlightNumber ?? "") : null;
        if (!/^\d{2}:\d{2}$/.test(input.departureTimeLocal)) {
          const message = "Choose a valid departure time.";
          set({ notice: message });
          return { ok: false, message };
        }
        if (!isAllowedScheduleMinute(Number(input.departureTimeLocal.split(":")[1] ?? 0))) {
          const message = "Departure minutes must be 00, 05, 10, 15, 20, 25, 30, 35, 40, 45, 50, or 55.";
          set({ notice: message });
          return { ok: false, message };
        }
        const normalizedDepartureTime = normalizeScheduleTime(input.departureTimeLocal);
        const existingForValidation = aircraft.schedule.filter((item) => item.weeklyScheduleId !== input.replaceWeeklyScheduleId);
        const allWeeklySchedules = game.fleet.flatMap((fleetAircraft) => fleetAircraft.weeklySchedules);
        const duplicateFlightNumber = findDuplicateFlightNumber({
          outboundFlightNumber: input.outboundFlightNumber,
          returnFlightNumber: input.returnFlightNumber,
          isRoundTrip: input.isRoundTrip,
          schedules: allWeeklySchedules,
          currentScheduleId: input.replaceWeeklyScheduleId
        });
        if (duplicateFlightNumber) {
          const message = "Flight number already exists. Please use a unique flight number.";
          set({ notice: message });
          return { ok: false, message };
        }
        const validationMessage = validateWeeklySchedule({
          aircraft,
          route,
          daysOfWeek: input.daysOfWeek,
          departureTimeLocal: normalizedDepartureTime,
          outboundFlightNumber: input.outboundFlightNumber,
          returnFlightNumber: input.returnFlightNumber,
          isRoundTrip: input.isRoundTrip,
          existingSchedules: existingForValidation
        });
        if (validationMessage) {
          set({ notice: validationMessage });
          return { ok: false, message: validationMessage };
        }
        const retainedWeeklySchedules = aircraft.weeklySchedules.filter((item) => item.id !== input.replaceWeeklyScheduleId);
        const retainedSchedule = aircraft.schedule.filter((item) => item.weeklyScheduleId !== input.replaceWeeklyScheduleId || item.status === "completed");
        if (!input.replaceWeeklyScheduleId && retainedWeeklySchedules.length === 0 && aircraft.currentAirportId !== route.originAirportId) {
          const message = `Position ${aircraft.registration} at ${airportsById[route.originAirportId].iata} before starting this service.`;
          set({ notice: message });
          return { ok: false, message };
        }
        const block = calculateScheduleBlock(route, aircraft);
        const nowIso = new Date().toISOString();
        const existingSchedule = input.replaceWeeklyScheduleId
          ? aircraft.weeklySchedules.find((item) => item.id === input.replaceWeeklyScheduleId)
          : undefined;

        const weeklySchedule: WeeklySchedule = {
          aircraftId: input.aircraftId,
          routeId: input.routeId,
          outboundFlightNumber: normalizedOutbound.flightNumber,
          returnFlightNumber: input.isRoundTrip ? normalizedReturn?.flightNumber ?? nextFlightNumber(normalizedOutbound.flightNumber) : undefined,
          daysOfWeek: input.daysOfWeek,
          departureTimeLocal: normalizedDepartureTime,
          isRoundTrip: input.isRoundTrip,
          blockMinutes: input.isRoundTrip ? block.roundTripBlockMinutes : block.oneWayBlockMinutes,
          turnaroundMinutes: block.turnaroundMinutes,
          id: existingSchedule?.id ?? createId("weekly"),
          createdGameTime: game.currentGameTimeMs,
          recurrenceRule: `WEEKLY:${input.daysOfWeek.join(",")}@${normalizedDepartureTime}`,
          createdAt: existingSchedule?.createdAt ?? nowIso,
          updatedAt: nowIso
        };
        const testAircraft = {
          ...aircraft,
          schedule: retainedSchedule,
          weeklySchedules: [...retainedWeeklySchedules, weeklySchedule]
        };
        const generated = generateWeeklyEvents(testAircraft, game.routes, game.currentGameTimeMs, game.currentGameTimeMs + WEEK_MS);
        const candidateSchedule = mergeGeneratedEvents(
          retainedSchedule.filter((item) => item.status !== "completed"),
          generated
        );
        const conflict = findScheduleConflict(candidateSchedule, aircraft.currentAirportId);
        if (conflict) {
          set({ notice: conflict });
          return { ok: false, message: conflict };
        }

        const nextFleet = game.fleet.map((item) =>
          item.id === aircraft.id
            ? {
                ...testAircraft,
                schedule: applyOperationalDelays(mergeGeneratedEvents(retainedSchedule, generated), testAircraft, game.routes)
              }
            : item
        );
        const updatedGame = { ...game, fleet: nextFleet };
        set({ game: updatedGame, notice: "Timetable saved." });
        return { ok: true, message: "Timetable saved." };
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
                      (item) => item.weeklyScheduleId !== weeklyScheduleId || item.status === "completed"
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
  nextGame = instantiateRecurringFlights(nextGame);

  let money = nextGame.money;
  let totalProfit = nextGame.totalProfit;
  let completedFlights = nextGame.completedFlights;
  let passengerCount = nextGame.passengerCount;
  let cargoTransportedTons = nextGame.cargoTransportedTons;
  const flightLog = [...nextGame.flightLog];
  const expandedAirportIds = [...nextGame.expandedAirportIds];

  const fleet = nextGame.fleet.map((aircraft) => {
    const model = aircraftById[aircraft.modelId];
    let currentAirportId = aircraft.currentAirportId;
    let totalRevenue = aircraft.totalRevenue;
    let totalFlights = aircraft.totalFlights;
    let aircraftPassengers = aircraft.passengerCount;
    let aircraftCargo = aircraft.cargoTransportedTons;

    const schedule = aircraft.schedule.map((item) => {
      if (!model || item.status === "completed") return item;
      if (currentGameTimeMs >= item.arrivalGameTime) {
        const route = nextGame.routes.find((candidate) => candidate.id === item.routeId);
        if (!route) return item;
        const financials = estimateFlightFinancials(route, model, aircraft, item.departureGameTime + item.arrivalGameTime, nextGame.difficultyConfig);
        money += financials.profit;
        totalProfit += financials.profit;
        completedFlights += 1;
        totalRevenue += financials.revenue;
        totalFlights += 1;
        passengerCount += financials.passengerCount;
        cargoTransportedTons += financials.cargoTons;
        aircraftPassengers += financials.passengerCount;
        aircraftCargo += financials.cargoTons;
        currentAirportId = item.destinationAirportId;
        expandedAirportIds.push(item.destinationAirportId);
        flightLog.unshift({
          id: item.id,
          aircraftId: aircraft.id,
          aircraftRegistration: aircraft.registration,
          flightNumber: item.flightNumber,
          routeId: route.id,
          originAirportId: item.originAirportId,
          destinationAirportId: item.destinationAirportId,
          completedGameTime: item.arrivalGameTime,
          revenue: financials.revenue,
          cost: financials.cost,
          profit: financials.profit,
          passengerCount: financials.passengerCount,
          cargoTons: financials.cargoTons
        });
        return { ...item, status: "completed" as const, operationalStatus: "arrived" as const, ...financials };
      }

      if (currentGameTimeMs >= item.departureGameTime) {
        return { ...item, status: "in-flight" as const, operationalStatus: item.delayMinutes && item.delayMinutes > 0 ? ("delayed" as const) : ("departed" as const) };
      }
      return item;
    });

    const retainedSchedule = pruneOperationalFlights(schedule, currentGameTimeMs);
    const hasFuture = retainedSchedule.some((item) => item.status === "scheduled");
    const hasActive = retainedSchedule.some((item) => item.status === "in-flight");

    return {
      ...aircraft,
      currentAirportId,
      status: hasActive ? ("in-flight" as const) : hasFuture ? ("scheduled" as const) : ("idle" as const),
      schedule: retainedSchedule,
      totalRevenue,
      totalFlights,
      passengerCount: aircraftPassengers,
      cargoTransportedTons: Math.round(aircraftCargo * 10) / 10
    };
  });

  const completedNotice = completedFlights > nextGame.completedFlights ? "Flight completed. Finance log updated." : null;
  const beforeBankruptcyGame: GameState = {
    ...nextGame,
    money,
    totalProfit,
    completedFlights,
    passengerCount,
    cargoTransportedTons: Math.round(cargoTransportedTons * 10) / 10,
    flightLog: flightLog.slice(0, 60),
    expandedAirportIds: unique(expandedAirportIds),
    fleet
  };
  const finalGame = applyBankruptcyRules(beforeBankruptcyGame);
  const bankruptcyNotice = bankruptcyMessage(beforeBankruptcyGame, finalGame);
  updateLeaderboard(finalGame);
  set({ game: finalGame, notice: bankruptcyNotice ?? completedNotice });
}

function instantiateRecurringFlights(game: GameState) {
  const horizonEnd = game.currentGameTimeMs + WEEK_MS * 2;
  return {
    ...game,
    fleet: game.fleet.map((aircraft) => {
      const merged = mergeGeneratedEvents(
        aircraft.schedule,
        generateWeeklyEvents(aircraft, game.routes, game.currentGameTimeMs - DAY_MS, horizonEnd)
      );
      return {
        ...aircraft,
        schedule: pruneOperationalFlights(applyOperationalDelays(merged, aircraft, game.routes), game.currentGameTimeMs)
      };
    })
  };
}

function applyOperationalDelays(items: ScheduleItem[], aircraft: AircraftInstance, routes: Route[]) {
  let readyGameTime = 0;
  return [...items]
    .sort((a, b) => (a.scheduledDepartureGameTime ?? a.departureGameTime) - (b.scheduledDepartureGameTime ?? b.departureGameTime))
    .map((item) => {
      if (item.status === "completed") {
        readyGameTime = Math.max(readyGameTime, item.readyGameTime);
        return item;
      }
      const route = routes.find((candidate) => candidate.id === item.routeId);
      const model = aircraftById[aircraft.modelId];
      if (!route || !model) return item;
      const scheduledDepartureGameTime = item.scheduledDepartureGameTime ?? item.departureGameTime;
      const flightDuration = flightWaitMs(route.distanceKm, model.cruiseSpeedKmh);
      const delayMinutes = item.delayMinutes ?? generateDelayMinutes(item.id);
      const baseDelayedDeparture = scheduledDepartureGameTime + delayMinutes * 60_000;
      const actualDepartureGameTime = Math.max(baseDelayedDeparture, readyGameTime);
      const actualArrivalGameTime = actualDepartureGameTime + flightDuration;
      const nextReadyGameTime = actualArrivalGameTime + turnaroundWaitMs(model.turnaroundMinutes);
      readyGameTime = nextReadyGameTime;
      return {
        ...item,
        scheduledDepartureGameTime,
        scheduledArrivalGameTime: item.scheduledArrivalGameTime ?? scheduledDepartureGameTime + flightDuration,
        actualDepartureGameTime,
        actualArrivalGameTime,
        delayMinutes: Math.round((actualDepartureGameTime - scheduledDepartureGameTime) / 60_000),
        operationalStatus: actualDepartureGameTime > scheduledDepartureGameTime ? ("delayed" as const) : ("onTime" as const),
        departureGameTime: actualDepartureGameTime,
        arrivalGameTime: actualArrivalGameTime,
        readyGameTime: nextReadyGameTime
      };
    });
}

function generateDelayMinutes(seedText: string) {
  const probabilityNoise = deterministicNoise(seedText, 17);
  const delayProbability = BASE_DELAY_PROBABILITY + (probabilityNoise * 2 - 1) * DELAY_PROBABILITY_JITTER;
  if (deterministicNoise(seedText, 29) > delayProbability) return 0;
  return Math.round(deterministicNoise(seedText, 41) * MAX_DELAY_MINUTES);
}

function deterministicNoise(seedText: string, salt: number) {
  let hash = salt;
  for (let index = 0; index < seedText.length; index += 1) {
    hash = (hash * 31 + seedText.charCodeAt(index)) % 1_000_003;
  }
  return (Math.sin(hash) + 1) / 2;
}

function generateWeeklyEvents(aircraft: AircraftInstance, routes: Route[], fromGameTime: number, toGameTime: number) {
  const events: ScheduleItem[] = [];
  const start = weekStartMs(fromGameTime) - WEEK_MS;
  const end = weekStartMs(toGameTime) + WEEK_MS;

  for (let week = start; week <= end; week += WEEK_MS) {
    aircraft.weeklySchedules.forEach((weekly) => {
      const route = routes.find((item) => item.id === weekly.routeId);
      const model = aircraftById[aircraft.modelId];
      if (!route || !model) return;
      weekly.daysOfWeek.forEach((day) => {
        const departure = week + day * DAY_MS + timeOfDayMs(weekly.departureTimeLocal);
        if (departure < weekly.createdGameTime || departure < fromGameTime || departure > toGameTime) return;
        const outbound = createFlightItem({
          aircraft,
          route,
          model,
          originAirportId: route.originAirportId,
          destinationAirportId: route.destinationAirportId,
          departureGameTime: departure,
          weeklyScheduleId: weekly.id,
          operatingDay: day,
          flightNumber: weekly.outboundFlightNumber,
          legType: "outbound",
          fixedId: `${weekly.id}-${departure}-out`
        });
        events.push(outbound);
        if (weekly.isRoundTrip) {
          events.push(
            createFlightItem({
              aircraft,
              route,
              model,
              originAirportId: route.destinationAirportId,
              destinationAirportId: route.originAirportId,
              departureGameTime: outbound.readyGameTime,
              weeklyScheduleId: weekly.id,
              operatingDay: day,
              flightNumber: weekly.returnFlightNumber ?? nextFlightNumber(weekly.outboundFlightNumber),
              legType: "return",
              fixedId: `${weekly.id}-${departure}-return`
            })
          );
        }
      });
    });
  }

  return events;
}

function createFlightItem(input: {
  aircraft: AircraftInstance;
  route: Route;
  model: NonNullable<(typeof aircraftById)[string]>;
  originAirportId: string;
  destinationAirportId: string;
  departureGameTime: number;
  weeklyScheduleId?: string;
  operatingDay?: DayOfWeek;
  flightNumber?: string;
  legType?: "outbound" | "return";
  fixedId?: string;
}): ScheduleItem {
  const arrivalGameTime = input.departureGameTime + flightWaitMs(input.route.distanceKm, input.model.cruiseSpeedKmh);
  return {
    id: input.fixedId ?? createId("flight"),
    weeklyScheduleId: input.weeklyScheduleId,
    routeId: input.route.id,
    aircraftId: input.aircraft.id,
    flightNumber: input.flightNumber,
    legType: input.legType,
    originAirportId: input.originAirportId,
    destinationAirportId: input.destinationAirportId,
    scheduledDepartureGameTime: input.departureGameTime,
    scheduledArrivalGameTime: arrivalGameTime,
    actualDepartureGameTime: input.departureGameTime,
    actualArrivalGameTime: arrivalGameTime,
    delayMinutes: 0,
    operationalStatus: "onTime",
    departureGameTime: input.departureGameTime,
    arrivalGameTime,
    readyGameTime: arrivalGameTime + turnaroundWaitMs(input.model.turnaroundMinutes),
    status: "scheduled",
    isRecurring: Boolean(input.weeklyScheduleId),
    operatingDay: input.operatingDay
  };
}

function mergeGeneratedEvents(existing: ScheduleItem[], generated: ScheduleItem[]) {
  const byId = new Map(existing.map((item) => [item.id, item]));
  generated.forEach((item) => {
    if (!byId.has(item.id)) byId.set(item.id, item);
  });
  return Array.from(byId.values()).sort((a, b) => a.departureGameTime - b.departureGameTime);
}

function findScheduleConflict(items: ScheduleItem[], startingAirportId: string) {
  const future = [...items].sort((a, b) => a.departureGameTime - b.departureGameTime);
  let expectedAirportId = startingAirportId;
  let readyGameTime = 0;

  for (const item of future) {
    if (item.originAirportId !== expectedAirportId) {
      return `Schedule conflict: ${airportsById[item.originAirportId].iata} departure requires the aircraft, but it is expected at ${airportsById[expectedAirportId]?.iata ?? "another airport"}.`;
    }
    if (item.departureGameTime < readyGameTime) {
      return `Schedule conflict: ${airportsById[item.originAirportId].iata} departure overlaps a previous flight and turnaround.`;
    }
    expectedAirportId = item.destinationAirportId;
    readyGameTime = item.readyGameTime;
  }
  return null;
}

function getLatestSchedulePosition(aircraft: AircraftInstance, routes: Route[]) {
  const latest = [...aircraft.schedule]
    .filter((item) => item.status !== "completed")
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

function normalizeGame(game: GameState | null | undefined): GameState | null {
  if (!game) return null;
  const rawGame = game as GameState & {
    cash?: unknown;
    capital?: unknown;
    playerMoney?: unknown;
    baseAirport?: unknown;
    airline?: { cash?: unknown; money?: unknown };
  };
  const { cash: _cash, capital: _capital, playerMoney: _playerMoney, airline: _airline, ...cleanGame } = rawGame;
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
      return {
        ...aircraft,
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
          actualDepartureGameTime: item.actualDepartureGameTime ?? item.departureGameTime,
          actualArrivalGameTime: item.actualArrivalGameTime ?? item.arrivalGameTime,
          delayMinutes: item.delayMinutes ?? 0,
          operationalStatus: item.operationalStatus ?? (item.status === "completed" ? "arrived" : item.status === "in-flight" ? "departed" : "onTime")
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
    return {
      ...game,
      money: game.money + config.bankruptcyBailoutAmount,
      bailoutsUsed: game.bailoutsUsed + 1,
      gameStatus: "active"
    };
  }
  if (config.difficulty === "easy" && (config.bankruptcyBailoutLimit === "unlimited" || game.bailoutsUsed < config.bankruptcyBailoutLimit)) {
    return {
      ...game,
      money: game.money + config.bankruptcyBailoutAmount,
      bailoutsUsed: game.bailoutsUsed + 1,
      gameStatus: "active"
    };
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
