import type { User } from "@supabase/supabase-js";
import { DIFFICULTY_ORDER, getDifficultyConfig, type GameDifficulty } from "@/config/difficulty";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import { GAME_SPEED_OPTIONS } from "@/lib/time";
import type { AircraftInstance, GameState, Route, TimeMultiplier } from "@/types/game";

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
  | "difficulty"
  | "difficultyConfig"
  | "gameStatus"
  | "bailoutsUsed"
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
  difficulty: GameDifficulty;
  gameStatus?: GameState["gameStatus"];
  airlineName?: string;
  money?: number;
  fleetSize?: number;
  routeCount?: number;
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

type CloudSaveStep =
  | "configuration"
  | "auth.getUser"
  | "compactSave.validate"
  | "game_saves.select"
  | "game_saves.upsert";

type SupabaseErrorLike = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
  status?: number;
  name?: string;
};

export class CloudSaveError extends Error {
  step: CloudSaveStep;
  code?: string;
  status?: number;
  details?: string;
  hint?: string;
  userMessage: string;

  constructor(step: CloudSaveStep, message: string, options: { code?: string; status?: number; details?: string; hint?: string; userMessage?: string } = {}) {
    super(message);
    this.name = "CloudSaveError";
    this.step = step;
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
    this.hint = options.hint;
    this.userMessage = options.userMessage ?? message;
  }
}

export async function getCurrentUser(): Promise<User | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) throw createCloudSaveError("auth.getUser", error);
  return data.user;
}

export async function saveGameToCloud(gameState: GameState): Promise<CloudSaveMetadata> {
  const user = await requireUser();
  const updatedAt = new Date().toISOString();
  const compactSave = createCompactSaveState(gameState, updatedAt);
  validateCompactSaveState(compactSave, user);
  const { error } = await supabase!.from("game_saves").upsert(
    {
      user_id: user.id,
      difficulty: compactSave.difficulty,
      save_name: `${compactSave.difficulty}-save`,
      game_state: compactSave,
      updated_at: updatedAt
    },
    {
      onConflict: "user_id,difficulty"
    }
  );

  if (error) throw createCloudSaveError("game_saves.upsert", error, { user, difficulty: compactSave.difficulty });
  return {
    saveName: `${compactSave.difficulty}-save`,
    difficulty: compactSave.difficulty,
    gameStatus: compactSave.gameStatus,
    airlineName: compactSave.airlineName,
    money: compactSave.money,
    fleetSize: compactSave.fleet.length,
    routeCount: compactSave.routes.length,
    updatedAt
  };
}

