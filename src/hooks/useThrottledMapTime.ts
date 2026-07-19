"use client";

import { useEffect, useRef, useState } from "react";

export function useThrottledMapTime(currentGameTimeMs: number, intervalMs: number, enabled: boolean, structuralKey: string) {
  const [renderTime, setRenderTime] = useState(currentGameTimeMs);
  const latestValueRef = useRef(currentGameTimeMs);
  const lastPublishedAtRef = useRef(0);
  const pendingTimeoutRef = useRef<number | null>(null);
  const structuralKeyRef = useRef(structuralKey);
  const pageVisibleRef = useRef(typeof document === "undefined" || document.visibilityState !== "hidden");

  const clearPendingUpdate = () => {
    if (pendingTimeoutRef.current !== null) {
      window.clearTimeout(pendingTimeoutRef.current);
      pendingTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    latestValueRef.current = currentGameTimeMs;
  }, [currentGameTimeMs]);

  useEffect(() => {
    if (!enabled || !pageVisibleRef.current) {
      clearPendingUpdate();
      return;
    }

    const publish = () => {
      clearPendingUpdate();
      lastPublishedAtRef.current = Date.now();
      setRenderTime(latestValueRef.current);
    };
    const isStructuralChange = structuralKeyRef.current !== structuralKey;
    structuralKeyRef.current = structuralKey;
    const elapsed = Date.now() - lastPublishedAtRef.current;
    if (isStructuralChange || lastPublishedAtRef.current === 0 || elapsed >= intervalMs) {
      publish();
      return;
    }

    clearPendingUpdate();
    pendingTimeoutRef.current = window.setTimeout(publish, intervalMs - elapsed);
    return clearPendingUpdate;
  }, [currentGameTimeMs, enabled, intervalMs, structuralKey]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      pageVisibleRef.current = document.visibilityState !== "hidden";
      if (!pageVisibleRef.current) {
        clearPendingUpdate();
        return;
      }
      if (!enabled) return;
      clearPendingUpdate();
      lastPublishedAtRef.current = Date.now();
      setRenderTime(latestValueRef.current);
    };
    handleVisibilityChange();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearPendingUpdate();
    };
  }, [enabled]);

  return renderTime;
}
