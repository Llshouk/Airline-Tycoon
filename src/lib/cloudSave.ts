import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import type { GameState } from "@/types/game";

const SAVE_NAME = "Main Save";
const LOCAL_SAVE_KEY = "airline-tycoon-v1";

export type CloudSaveMetadata = {
  saveName: string;
  updatedAt: string;
  createdAt?: string;
};

export type CloudSaveData = {
  gameState: GameState;
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
  const gameStateForCloud = { ...gameState, updatedAt };
  const { error } = await supabase!.from("game_saves").upsert(
    {
      user_id: user.id,
      save_name: SAVE_NAME,
      game_state: gameStateForCloud,
      updated_at: updatedAt
    },
    {
      onConflict: "user_id,save_name"
    }
  );

  if (error) throw error;
  return { saveName: SAVE_NAME, updatedAt };
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
    gameState: data.game_state as GameState,
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

export function isSupabaseConfigured() {
  return Boolean(supabase);
}

async function requireUser(): Promise<User> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const user = await getCurrentUser();
  if (!user) throw new Error("Please log in to use cloud save.");
  return user;
}

// TODO: Add debounced auto-save after important game mutations once conflict prompts
// can prevent accidental cloud overwrites across devices.
