"use client";

import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { DIFFICULTY_CONFIGS, DIFFICULTY_ORDER, type GameDifficulty } from "@/config/difficulty";
import { useTranslation } from "@/i18n";
import {
  getCloudSaveSlots,
  getCloudSaveErrorMessage,
  getLocalSaveMetadata,
  getSupabaseConfigurationMessage,
  isSupabaseConfigured,
  loadCloudSaveIntoGame,
  uploadLocalSaveToCloud,
  type CloudSaveMetadata,
  type LocalSaveMetadata
} from "@/lib/cloudSave";
import { formatGBP } from "@/lib/format";
import { isAdminUser } from "@/lib/admin";
import { supabase } from "@/lib/supabaseClient";
import { BASE_AIRPORT_COST, STARTING_CAPITAL, useGameStore } from "@/store/gameStore";

const SESSION_GATE_KEY = "airline-tycoon-entered-session";
const LAST_ACTIVE_KEY = "airline-tycoon-last-active-at";
const SESSION_TIMEOUT_MS = 60 * 60 * 1000;

type AuthContextValue = {
  user: User | null;
  isAuthLoading: boolean;
  isAdmin: boolean;
  selectedDifficulty: GameDifficulty;
};

const emptySlots: Record<GameDifficulty, CloudSaveMetadata | null> = {
  simulation: null,
  easy: null,
  realistic: null
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const game = useGameStore((state) => state.game);
  const resetGame = useGameStore((state) => state.resetGame);
  const loadGameStateFromCloud = useGameStore((state) => state.loadGameStateFromCloud);
  const setAdminUser = useGameStore((state) => state.setAdminUser);
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [canEnterGame, setCanEnterGame] = useState(false);
  const [selectedDifficulty, setSelectedDifficulty] = useState<GameDifficulty>("easy");
  const [cloudSlots, setCloudSlots] = useState<Record<GameDifficulty, CloudSaveMetadata | null>>(emptySlots);
  const [localMetadata, setLocalMetadata] = useState<LocalSaveMetadata>({ hasSave: false, updatedAt: null });
  const [message, setMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const configured = isSupabaseConfigured();
  const configurationMessage = getSupabaseConfigurationMessage();
  const user = session?.user ?? null;
  const isAdmin = isAdminUser(user);

  useEffect(() => {
    setAdminUser(isAdmin);
  }, [isAdmin, setAdminUser]);

  useEffect(() => {
    if (!canEnterGame) return;
    markEnteredSession();
    const updateActivity = () => markActivity();
    window.addEventListener("click", updateActivity);
    window.addEventListener("keydown", updateActivity);
    window.addEventListener("mousemove", updateActivity);
    return () => {
      window.removeEventListener("click", updateActivity);
      window.removeEventListener("keydown", updateActivity);
      window.removeEventListener("mousemove", updateActivity);
    };
  }, [canEnterGame]);

  useEffect(() => {
    setLocalMetadata(getLocalSaveMetadata());
    if (!supabase) {
      setIsAuthLoading(false);
      setMessage(configurationMessage ?? t("cloud.supabaseNotConfigured"));
      return;
    }

    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setCanEnterGame(Boolean(data.session && isSessionGateFresh() && useGameStore.getState().game));
      setIsAuthLoading(false);
      if (data.session) void refreshCloudSlots();
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLocalMetadata(getLocalSaveMetadata());
      setCanEnterGame(Boolean(nextSession && isSessionGateFresh() && useGameStore.getState().game));
      if (nextSession) {
        void refreshCloudSlots();
      } else {
        clearEnteredSession();
        setCloudSlots(emptySlots);
      }
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configurationMessage, t]);

  const contextValue = useMemo<AuthContextValue>(
    () => ({ user, isAuthLoading, isAdmin, selectedDifficulty }),
    [isAdmin, isAuthLoading, selectedDifficulty, user]
  );

  async function refreshCloudSlots() {
    if (!configured) return;
    try {
      const slots = await getCloudSaveSlots();
      setCloudSlots(slots);
      setMessage(Object.values(slots).some(Boolean) ? null : t("cloud.noCloudSaveFound"));
    } catch (error) {
      setMessage(errorMessage(error, t("cloud.cloudSaveFailed")));
    }
  }

  async function handleLoadCloudSave(difficulty: GameDifficulty) {
    await runAction(async () => {
      const result = await loadCloudSaveIntoGame(difficulty, (cloudGame) => {
        const loaded = loadGameStateFromCloud(cloudGame);
        if (!loaded.ok) throw new Error(loaded.message);
      });
      if (!result) {
        setMessage(t("cloud.noCloudSaveFound"));
        return;
      }
      setSelectedDifficulty(difficulty);
      setCloudSlots((current) => ({ ...current, [difficulty]: result.metadata }));
      markEnteredSession();
      setCanEnterGame(true);
      setMessage(t("cloud.cloudSaveLoaded"));
    });
  }

  async function handleUploadLocalSave() {
    if (!game) {
      setMessage(t("cloud.noSaveMetadata"));
      return;
    }
    await runAction(async () => {
      const metadata = await uploadLocalSaveToCloud(game);
      setSelectedDifficulty(metadata.difficulty);
      setCloudSlots((current) => ({ ...current, [metadata.difficulty]: metadata }));
      markEnteredSession();
      setCanEnterGame(true);
      setMessage(t("cloud.localSaveUploaded"));
    });
  }

  function handleStartNewGame(difficulty: GameDifficulty, resetExisting = false) {
    if (cloudSlots[difficulty] && !resetExisting) {
      setMessage(t("difficulty.alreadyHasAirline"));
      return;
    }
    if (cloudSlots[difficulty] && resetExisting && !window.confirm(t("difficulty.resetConfirm"))) return;
    resetGame();
    setSelectedDifficulty(difficulty);
    markEnteredSession();
    setCanEnterGame(true);
  }

  async function runAction(action: () => Promise<void>) {
    setIsBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage(errorMessage(error, t("cloud.cloudSaveFailed")));
    } finally {
      setIsBusy(false);
    }
  }

  if (isAuthLoading) return <AuthShell title={t("app.title")} subtitle={t("cloud.saving")} />;
  if (!session) return <LoginScreen message={message} setMessage={setMessage} configurationMessage={configurationMessage} />;

  if (!canEnterGame) {
    return (
      <AuthContext.Provider value={contextValue}>
        <DifficultyEntryScreen
          userEmail={session.user.email ?? ""}
          cloudSlots={cloudSlots}
          localMetadata={localMetadata}
          isBusy={isBusy}
          message={message}
          onEnterGame={() => {
            markEnteredSession();
            setCanEnterGame(true);
          }}
          onLoadCloudSave={handleLoadCloudSave}
          onStartNewGame={handleStartNewGame}
          onUploadLocalSave={handleUploadLocalSave}
        />
      </AuthContext.Provider>
    );
  }

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuthSession() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuthSession must be used inside AuthGate");
  return value;
}

