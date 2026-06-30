import type { User } from "@supabase/supabase-js";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import type { AircraftInstance, GameState, Route } from "@/types/game";

const SAVE_NAME = "Main Save";
const LOCAL_SAVE_KEY = "airline-tycoon-v1";

export type CompactAircraftSave = Pick<
  AircraftInstance,
  | "id"
  | "modelId"
  | "registration"
  | "currentAirportId"
  | "status"
  | "schedule"
  | "weeklySchedules"
  | "cabinLayout"
  | "purchasePriceGBP"
  | "totalRevenue"
  | "totalFlights"
  | "passengerCount"
  | "cargoTransportedTons"
>;

export type CompactRouteSave = Pick<
  Route,
  | "id"
  | "originAirportId"
  | "destinationAirportId"
  | "distanceKm"
  | "estimatedDemand"
  | "estimatedTicketPrices"
  | "estimatedCargoRatePerTon"
  | "recommendedPricing"
  | "pricing"
  | "isOpen"
>;

export type CompactGameSave = Pick<
  GameState,
  | "airlineName"
  | "baseAirportId"
  | "expandedAirportIds"
  | "money"
  | "startedAtRealMs"
  | "baseGameTimeMs"
  | "currentGameTimeMs"
  | "timeMultiplier"
  | "isPaused"
  | "totalProfit"
  | "completedFlights"
  | "passengerCount"
  | "cargoTransportedTons"
  | "lastTickRealMs"
> & {
  fleet: CompactAircraftSave[];
  routes: CompactRouteSave[];
  flightLogSummary: GameState["flightLog"];
  language?: string;
  updatedAt: string;
  saveVersion: 1;
};

export type CloudSaveMetadata = {
  saveName: string;
  updatedAt: string;
  createdAt?: string;
};

export type CloudSaveData = {
  gameState: GameState;
  compactSave: CompactGameSave;
  metadata: CloudSaveMetadata;
};

export type LocalSaveMetadata = {
  hasSave: boolean;
  updatedAt: string | null;
};

export async function getCurrentUser(): Promise<User | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export async function saveGameToCloud(gameState: GameState): Promise<CloudSaveMetadata> {
  const user = await requireUser();
  const updatedAt = new Date().toISOString();
  const compactSave = createCompactSaveState(gameState, updatedAt);
  const { error } = await supabase!.from("game_saves").upsert(
    {
      user_id: user.id,
      save_name: SAVE_NAME,
      game_state: compactSave,
      updated_at: updatedAt
    },
    {
      onConflict: "user_id,save_name"
    }
  );

  if (error) throw error;
  return { saveName: SAVE_NAME, updatedAt };
}

export function createCompactSaveState(gameState: GameState, updatedAt = new Date().toISOString()): CompactGameSave {
  return {
    saveVersion: 1,
    airlineName: gameState.airlineName,
    baseAirportId: gameState.baseAirportId,
    expandedAirportIds: gameState.expandedAirportIds,
    money: gameState.money,
    startedAtRealMs: gameState.startedAtRealMs,
    baseGameTimeMs: gameState.baseGameTimeMs,
    currentGameTimeMs: gameState.currentGameTimeMs,
    timeMultiplier: gameState.timeMultiplier,
    isPaused: gameState.isPaused,
    fleet: gameState.fleet.map((aircraft) => ({
      id: aircraft.id,
      modelId: aircraft.modelId,
      registration: aircraft.registration,
      currentAirportId: aircraft.currentAirportId,
      status: aircraft.status,
      schedule: aircraft.schedule,
      weeklySchedules: aircraft.weeklySchedules,
      cabinLayout: aircraft.cabinLayout,
      purchasePriceGBP: aircraft.purchasePriceGBP,
      totalRevenue: aircraft.totalRevenue,
      totalFlights: aircraft.totalFlights,
      passengerCount: aircraft.passengerCount,
      cargoTransportedTons: aircraft.cargoTransportedTons
    })),
    routes: gameState.routes.map((route) => ({
      id: route.id,
      originAirportId: route.originAirportId,
      destinationAirportId: route.destinationAirportId,
      distanceKm: route.distanceKm,
      estimatedDemand: route.estimatedDemand,
      estimatedTicketPrices: route.estimatedTicketPrices,
      estimatedCargoRatePerTon: route.estimatedCargoRatePerTon,
      recommendedPricing: route.recommendedPricing,
      pricing: route.pricing,
      isOpen: route.isOpen
    })),
    flightLogSummary: gameState.flightLog.slice(0, 30),
    totalProfit: gameState.totalProfit,
    completedFlights: gameState.completedFlights,
    passengerCount: gameState.passengerCount,
    cargoTransportedTons: gameState.cargoTransportedTons,
    lastTickRealMs: gameState.lastTickRealMs,
    language: getStoredLanguage(),
    updatedAt
  };
}

export async function uploadLocalSaveToCloud(gameState: GameState): Promise<CloudSaveMetadata> {
  return saveGameToCloud(gameState);
}

