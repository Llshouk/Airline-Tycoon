"use client";

import { BarChart3, CalendarClock, CircleDollarSign, Gauge, Map, Pause, Plane, Play, Route, Settings, Store, Trophy, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Dashboard } from "@/components/Dashboard";
import { AircraftMarketScreen } from "@/components/AircraftMarketScreen";
import { CloudSavePanel } from "@/components/CloudSavePanel";
import { FinanceScreen } from "@/components/FinanceScreen";
import { LeaderboardScreen } from "@/components/LeaderboardScreen";
import { FleetScreen } from "@/components/FleetScreen";
import { GameConsole } from "@/components/GameConsole";
import { MapScreen } from "@/components/MapScreen";
import { RoutesScreen } from "@/components/RoutesScreen";
import { ScheduleScreen } from "@/components/ScheduleScreen";
import { getCurrentCash } from "@/lib/cash";
import { formatGBP } from "@/lib/format";
import { formatGameDate, GAME_SPEED_OPTIONS } from "@/lib/time";
import { useTranslation } from "@/i18n";
import { useGameStore } from "@/store/gameStore";
import type { TimeMultiplier } from "@/types/game";

type Screen = "dashboard" | "map" | "fleet" | "market" | "routes" | "schedule" | "finance" | "leaderboard" | "settings";
type NavItem = {
  id: Screen;
  labelKey?: Parameters<ReturnType<typeof useTranslation>["t"]>[0];
  label?: string;
  icon: LucideIcon;
};

const navItems: NavItem[] = [
  { id: "dashboard", labelKey: "nav.dashboard", icon: BarChart3 },
  { id: "map", labelKey: "nav.map", icon: Map },
  { id: "fleet", labelKey: "nav.fleet", icon: Plane },
  { id: "market", labelKey: "nav.market", icon: Store },
  { id: "routes", labelKey: "nav.routes", icon: Route },
  { id: "schedule", labelKey: "nav.schedule", icon: CalendarClock },
  { id: "finance", labelKey: "nav.finance", icon: CircleDollarSign },
  { id: "leaderboard", labelKey: "nav.leaderboard", icon: Trophy },
  { id: "settings", labelKey: "nav.settings", icon: Settings }
];

