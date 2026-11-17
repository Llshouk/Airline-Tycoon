"use client";

import { CalendarClock, Cloud, CloudOff, Gauge, Pause, Plane, Play, Route, Wallet, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Dashboard } from "@/components/Dashboard";
import { CompanyGoalsScreen } from "@/components/CompanyGoalsScreen";
import { AircraftMarketScreen } from "@/components/AircraftMarketScreen";
import { useAuthSession } from "@/components/AuthGate";
import { CloudSavePanel } from "@/components/CloudSavePanel";
import { FinanceScreen } from "@/components/FinanceScreen";
import { LeaderboardScreen } from "@/components/LeaderboardScreen";
import { FleetScreen } from "@/components/FleetScreen";
import { GameConsole } from "@/components/GameConsole";
import { GameNavigation, gameNavigation, type GameScreen } from "@/components/GameNavigation";
import { MapScreen } from "@/components/MapScreen";
import { RoutesScreen } from "@/components/RoutesScreen";
import { SaveFilePanel } from "@/components/SaveFilePanel";
import { ScheduleScreen } from "@/components/ScheduleScreen";
import { getCurrentCash } from "@/lib/cash";
import { formatGBP } from "@/lib/format";
import { formatGameDate, GAME_SPEED_OPTIONS } from "@/lib/time";
import { useCloudAutoSave } from "@/hooks/useCloudAutoSave";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useTranslation } from "@/i18n";
import { APP_VERSION } from "@/config/appVersion";
import { useGameStore } from "@/store/gameStore";
import type { GameState, TimeMultiplier } from "@/types/game";

export function AppShell() {
  const { language, setLanguage, t } = useTranslation();
  const { user, isAdmin, isSwitchingAirline, switchAirline } = useAuthSession();
  const [screen, setScreen] = useState<GameScreen>("map");
  const [fleetSelection, setFleetSelection] = useState<string | null>(null);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const hasGame = useGameStore((state) => Boolean(state.game));
  const gameStatus = useGameStore((state) => state.game?.gameStatus ?? "active");
  const timeMultiplier = useGameStore((state) => state.game?.timeMultiplier ?? 1);
  const isPaused = useGameStore((state) => state.game?.isPaused ?? false);
  const notice = useGameStore((state) => state.notice);
  const clearNotice = useGameStore((state) => state.clearNotice);
  const resetGame = useGameStore((state) => state.resetGame);
  const setTimeMultiplier = useGameStore((state) => state.setTimeMultiplier);
  const togglePause = useGameStore((state) => state.togglePause);
  const autoSaveStatus = useCloudAutoSave(user);
  const isOnline = useOnlineStatus();
  const workspaceTitle = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (screen !== "map") workspaceTitle.current?.focus();
  }, [screen]);

  function navigate(next: GameScreen) {
    setFleetSelection(null);
    setScreen(next);
  }

  function returnToMap() {
    setScreen("map");
    document.querySelector<HTMLButtonElement>('[data-screen="map"]')?.focus();
  }

  if (!hasGame) return null;

  return (
    <main className="simulation-shell">
      <GameHud isAdmin={isAdmin} isOnline={isOnline} autoSaveStatus={autoSaveStatus}
        onOpenConsole={() => setIsConsoleOpen(true)} onOpenSettings={() => navigate("settings")} />

      <div className="game-stage">
        <div className="absolute inset-0" inert={screen !== "map"} aria-hidden={screen !== "map"} style={{ visibility: screen === "map" ? "visible" : "hidden" }}>
          <MapScreen active={screen === "map"} onSelectAircraft={(id) => { setFleetSelection(id); setScreen("fleet"); }} onViewRoutes={() => navigate("routes")} />
        </div>
        {notice ? (
            <div role="status" className="game-notice animate-slide-in">
              <span>{notice}</span>
              <button type="button" onClick={clearNotice} aria-label={t("common.dismiss")} className="hud-icon-button shrink-0"><X size={18} /></button>
            </div>
          ) : null}
        {gameStatus !== "active" ? <div className="game-over-overlay"><GameOverPanel gameStatus={gameStatus} resetGame={resetGame} /></div> : null}
        {screen !== "map" ? <section className="game-workspace" aria-labelledby="workspace-title" key={screen}>
          <header className="workspace-header animate-slide-in">
            <h2 id="workspace-title" ref={workspaceTitle} tabIndex={-1} className="flex items-center gap-3 text-ink outline-none">
              {(() => { const item = gameNavigation.find((entry) => entry.id === screen)!; const Icon = item.icon; return <><span className="workspace-mark"><Icon size={18} aria-hidden="true" /></span>{t(item.labelKey)}</>; })()}
            </h2>
            <button type="button" onClick={returnToMap} aria-label={t("shell.backToMap")} className="hud-icon-button"><X size={20} />
              <span className="game-tooltip" aria-hidden="true">{t("shell.backToMap")}</span>
            </button>
          </header>
          <div className="workspace-scroll">
          {screen === "dashboard" && <Dashboard onOpenAircraft={(id) => { setFleetSelection(id || null); setScreen("fleet"); }} onOpenGoals={() => setScreen("growth")} />}
          {screen === "growth" && <CompanyGoalsScreen onNavigate={setScreen} />}
          {screen === "fleet" && <FleetScreen initialSelectedAircraftId={fleetSelection} />}
          {screen === "market" && <AircraftMarketScreen />}
          {screen === "routes" && <RoutesScreen onSchedule={() => setScreen("schedule")} />}
          {screen === "schedule" && <ScheduleScreen />}
          {screen === "finance" && <FinanceScreen />}
          {screen === "leaderboard" && <LeaderboardScreen />}
          {screen === "settings" && (
            <SettingsPanel
              language={language}
              setLanguage={setLanguage}
              timeMultiplier={timeMultiplier}
              isPaused={isPaused}
              isOnline={isOnline}
              autoSaveStatus={autoSaveStatus}
              setTimeMultiplier={setTimeMultiplier}
              togglePause={togglePause}
              isAdmin={isAdmin}
              openConsole={() => setIsConsoleOpen(true)}
              userEmail={user?.email}
              switchAirline={switchAirline}
              isSwitchingAirline={isSwitchingAirline}
            />
          )}
          </div>
        </section> : null}
      </div>
      <GameNavigation screen={screen} onNavigate={navigate} />
      {isConsoleOpen && isAdmin ? (
        <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-ink/45 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white animate-modal-in">
            <GameConsole onClose={() => setIsConsoleOpen(false)} />
          </div>
        </div>
      ) : null}
    </main>
  );
}