function LoginScreen({
  message,
  setMessage,
  configurationMessage
}: {
  message: string | null;
  setMessage: (message: string | null) => void;
  configurationMessage: string | null;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  async function runAuth(action: () => Promise<void>) {
    if (!supabase) {
      setMessage(configurationMessage ?? t("cloud.supabaseNotConfigured"));
      return;
    }
    setIsBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage(errorMessage(error, t("cloud.cloudSaveFailed")));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <AuthShell title={t("app.title")} subtitle={t("cloud.loginDescription")}>
      <div className="mx-auto mt-6 w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
        <div className="grid gap-3">
          <label className="text-sm font-semibold text-slate-600">
            {t("cloud.email")}
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-ink outline-none focus:border-mint" />
          </label>
          <label className="text-sm font-semibold text-slate-600">
            {t("cloud.password")}
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-ink outline-none focus:border-mint" />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <AuthButton disabled={isBusy || !email || !password} onClick={() => runAuth(async () => {
              const { error } = await supabase!.auth.signInWithPassword({ email, password });
              if (error) throw error;
              setMessage(t("cloud.loggedIn"));
            })}>
              {t("cloud.logIn")}
            </AuthButton>
            <AuthButton disabled={isBusy || !email || !password} variant="secondary" onClick={() => runAuth(async () => {
              const { error } = await supabase!.auth.signUp({ email, password });
              if (error) throw error;
              setMessage(t("cloud.signUpComplete"));
            })}>
              {t("cloud.signUp")}
            </AuthButton>
          </div>
          <AuthButton disabled={isBusy} variant="secondary" onClick={() => runAuth(async () => {
            const { error } = await supabase!.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
            if (error) throw error;
          })}>
            {t("cloud.continueWithGoogle")}
          </AuthButton>
        </div>
        {message ? <AuthMessage>{message}</AuthMessage> : null}
      </div>
    </AuthShell>
  );
}

