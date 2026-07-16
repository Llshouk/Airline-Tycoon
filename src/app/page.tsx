"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { StartScreen } from "@/components/StartScreen";
import { I18nProvider } from "@/i18n";
import { StorageWarningBanner } from "@/components/StorageWarningBanner";
import { useGameStore } from "@/store/gameStore";

export default function Home() {
  return (
    <I18nProvider>
      <StorageWarningBanner />
      <AuthGate>
        <GameRoot />
      </AuthGate>
    </I18nProvider>
  );
}

function GameRoot() {
  const game = useGameStore((state) => state.game);
  const tickSimulation = useGameStore((state) => state.tickSimulation);
  const hydrateGameTime = useGameStore((state) => state.hydrateGameTime);
  const [hasHydrated, setHasHydrated] = useState(() => useGameStore.persist.hasHydrated());

  useEffect(() => {
    const unsubscribe = useGameStore.persist.onFinishHydration(() => setHasHydrated(true));
    setHasHydrated(useGameStore.persist.hasHydrated());
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    hydrateGameTime();
    const timer = window.setInterval(() => tickSimulation(), 1000);
    return () => window.clearInterval(timer);
  }, [hasHydrated, hydrateGameTime, tickSimulation]);

  if (!hasHydrated) {
    return <div className="flex min-h-screen items-center justify-center bg-runway text-sm font-semibold text-slate-600">Loading local save...</div>;
  }

  if (!game) {
    return <StartScreen />;
  }

  return <AppShell />;
}