/** The status board subscribes to the live game on its own, so the clock ticking never re-renders the workspace. */
function GameHud({ isAdmin, isOnline, autoSaveStatus, onOpenConsole, onOpenSettings }: {
  isAdmin: boolean; isOnline: boolean; autoSaveStatus: ReturnType<typeof useCloudAutoSave>; onOpenConsole: () => void; onOpenSettings: () => void;
}) {
  const { t } = useTranslation();
  const game = useGameStore((state) => state.game);
  const setTimeMultiplier = useGameStore((state) => state.setTimeMultiplier);
  const togglePause = useGameStore((state) => state.togglePause);
  if (!game) return null;
  const cash = getCurrentCash(game);
  const saveLabel = formatAutoSaveStatus(autoSaveStatus, t) ?? (isOnline ? t("top.online") : t("top.offlineMode"));
  return (
    <header className="game-hud">
      <div className="hud-airline">
        <span className="hud-mark"><Plane size={19} aria-hidden="true" /></span>
        <div className="min-w-0">
          <h1>{game.airlineName}</h1>
          <p>Airline Tycoon {APP_VERSION}</p>
        </div>
      </div>
      <div className="hud-cash"><HeaderStat label={t("top.cash")} value={formatGBP.format(cash)} icon={Wallet} negative={cash < 0}
        onClick={isAdmin ? onOpenConsole : undefined} title={isAdmin ? t("shell.console") : undefined} /></div>
      <div className="hud-time"><HeaderStat label={t("top.gameTime")} value={formatGameDate(game.currentGameTimeMs)} icon={CalendarClock} /></div>
      <div className="hud-network" aria-label={`${t("top.aircraft")}: ${game.fleet.length}; ${t("top.routes")}: ${game.routes.length}`}>
        <Plane size={16} aria-hidden="true" /><span>{game.fleet.length}</span><Route size={16} aria-hidden="true" /><span>{game.routes.length}</span>
      </div>
      <div className="hud-controls">
        <button type="button" onClick={onOpenSettings} className={`hud-icon-button hud-connectivity ${autoSaveStatus.state === "failed" ? "is-warning" : ""}`}
          aria-label={`${isOnline ? t("top.online") : t("top.offlineMode")}. ${formatAutoSaveStatus(autoSaveStatus, t) ?? ""}`}>
          {isOnline ? <Cloud size={19} /> : <CloudOff size={19} />}
          <span className="game-tooltip" aria-hidden="true">{saveLabel}</span>
        </button>
        <button type="button" aria-label={game.isPaused ? t("top.resume") : t("top.pause")} onClick={togglePause}
          className={`hud-icon-button ${game.isPaused ? "is-paused" : ""}`}>
          {game.isPaused ? <Play size={20} /> : <Pause size={20} />}
          <span className="game-tooltip" aria-hidden="true">{game.isPaused ? t("top.resume") : t("top.pause")}</span>
        </button>
        <select aria-label={t("settings.timeSpeed")} value={game.timeMultiplier} onChange={(event) => setTimeMultiplier(Number(event.target.value) as TimeMultiplier)}
          className="hud-speed">
          {GAME_SPEED_OPTIONS.map((speed) => <option key={speed} value={speed}>{speed}x</option>)}
        </select>
      </div>
    </header>
  );
}

