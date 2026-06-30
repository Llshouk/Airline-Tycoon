"use client";

import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { StartScreen } from "@/components/StartScreen";
import { I18nProvider } from "@/i18n";
import { useGameStore } from "@/store/gameStore";

export default function Home() {
  return (
    <I18nProvider>
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

  useEffect(() => {
    hydrateGameTime();
    const timer = window.setInterval(() => tickSimulation(), 1000);
    return () => window.clearInterval(timer);
  }, [hydrateGameTime, tickSimulation]);

  if (!game) {
    return <StartScreen />;
  }

  return <AppShell />;
}