export function AppShell() {
  const { language, setLanguage, t } = useTranslation();
  const [screen, setScreen] = useState<Screen>("map");
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const game = useGameStore((state) => state.game);
  const notice = useGameStore((state) => state.notice);
  const clearNotice = useGameStore((state) => state.clearNotice);
  const resetGame = useGameStore((state) => state.resetGame);
  const setTimeMultiplier = useGameStore((state) => state.setTimeMultiplier);
  const togglePause = useGameStore((state) => state.togglePause);

  if (!game) return null;
  const cash = getCurrentCash(game);

  return (
    <main className="min-h-screen bg-runway">
      <header className="sticky top-0 z-[900] border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-3 px-3 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-jet">Airline Tycoon V1</p>
            <h1 className="text-xl font-black text-ink">{game.airlineName}</h1>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <HeaderStat label={t("top.cash")} value={formatGBP.format(cash)} onClick={() => setIsConsoleOpen(true)} title="Open Game Console" />
            <HeaderStat label={t("top.gameTime")} value={formatGameDate(game.currentGameTimeMs)} />
            <HeaderStat label={t("top.aircraft")} value={String(game.fleet.length)} />
            <HeaderStat label={t("top.routes")} value={String(game.routes.length)} />
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-runway p-2">
            <button
              type="button"
              title={game.isPaused ? t("top.resume") : t("top.pause")}
              onClick={togglePause}
              className={`flex h-9 w-9 items-center justify-center rounded-md transition ${game.isPaused ? "bg-coral text-white" : "bg-jet text-white"}`}
            >
              {game.isPaused ? <Play size={17} /> : <Pause size={17} />}
            </button>
            <div className="flex gap-1">
              {GAME_SPEED_OPTIONS.map((speed) => (
                <button
                  key={speed}
                  type="button"
                  onClick={() => setTimeMultiplier(speed as TimeMultiplier)}
                  className={`h-9 rounded-md px-3 text-sm font-black transition ${
                    game.timeMultiplier === speed ? "bg-mint text-white" : "bg-white text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value === "zh" ? "zh" : "en")}
              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm font-bold text-jet outline-none"
              title="Language"
            >
              <option value="en">{t("common.english")}</option>
              <option value="zh">{t("common.chinese")}</option>
            </select>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-4 px-3 py-4 lg:grid-cols-[168px_1fr]">
        <aside className="h-fit rounded-lg border border-slate-200 bg-white p-2 shadow-soft">
          <nav className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = screen === item.id;
              const label = item.labelKey ? t(item.labelKey) : item.label ?? item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  title={label}
                  onClick={() => setScreen(item.id)}
                  className={`flex min-h-10 items-center justify-center gap-2 rounded-md px-2 text-xs font-black transition lg:justify-start ${
                    active ? "bg-jet text-white" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>
          <button
            type="button"
            onClick={resetGame}
            className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            {t("common.newGame")}
          </button>
        </aside>

        <section className="min-w-0">
          {notice ? (
            <div className="mb-4 flex animate-slide-in items-center justify-between gap-3 rounded-lg border border-mint/30 bg-white px-4 py-3 text-sm text-ink shadow-soft">
              <span>{notice}</span>
              <button type="button" onClick={clearNotice} className="rounded-md px-2 py-1 font-semibold text-jet hover:bg-slate-100">
                {t("common.dismiss")}
              </button>
            </div>
          ) : null}
          {screen === "dashboard" && <Dashboard />}
          {screen === "map" && <MapScreen />}
          {screen === "fleet" && <FleetScreen />}
          {screen === "market" && <AircraftMarketScreen />}
          {screen === "routes" && <RoutesScreen />}
          {screen === "schedule" && <ScheduleScreen />}
          {screen === "finance" && <FinanceScreen />}
          {screen === "leaderboard" && <LeaderboardScreen />}
          {screen === "settings" && (
            <SettingsPanel
              language={language}
              setLanguage={setLanguage}
              timeMultiplier={game.timeMultiplier}
              isPaused={game.isPaused}
              setTimeMultiplier={setTimeMultiplier}
              togglePause={togglePause}
            />
          )}
        </section>
      </div>
      {isConsoleOpen ? (
        <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-ink/45 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white animate-modal-in">
            <GameConsole onClose={() => setIsConsoleOpen(false)} />
          </div>
        </div>
      ) : null}
    </main>
  );
}

function HeaderStat({ label, value, onClick, title }: { label: string; value: string; onClick?: () => void; title?: string }) {
  const Component = onClick ? "button" : "div";
  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={title}
      className={`rounded-md border border-slate-200 bg-runway px-3 py-2 text-left ${onClick ? "transition hover:border-coral hover:bg-white" : ""}`}
    >
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="truncate text-sm font-bold text-ink">{value}</p>
    </Component>
  );
}

function SettingsPanel({
  language,
  setLanguage,
  timeMultiplier,
  isPaused,
  setTimeMultiplier,
  togglePause
}: {
  language: string;
  setLanguage: (language: "en" | "zh") => void;
  timeMultiplier: TimeMultiplier;
  isPaused: boolean;
  setTimeMultiplier: (speed: TimeMultiplier) => void;
  togglePause: () => void;
}) {
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h2 className="text-2xl font-black text-ink">Settings</h2>
        <p className="text-slate-600">Simulation controls and display preferences.</p>
      </div>
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
        <div className="mb-3 flex items-center gap-2">
          <Gauge size={20} className="text-coral" />
          <h3 className="font-bold text-ink">Simulation</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={togglePause}
            className={`rounded-md px-3 py-2 text-sm font-black ${isPaused ? "bg-coral text-white" : "bg-jet text-white"}`}
          >
            {isPaused ? "Resume" : "Pause"}
          </button>
          {GAME_SPEED_OPTIONS.map((speed) => (
            <button
              key={speed}
              type="button"
              onClick={() => setTimeMultiplier(speed as TimeMultiplier)}
              className={`rounded-md px-3 py-2 text-sm font-black ${
                timeMultiplier === speed ? "bg-mint text-white" : "bg-runway text-slate-600"
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
        <h3 className="font-bold text-ink">Language</h3>
        <select
          value={language}
          onChange={(event) => setLanguage(event.target.value === "zh" ? "zh" : "en")}
          className="mt-3 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-jet outline-none"
        >
          <option value="en">English</option>
          <option value="zh">简体中文</option>
        </select>
      </section>
      <div>
        <CloudSavePanel />
      </div>
      <div>
        <p className="mb-2 text-xs font-black uppercase tracking-normal text-slate-500">Developer Tools</p>
        <GameConsole />
      </div>
    </div>
  );
}