export function createCompactSaveState(gameState: GameState, updatedAt = new Date().toISOString()): CompactGameSave {
  return {
    saveVersion: 1,
    airlineName: gameState.airlineName,
    difficulty: gameState.difficulty,
    difficultyConfig: gameState.difficultyConfig,
    gameStatus: gameState.gameStatus,
    bailoutsUsed: gameState.bailoutsUsed,
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

export async function loadGameFromCloud(difficulty: GameDifficulty): Promise<CloudSaveData | null> {
  const user = await requireUser();
  const { data, error } = await supabase!
    .from("game_saves")
    .select("game_state, save_name, difficulty, updated_at, created_at")
    .eq("user_id", user.id)
    .eq("difficulty", difficulty)
    .maybeSingle();

  if (error) throw createCloudSaveError("game_saves.select", error, { user, difficulty });
  if (!data) return null;

  return {
    compactSave: normalizeCloudPayload(data.game_state, data.difficulty),
    gameState: restoreGameStateFromCloudSave(data.game_state, data.difficulty),
    metadata: {
      saveName: data.save_name,
      difficulty: normalizeCloudPayload(data.game_state, data.difficulty).difficulty,
      gameStatus: normalizeCloudPayload(data.game_state, data.difficulty).gameStatus,
      airlineName: normalizeCloudPayload(data.game_state, data.difficulty).airlineName,
      money: normalizeCloudPayload(data.game_state, data.difficulty).money,
      fleetSize: normalizeCloudPayload(data.game_state, data.difficulty).fleet.length,
      routeCount: normalizeCloudPayload(data.game_state, data.difficulty).routes.length,
      updatedAt: data.updated_at,
      createdAt: data.created_at
    }
  };
}

export async function loadCloudSaveIntoGame(difficulty: GameDifficulty, applyGameState: (gameState: GameState) => void): Promise<CloudSaveData | null> {
  const cloudSave = await loadGameFromCloud(difficulty);
  if (!cloudSave) return null;
  applyGameState(cloudSave.gameState);
  return cloudSave;
}

export async function getCloudSaveSlots(): Promise<Record<GameDifficulty, CloudSaveMetadata | null>> {
  const user = await requireUser();
  const { data, error } = await supabase!
    .from("game_saves")
    .select("save_name, difficulty, game_state, updated_at, created_at")
    .eq("user_id", user.id)
    .in("difficulty", DIFFICULTY_ORDER);

  if (error) throw createCloudSaveError("game_saves.select", error, { user });
  const slots: Record<GameDifficulty, CloudSaveMetadata | null> = { simulation: null, easy: null, realistic: null };
  (data ?? []).forEach((row) => {
    const compact = normalizeCloudPayload(row.game_state, row.difficulty);
    slots[compact.difficulty] = {
      saveName: row.save_name,
      difficulty: compact.difficulty,
      gameStatus: compact.gameStatus,
      airlineName: compact.airlineName,
      money: compact.money,
      fleetSize: compact.fleet.length,
      routeCount: compact.routes.length,
      updatedAt: row.updated_at,
      createdAt: row.created_at
    };
  });
  return slots;
}

export async function getCloudSaveMetadata(difficulty: GameDifficulty = "easy"): Promise<CloudSaveMetadata | null> {
  const slots = await getCloudSaveSlots();
  return slots[difficulty];
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

export function restoreGameStateFromCloudSave(saveState: unknown, rowDifficulty?: string): GameState {
  const compact = normalizeCloudPayload(saveState, rowDifficulty);
  return {
    airlineName: compact.airlineName,
    difficulty: compact.difficulty,
    difficultyConfig: compact.difficultyConfig,
    gameStatus: compact.gameStatus,
    bailoutsUsed: compact.bailoutsUsed,
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
  if (!supabase) {
    const message = getSupabaseConfigurationMessage() ?? "Supabase is not configured.";
    const error = new CloudSaveError("configuration", message, { userMessage: message });
    logCloudSaveError(error);
    throw error;
  }
  const user = await getCurrentUser();
  if (!user) {
    const error = new CloudSaveError("auth.getUser", "No authenticated Supabase user was returned.", {
      userMessage: "Please log in to use cloud save."
    });
    logCloudSaveError(error);
    throw error;
  }
  return user;
}

function validateCompactSaveState(compactSave: CompactGameSave, user: User) {
  try {
    const json = JSON.stringify(compactSave);
    const sizeBytes = typeof TextEncoder === "undefined" ? json.length : new TextEncoder().encode(json).length;
    if (sizeBytes > 900_000) {
      console.error("[cloud-save] Compact save is unusually large.", {
        step: "compactSave.validate",
        sizeBytes,
        difficulty: compactSave.difficulty,
        user: safeUserContext(user)
      });
    }
  } catch (error) {
    const cloudError = createCloudSaveError("compactSave.validate", error, { user, difficulty: compactSave.difficulty });
    throw cloudError;
  }
}

function createCloudSaveError(step: CloudSaveStep, error: unknown, context: { user?: User; difficulty?: GameDifficulty } = {}) {
  const parsed = parseSupabaseError(error);
  const diagnostic = diagnosticMessage(step, parsed);
  const cloudError = new CloudSaveError(step, parsed.message, {
    code: parsed.code,
    status: parsed.status,
    details: parsed.details,
    hint: parsed.hint,
    userMessage: diagnostic
  });
  logCloudSaveError(cloudError, context);
  return cloudError;
}

export function getCloudSaveErrorMessage(error: unknown, fallback: string) {
  if (error instanceof CloudSaveError) return error.userMessage;
  if (error instanceof Error) return error.message;
  return fallback;
}

export function getCloudSaveErrorDetails(error: unknown) {
  const parsed = parseSupabaseError(error);
  const step = error instanceof CloudSaveError ? error.step : undefined;
  return {
    step,
    message: parsed.message,
    code: parsed.code,
    status: parsed.status,
    details: parsed.details,
    hint: parsed.hint
  };
}

function logCloudSaveError(error: CloudSaveError, context: { user?: User; difficulty?: GameDifficulty } = {}) {
  console.error("[cloud-save] Supabase cloud save failed.", {
    step: error.step,
    message: error.message,
    code: error.code,
    status: error.status,
    details: error.details,
    hint: error.hint,
    difficulty: context.difficulty,
    user: context.user ? safeUserContext(context.user) : undefined
  });
}

function parseSupabaseError(error: unknown): Required<Pick<SupabaseErrorLike, "message">> & Omit<SupabaseErrorLike, "message"> {
  if (error instanceof Error) {
    const maybe = error as Error & SupabaseErrorLike;
    return {
      message: maybe.message,
      code: maybe.code,
      details: maybe.details,
      hint: maybe.hint,
      status: maybe.status,
      name: maybe.name
    };
  }
  if (error && typeof error === "object") {
    const maybe = error as SupabaseErrorLike;
    return {
      message: maybe.message ?? "Unknown Supabase error.",
      code: maybe.code,
      details: maybe.details,
      hint: maybe.hint,
      status: maybe.status,
      name: maybe.name
    };
  }
  return { message: String(error || "Unknown Supabase error.") };
}

function diagnosticMessage(step: CloudSaveStep, error: SupabaseErrorLike) {
  const text = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  if (step === "game_saves.upsert" && (error.code === "42P10" || text.includes("unique") || text.includes("on conflict"))) {
    return "Cloud save failed because Supabase needs a unique index on user_id + difficulty. Run the game_saves difficulty migration SQL.";
  }
  if ((step === "game_saves.upsert" || step === "game_saves.select") && (error.code === "42703" || text.includes("difficulty"))) {
    return "Cloud save failed because the game_saves table is missing the difficulty column. Run the game_saves difficulty migration SQL.";
  }
  if (error.code === "42501" || text.includes("row-level security") || text.includes("violates row-level security")) {
    return "Cloud save failed because Supabase RLS is blocking this user. Add policies that allow authenticated users to select, insert, update, and delete their own game_saves rows.";
  }
  if (step === "auth.getUser") return "Cloud save failed because no valid logged-in Supabase user could be confirmed.";
  if (step === "compactSave.validate") return "Cloud save failed because the compact save could not be converted to valid JSON.";
  return error.message ?? "Cloud save failed.";
}

function safeUserContext(user: User) {
  return {
    hasUserId: Boolean(user.id),
    userIdSuffix: user.id ? user.id.slice(-6) : null,
    emailPresent: Boolean(user.email)
  };
}

function normalizeCloudPayload(saveState: unknown, rowDifficulty?: string): CompactGameSave {
  const raw = saveState as Partial<CompactGameSave> & Partial<GameState> & { flightLog?: GameState["flightLog"] };
  const now = new Date().toISOString();
  const difficultyConfig = getDifficultyConfig(raw.difficulty ?? rowDifficulty);
  const timeMultiplier = GAME_SPEED_OPTIONS.includes(raw.timeMultiplier as TimeMultiplier)
    ? (raw.timeMultiplier as TimeMultiplier)
    : difficultyConfig.speedMultiplier;
  return {
    saveVersion: 1,
    airlineName: raw.airlineName ?? "Skyline Airways",
    difficulty: difficultyConfig.difficulty,
    difficultyConfig,
    gameStatus: raw.gameStatus ?? "active",
    bailoutsUsed: raw.bailoutsUsed ?? 0,
    baseAirportId: raw.baseAirportId ?? "lhr",
    expandedAirportIds: raw.expandedAirportIds ?? (raw.baseAirportId ? [raw.baseAirportId] : ["lhr"]),
    money: raw.money ?? 0,
    startedAtRealMs: raw.startedAtRealMs ?? Date.now(),
    baseGameTimeMs: raw.baseGameTimeMs ?? Date.UTC(2026, 0, 1, 6, 0, 0),
    currentGameTimeMs: raw.currentGameTimeMs ?? Date.UTC(2026, 0, 1, 6, 0, 0),
    timeMultiplier,
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
