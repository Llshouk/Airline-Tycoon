"use client";

import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { StartScreen } from "@/components/StartScreen";
import { I18nProvider } from "@/i18n";
import { useGameStore } from "@/store/gameStore";

export default function Home() {
  const game = useGameStore((state) => state.game);
  const tickSimulation = useGameStore((state) => state.tickSimulation);
  const hydrateGameTime = useGameStore((state) => state.hydrateGameTime);

  useEffect(() => {
    hydrateGameTime();
    const timer = window.setInterval(() => tickSimulation(), 1000);
    return () => window.clearInterval(timer);
  }, [hydrateGameTime, tickSimulation]);

  if (!game) {
    return (
      <I18nProvider>
        <StartScreen />
      </I18nProvider>
    );
  }

  return (
    <I18nProvider>
      <AppShell />
    </I18nProvider>
  );
}
