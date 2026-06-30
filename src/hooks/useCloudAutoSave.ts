"use client";

import type { User } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { isSupabaseConfigured, saveGameToCloud } from "@/lib/cloudSave";
import type { GameState } from "@/types/game";

const AUTO_SAVE_INTERVAL_MS = 60_000;

export type CloudAutoSaveStatus = {
  state: "disabled" | "idle" | "saving" | "saved" | "failed";
  lastSavedAt: string | null;
  message: string | null;
};

export function useCloudAutoSave(gameState: GameState | null, user: User | null): CloudAutoSaveStatus {
  const latestGameRef = useRef<GameState | null>(gameState);
  const isSavingRef = useRef(false);
  const hasGame = Boolean(gameState);
  const [status, setStatus] = useState<CloudAutoSaveStatus>({
    state: "disabled",
    lastSavedAt: null,
    message: null
  });

  useEffect(() => {
    latestGameRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    if (!user || !hasGame || !isSupabaseConfigured()) {
      setStatus((current) => ({ ...current, state: "disabled", message: null }));
      return;
    }

    setStatus((current) => ({
      ...current,
      state: current.state === "saved" ? "saved" : "idle",
      message: null
    }));

    const save = async () => {
      const latestGame = latestGameRef.current;
      if (!latestGame || isSavingRef.current) return;
      isSavingRef.current = true;
      setStatus((current) => ({ ...current, state: "saving", message: null }));
      try {
        const metadata = await saveGameToCloud(latestGame);
        setStatus({
          state: "saved",
          lastSavedAt: metadata.updatedAt,
          message: null
        });
      } catch {
        setStatus((current) => ({ ...current, state: "failed", message: null }));
      } finally {
        isSavingRef.current = false;
      }
    };

    const timer = window.setInterval(() => {
      void save();
    }, AUTO_SAVE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [hasGame, user]);

  return status;
}