function HeaderStat({ label, value, icon: Icon, onClick, title, negative = false }: {
  label: string; value: string; icon: typeof Wallet; onClick?: () => void; title?: string; negative?: boolean;
}) {
  const Component = onClick ? "button" : "div";
  return (
    <Component type={onClick ? "button" : undefined} onClick={onClick} title={title} className="hud-stat">
      <Icon size={18} className="shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="hud-stat-label">{label}</p>
        <p className={`hud-stat-value ${negative ? "is-negative" : ""}`}>{value}</p>
      </div>
    </Component>
  );
}

function GameOverPanel({ gameStatus, resetGame }: { gameStatus: GameState["gameStatus"]; resetGame: () => void }) {
  const { t } = useTranslation();
  return (
    <section className="mb-4 rounded-lg border border-coral/30 bg-white p-5 shadow-soft">
      <p className="text-xs font-semibold text-slate-500">{t("difficulty.airlineBankrupt")}</p>
      <h2 className="mt-1 text-2xl font-black text-ink">
        {gameStatus === "gameOver" ? t("difficulty.gameOver") : t("difficulty.airlineBankrupt")}
      </h2>
      <p className="mt-2 text-sm text-slate-600">{t("difficulty.bankruptSaveKept")}</p>
      <button type="button" onClick={resetGame} className="mt-4 rounded-md bg-jet px-4 py-2 text-sm font-black text-white hover:bg-ink">
        {t("difficulty.startAnotherDifficulty")}
      </button>
    </section>
  );
}

