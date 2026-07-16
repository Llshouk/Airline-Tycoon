"use client";

import type { User } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { getCloudSaveErrorDetails, isSupabaseConfigured, saveGameToCloud } from "@/lib/cloudSave";
import { useTranslation } from "@/i18n";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import type { GameState } from "@/types/game";
import { safeGetLocalStorage, safeRemoveLocalStorage, safeSetLocalStorage } from "@/lib/gameSaveStorage";

const AUTO_SAVE_INTERVAL_MS = 60_000;
export const CLOUD_SYNC_PENDING_KEY = "airline-tycoon-cloud-sync-pending";

export type CloudAutoSaveStatus = {
  state: "disabled" | "idle" | "saving" | "saved" | "failed" | "pending";
  lastSavedAt: string | null;
  message: string | null;
};

export function useCloudAutoSave(gameState: GameState | null, user: User | null): CloudAutoSaveStatus {
  const { t } = useTranslation();
  const isOnline = useOnlineStatus();
  const latestGameRef = useRef<GameState | null>(gameState);
  const isSavingRef = useRef(false);
  const syncPromptedRef = useRef(false);
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

    if (!isOnline) {
      safeSetLocalStorage(CLOUD_SYNC_PENDING_KEY, String(Date.now()));
      syncPromptedRef.current = false;
      setStatus((current) => ({ ...current, state: "pending", message: t("cloud.syncPendingDescription") }));
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
      } catch (error) {
        console.error("[cloud-save] Auto-save failed. Local browser save is still preserved.", getCloudSaveErrorDetails(error));
        setStatus((current) => ({ ...current, state: "failed", message: null }));
      } finally {
        isSavingRef.current = false;
      }
    };

    const timer = window.setInterval(() => {
      void save();
    }, AUTO_SAVE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [hasGame, isOnline, t, user]);

  useEffect(() => {
    if (!user || !hasGame || !isOnline || !isSupabaseConfigured() || syncPromptedRef.current) return;
    if (!safeGetLocalStorage(CLOUD_SYNC_PENDING_KEY)) return;

    syncPromptedRef.current = true;
    if (!window.confirm(t("cloud.syncNowPrompt"))) return;

    const latestGame = latestGameRef.current;
    if (!latestGame) return;

    isSavingRef.current = true;
    setStatus((current) => ({ ...current, state: "saving", message: null }));
    saveGameToCloud(latestGame)
      .then((metadata) => {
        safeRemoveLocalStorage(CLOUD_SYNC_PENDING_KEY);
        setStatus({ state: "saved", lastSavedAt: metadata.updatedAt, message: null });
      })
      .catch((error) => {
        console.error("[cloud-save] Pending cloud sync failed. Local browser save is still preserved.", getCloudSaveErrorDetails(error));
        setStatus((current) => ({ ...current, state: "failed", message: null }));
      })
      .finally(() => {
        isSavingRef.current = false;
      });
  }, [hasGame, isOnline, t, user]);

  return status;
}