function DifficultyEntryScreen({
  userEmail,
  cloudSlots,
  localMetadata,
  isBusy,
  message,
  onEnterGame,
  onLoadCloudSave,
  onStartNewGame,
  onUploadLocalSave
}: {
  userEmail: string;
  cloudSlots: Record<GameDifficulty, CloudSaveMetadata | null>;
  localMetadata: LocalSaveMetadata;
  isBusy: boolean;
  message: string | null;
  onEnterGame: () => void;
  onLoadCloudSave: (difficulty: GameDifficulty) => void;
  onStartNewGame: (difficulty: GameDifficulty, resetExisting?: boolean) => void;
  onUploadLocalSave: () => void;
}) {
  const { t } = useTranslation();
  const currentGame = useGameStore((state) => state.game);
  return (
    <AuthShell title={t("difficulty.choose")} subtitle={`${t("cloud.loggedIn")}: ${userEmail}`}>
      <div className="mx-auto mt-6 grid w-full max-w-5xl gap-3 lg:grid-cols-3">
        {DIFFICULTY_ORDER.map((difficulty) => {
          const config = DIFFICULTY_CONFIGS[difficulty];
          const save = cloudSlots[difficulty];
          return (
            <section key={difficulty} className="rounded-lg border border-slate-200 bg-white p-4 text-left shadow-soft">
              <h2 className="text-xl font-black text-ink">{t(`difficulty.${difficulty}`)}</h2>
              <div className="mt-3 space-y-2 text-sm text-slate-600">
                <Info label={t("difficulty.speed")} value={`${config.speedMultiplier}x`} />
                <Info label={t("difficulty.startingCash")} value={formatGBP.format(STARTING_CAPITAL * config.startingCashMultiplier - BASE_AIRPORT_COST)} />
                <Info label={t("difficulty.revenueMultiplier")} value={config.difficulty === "realistic" ? "Realistic" : `${config.revenueMultiplier}x`} />
                <Info label={t("difficulty.bankruptcyRule")} value={bankruptcyLabel(config.difficulty, t)} />
                <Info label={t("difficulty.lastSaved")} value={formatDate(save?.updatedAt ?? null)} />
              </div>
              <div className="mt-4 grid gap-2">
                {save ? (
                  <>
                    <AuthButton disabled={isBusy} onClick={() => onLoadCloudSave(difficulty)}>
                      {t("difficulty.continueAirline")}
                    </AuthButton>
                    <AuthButton disabled={isBusy} variant="secondary" onClick={() => onStartNewGame(difficulty, true)}>
                      {t("difficulty.resetSave")}
                    </AuthButton>
                  </>
                ) : (
                  <AuthButton disabled={isBusy} onClick={() => onStartNewGame(difficulty)}>
                    {t("difficulty.startNewAirline")}
                  </AuthButton>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <div className="mx-auto mt-4 w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
        <p className="text-sm text-slate-600">
          {t("difficulty.oneAirlinePerDifficulty")} {t("difficulty.autoSaveOverwrites")}
        </p>
        <p className="mt-2 text-sm text-slate-600">
          {t("cloud.localUpdated")}: {formatDate(localMetadata.updatedAt)}
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <AuthButton disabled={isBusy || !currentGame} variant="secondary" onClick={onEnterGame}>
            {t("cloud.enterGame")}
          </AuthButton>
          <AuthButton disabled={isBusy || !localMetadata.hasSave || !currentGame} variant="secondary" onClick={onUploadLocalSave}>
            {t("cloud.uploadLocalSave")}
          </AuthButton>
        </div>
        {message ? <AuthMessage>{message}</AuthMessage> : null}
      </div>
    </AuthShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="font-semibold">{label}</span>
      <span className="text-right font-bold text-ink">{value}</span>
    </div>
  );
}

function bankruptcyLabel(difficulty: GameDifficulty, t: ReturnType<typeof useTranslation>["t"]) {
  if (difficulty === "simulation") return t("difficulty.unlimitedBailout");
  if (difficulty === "easy") return t("difficulty.oneTimeBailout");
  return t("difficulty.gameOverOnBankruptcy");
}

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-runway px-4 py-10">
      <div className="w-full max-w-6xl text-center">
        <p className="text-xs font-black uppercase tracking-normal text-coral">Airline Tycoon V1</p>
        <h1 className="mt-2 text-4xl font-black text-ink">{title}</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold text-slate-600">{subtitle}</p>
        {children}
      </div>
    </main>
  );
}

function AuthButton({ children, disabled, onClick, variant = "primary" }: { children: ReactNode; disabled?: boolean; onClick: () => void; variant?: "primary" | "secondary" }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`min-h-10 rounded-md px-3 py-2 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${variant === "primary" ? "bg-jet text-white hover:bg-ink" : "bg-runway text-slate-700 hover:bg-slate-100"}`}>
      {children}
    </button>
  );
}

function AuthMessage({ children }: { children: ReactNode }) {
  return <p className="mt-3 rounded-md border border-slate-200 bg-runway px-3 py-2 text-sm text-slate-700">{children}</p>;
}

function formatDate(value: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

function errorMessage(error: unknown, fallback: string) {
  return getCloudSaveErrorMessage(error, fallback);
}

function isSessionGateFresh() {
  if (typeof window === "undefined") return false;
  return (
    window.sessionStorage.getItem(SESSION_GATE_KEY) === "true" &&
    Date.now() - Number(window.localStorage.getItem(LAST_ACTIVE_KEY) ?? 0) < SESSION_TIMEOUT_MS
  );
}

function markActivity() {
  window.localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
}

function markEnteredSession() {
  window.sessionStorage.setItem(SESSION_GATE_KEY, "true");
  markActivity();
}

function clearEnteredSession() {
  window.sessionStorage.removeItem(SESSION_GATE_KEY);
  window.localStorage.removeItem(LAST_ACTIVE_KEY);
}