function formatAutoSaveStatus(
  status: ReturnType<typeof useCloudAutoSave>,
  t: ReturnType<typeof useTranslation>["t"]
) {
  if (status.state === "disabled") return null;
  if (status.state === "saving") return t("cloud.saving");
  if (status.state === "failed") return t("cloud.autoSaveFailed");
  if (status.state === "pending") return t("cloud.syncPending");
  if (status.state === "saved" && status.lastSavedAt) {
    return `${t("cloud.autoSaved")} ${new Date(status.lastSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
  return t("cloud.autoSaveEnabled");
}

function SettingsPanel({
  language,
  setLanguage,
  timeMultiplier,
  isPaused,
  isOnline,
  autoSaveStatus,
  setTimeMultiplier,
  togglePause,
  isAdmin,
  openConsole,
  userEmail,
  switchAirline,
  isSwitchingAirline
}: {
  language: string;
  setLanguage: (language: "en" | "zh") => void;
  timeMultiplier: TimeMultiplier;
  isPaused: boolean;
  isOnline: boolean;
  autoSaveStatus: ReturnType<typeof useCloudAutoSave>;
  setTimeMultiplier: (speed: TimeMultiplier) => void;
  togglePause: () => void;
  isAdmin: boolean;
  openConsole: () => void;
  userEmail?: string;
  switchAirline: () => void;
  isSwitchingAirline: boolean;
}) {
  const { t } = useTranslation();
  const [showCloudSave, setShowCloudSave] = useState(false);
  const airportRulesEnabled = useGameStore((state) => state.game?.airportRulesEnabled === true);
  const setAirportRules = useGameStore((state) => state.setAirportRulesEnabled);
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h2 className="screen-title">{t("nav.settings")}</h2>
      </div>
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
        <div className="mb-3 flex items-center gap-2">
          <Gauge size={20} className="text-slate-400" />
          <h3 className="font-bold text-ink">{t("shell.simulation")}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={togglePause}
            className={`flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm font-black ${isPaused ? "bg-sign text-apron" : "bg-apron text-white"}`}
          >
            {isPaused ? <Play size={17} /> : <Pause size={17} />}
            <span>{t(isPaused ? "top.resume" : "top.pause")}</span>
          </button>
          <SpeedSelector value={timeMultiplier} onChange={setTimeMultiplier} label={t("settings.timeSpeed")} />
        </div>
      </section>
      <section className="border-y border-slate-200 py-4">
        <p className="break-all text-sm font-bold text-ink">{userEmail ?? t("top.offlineMode")}</p>
        <button type="button" onClick={switchAirline} disabled={isSwitchingAirline}
          className="mt-3 rounded-md bg-jet px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          {isSwitchingAirline ? t("save.switching") : t("save.switchAirline")}
        </button>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
        <h3 className="font-bold text-ink">{t("shell.language")}</h3>
        <select
          aria-label={t("shell.language")}
          value={language}
          onChange={(event) => setLanguage(event.target.value === "zh" ? "zh" : "en")}
          className="mt-3 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-jet outline-none"
        >
          <option value="en">English</option>
          <option value="zh">简体中文</option>
        </select>
      </section>
      <section className="border-y border-slate-200 py-4">
        <label className="flex items-center gap-3 text-sm font-bold text-ink">
          <input type="checkbox" checked={airportRulesEnabled} onChange={(event) => setAirportRules(event.target.checked)} />
          {t("airport.rules")}
        </label>
        <p className="mt-2 text-xs text-slate-500">{t("airport.rulesScope")}</p>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
        <h3 className="font-bold text-ink">{t("shell.connectivity")}</h3>
        <div className="mt-3 grid gap-2 text-sm text-slate-600">
          <InfoRow label={t("shell.connectivity")} value={isOnline ? t("top.online") : t("top.offlineMode")} />
          <InfoRow label={t("cloud.title")} value={formatAutoSaveStatus(autoSaveStatus, t) ?? t("cloud.autoSaveEnabled")} />
          {autoSaveStatus.message ? <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{autoSaveStatus.message}</p> : null}
        </div>
      </section>
      <SaveFilePanel />
      {showCloudSave ? (
        <CloudSavePanel />
      ) : (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <h3 className="font-bold text-ink">{t("cloud.title")}</h3>
          <p className="mt-2 text-sm text-slate-600">{t("cloud.description")}</p>
          <button
            type="button"
            onClick={() => setShowCloudSave(true)}
            className="mt-3 rounded-md bg-jet px-4 py-2 text-sm font-black text-white transition hover:bg-ink"
          >
            {t("cloud.title")}
          </button>
        </section>
      )}
      {isAdmin ? <div>
          <button type="button" onClick={openConsole} className="rounded-md bg-runway px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-100">
            {t("shell.console")}
          </button>
      </div> : null}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 rounded-md bg-runway px-3 py-2">
      <span className="font-semibold">{label}</span>
      <span className="text-right font-bold text-ink">{value}</span>
    </div>
  );
}

function SpeedSelector({
  value,
  onChange,
  label
}: {
  value: TimeMultiplier;
  onChange: (speed: TimeMultiplier) => void;
  label: string;
}) {
  return (
    <div className="grid w-full min-w-0 grid-cols-3 gap-1 rounded-md bg-runway p-1 sm:grid-cols-6">
      <span className="col-span-full px-2 py-1 text-xs font-black text-slate-500">{label}</span>
      {GAME_SPEED_OPTIONS.map((speed) => (
        <button
          key={speed}
          type="button"
          aria-pressed={value === speed}
          onClick={() => onChange(speed)}
          className={`h-11 min-w-0 rounded px-2 text-xs font-black transition ${
            value === speed ? "bg-apron text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {speed}x
        </button>
      ))}
    </div>
  );
}