export async function loadGameFromCloud(): Promise<CloudSaveData | null> {
  const user = await requireUser();
  const { data, error } = await supabase!
    .from("game_saves")
    .select("game_state, save_name, updated_at, created_at")
    .eq("user_id", user.id)
    .eq("save_name", SAVE_NAME)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
      compactSave: normalizeCloudPayload(data.game_state),
      gameState: restoreGameStateFromCloudSave(data.game_state),
      metadata: {
      saveName: data.save_name,
      updatedAt: data.updated_at,
      createdAt: data.created_at
    }
  };
}

export async function loadCloudSaveIntoGame(applyGameState: (gameState: GameState) => void): Promise<CloudSaveData | null> {
  const cloudSave = await loadGameFromCloud();
  if (!cloudSave) return null;
  applyGameState(cloudSave.gameState);
  return cloudSave;
}

export async function getCloudSaveMetadata(): Promise<CloudSaveMetadata | null> {
  const user = await requireUser();
  const { data, error } = await supabase!
    .from("game_saves")
    .select("save_name, updated_at, created_at")
    .eq("user_id", user.id)
    .eq("save_name", SAVE_NAME)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    saveName: data.save_name,
    updatedAt: data.updated_at,
    createdAt: data.created_at
  };
}

export function getLocalSaveMetadata(): LocalSaveMetadata {
  if (typeof window === "undefined") return { hasSave: false, updatedAt: null };
  const stored = window.localStorage.getItem(LOCAL_SAVE_KEY);
  if (!stored) return { hasSave: false, updatedAt: null };

  try {
    const parsed = JSON.parse(stored) as { state?: { game?: GameState | null } };
    const updatedAt = parsed.state?.game?.updatedAt ?? null;
    return { hasSave: Boolean(parsed.state?.game), updatedAt };
  } catch {
    return { hasSave: true, updatedAt: null };
  }
}

export function restoreGameStateFromCloudSave(saveState: unknown): GameState {
  const compact = normalizeCloudPayload(saveState);
  return {
    airlineName: compact.airlineName,
    baseAirportId: compact.baseAirportId,
    expandedAirportIds: compact.expandedAirportIds,
    money: compact.money,
    startedAtRealMs: compact.startedAtRealMs,
    baseGameTimeMs: compact.baseGameTimeMs,
    currentGameTimeMs: compact.currentGameTimeMs,
    timeMultiplier: compact.timeMultiplier,
    isPaused: compact.isPaused,
    fleet: compact.fleet,
    routes: compact.routes,
    flightLog: compact.flightLogSummary ?? [],
    totalProfit: compact.totalProfit,
    completedFlights: compact.completedFlights,
    passengerCount: compact.passengerCount,
    cargoTransportedTons: compact.cargoTransportedTons,
    lastTickRealMs: compact.lastTickRealMs,
    updatedAt: compact.updatedAt
  };
}

export function isSupabaseConfigured() {
  return Boolean(supabase);
}

export function getSupabaseConfigurationMessage() {
  return supabaseConfigError;
}

async function requireUser(): Promise<User> {
  if (!supabase) throw new Error(getSupabaseConfigurationMessage() ?? "Supabase is not configured.");
  const user = await getCurrentUser();
  if (!user) throw new Error("Please log in to use cloud save.");
  return user;
}

function normalizeCloudPayload(saveState: unknown): CompactGameSave {
  const raw = saveState as Partial<CompactGameSave> & Partial<GameState> & { flightLog?: GameState["flightLog"] };
  const now = new Date().toISOString();
  return {
    saveVersion: 1,
    airlineName: raw.airlineName ?? "Skyline Airways",
    baseAirportId: raw.baseAirportId ?? "lhr",
    expandedAirportIds: raw.expandedAirportIds ?? (raw.baseAirportId ? [raw.baseAirportId] : ["lhr"]),
    money: raw.money ?? 0,
    startedAtRealMs: raw.startedAtRealMs ?? Date.now(),
    baseGameTimeMs: raw.baseGameTimeMs ?? Date.UTC(2026, 0, 1, 6, 0, 0),
    currentGameTimeMs: raw.currentGameTimeMs ?? Date.UTC(2026, 0, 1, 6, 0, 0),
    timeMultiplier: raw.timeMultiplier ?? 10,
    isPaused: raw.isPaused ?? false,
    fleet: (raw.fleet ?? []) as CompactAircraftSave[],
    routes: (raw.routes ?? []) as CompactRouteSave[],
    flightLogSummary: raw.flightLogSummary ?? raw.flightLog ?? [],
    totalProfit: raw.totalProfit ?? 0,
    completedFlights: raw.completedFlights ?? 0,
    passengerCount: raw.passengerCount ?? 0,
    cargoTransportedTons: raw.cargoTransportedTons ?? 0,
    lastTickRealMs: raw.lastTickRealMs ?? Date.now(),
    language: raw.language,
    updatedAt: raw.updatedAt ?? now
  };
}

function getStoredLanguage() {
  if (typeof window === "undefined") return undefined;
  const language = window.localStorage.getItem("airline-tycoon-language");
  return language === "en" || language === "zh" ? language : undefined;
}
