"use client";

import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "@/i18n";
import {
  getCloudSaveMetadata,
  getLocalSaveMetadata,
  getSupabaseConfigurationMessage,
  isSupabaseConfigured,
  loadCloudSaveIntoGame,
  uploadLocalSaveToCloud,
  type CloudSaveMetadata,
  type LocalSaveMetadata
} from "@/lib/cloudSave";
import { isAdminUser } from "@/lib/admin";
import { supabase } from "@/lib/supabaseClient";
import { useGameStore } from "@/store/gameStore";

type AuthContextValue = {
  user: User | null;
  isAuthLoading: boolean;
  isAdmin: boolean;
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
  const [cloudMetadata, setCloudMetadata] = useState<CloudSaveMetadata | null>(null);
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
      setCanEnterGame(false);
      setIsAuthLoading(false);
      if (data.session) void refreshCloudMetadata();
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setCanEnterGame(false);
      setLocalMetadata(getLocalSaveMetadata());
      if (nextSession) {
        void refreshCloudMetadata();
      } else {
        setCloudMetadata(null);
      }
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configurationMessage, t]);

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthLoading,
      isAdmin
    }),
    [isAdmin, isAuthLoading, user]
  );

  async function refreshCloudMetadata() {
    if (!configured) return;
    try {
      const metadata = await getCloudSaveMetadata();
      setCloudMetadata(metadata);
      setMessage(metadata ? null : t("cloud.noCloudSaveFound"));
    } catch (error) {
      setMessage(errorMessage(error, t("cloud.cloudSaveFailed")));
    }
  }

  async function handleLoadCloudSave() {
    await runAction(async () => {
      const result = await loadCloudSaveIntoGame((cloudGame) => {
        const loaded = loadGameStateFromCloud(cloudGame);
        if (!loaded.ok) throw new Error(loaded.message);
      });
      if (!result) {
        setMessage(t("cloud.noCloudSaveFound"));
        return;
      }
      setCloudMetadata(result.metadata);
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
      setCloudMetadata(metadata);
      setCanEnterGame(true);
      setMessage(t("cloud.localSaveUploaded"));
    });
  }

  function handleStartNewGame() {
    resetGame();
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

  if (isAuthLoading) {
    return <AuthShell title={t("app.title")} subtitle={t("cloud.saving")} />;
  }

  if (!session) {
    return <LoginScreen message={message} setMessage={setMessage} configurationMessage={configurationMessage} />;
  }

  if (!canEnterGame) {
    return (
      <AuthContext.Provider value={contextValue}>
        <CloudEntryScreen
          userEmail={session.user.email ?? ""}
          cloudMetadata={cloudMetadata}
          localMetadata={localMetadata}
          isBusy={isBusy}
          message={message}
          onEnterGame={() => setCanEnterGame(true)}
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
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              autoComplete="email"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-ink outline-none focus:border-mint"
            />
          </label>
          <label className="text-sm font-semibold text-slate-600">
            {t("cloud.password")}
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-ink outline-none focus:border-mint"
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <AuthButton
              disabled={isBusy || !email || !password}
              onClick={() =>
                runAuth(async () => {
                  const { error } = await supabase!.auth.signInWithPassword({ email, password });
                  if (error) throw error;
                  setMessage(t("cloud.loggedIn"));
                })
              }
            >
              {t("cloud.logIn")}
            </AuthButton>
            <AuthButton
              disabled={isBusy || !email || !password}
              variant="secondary"
              onClick={() =>
                runAuth(async () => {
                  const { error } = await supabase!.auth.signUp({ email, password });
                  if (error) throw error;
                  setMessage(t("cloud.signUpComplete"));
                })
              }
            >
              {t("cloud.signUp")}
            </AuthButton>
          </div>
          <AuthButton
            disabled={isBusy}
            variant="secondary"
            onClick={() =>
              runAuth(async () => {
                const { error } = await supabase!.auth.signInWithOAuth({
                  provider: "google",
                  options: { redirectTo: window.location.origin }
                });
                if (error) throw error;
              })
            }
          >
            {t("cloud.continueWithGoogle")}
          </AuthButton>
        </div>
        {message ? <AuthMessage>{message}</AuthMessage> : null}
      </div>
    </AuthShell>
  );
}

function CloudEntryScreen({
  userEmail,
  cloudMetadata,
  localMetadata,
  isBusy,
  message,
  onEnterGame,
  onLoadCloudSave,
  onStartNewGame,
  onUploadLocalSave
}: {
  userEmail: string;
  cloudMetadata: CloudSaveMetadata | null;
  localMetadata: LocalSaveMetadata;
  isBusy: boolean;
  message: string | null;
  onEnterGame: () => void;
  onLoadCloudSave: () => void;
  onStartNewGame: () => void;
  onUploadLocalSave: () => void;
}) {
  const { t } = useTranslation();
  return (
    <AuthShell title={t("app.title")} subtitle={`${t("cloud.loggedIn")}: ${userEmail}`}>
      <div className="mx-auto mt-6 w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
        <div className="rounded-md border border-slate-200 bg-runway p-3 text-sm text-slate-700">
          <p>
            {t("cloud.localUpdated")}: {formatDate(localMetadata.updatedAt)}
          </p>
          <p>
            {t("cloud.cloudUpdated")}: {formatDate(cloudMetadata?.updatedAt ?? null)}
          </p>
        </div>
        {!cloudMetadata ? <AuthMessage>{t("cloud.noCloudSaveFound")}</AuthMessage> : null}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <AuthButton disabled={isBusy || !cloudMetadata} onClick={onLoadCloudSave}>
            {t("cloud.loadCloudSave")}
          </AuthButton>
          <AuthButton disabled={isBusy} variant="secondary" onClick={onEnterGame}>
            {t("cloud.enterGame")}
          </AuthButton>
          <AuthButton disabled={isBusy} variant="secondary" onClick={onStartNewGame}>
            {t("cloud.startNewGame")}
          </AuthButton>
          <AuthButton disabled={isBusy || !localMetadata.hasSave} variant="secondary" onClick={onUploadLocalSave}>
            {t("cloud.uploadLocalSave")}
          </AuthButton>
        </div>
        {message ? <AuthMessage>{message}</AuthMessage> : null}
      </div>
    </AuthShell>
  );
}

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-runway px-4 py-10">
      <div className="w-full max-w-4xl text-center">
        <p className="text-xs font-black uppercase tracking-normal text-coral">Airline Tycoon V1</p>
        <h1 className="mt-2 text-4xl font-black text-ink">{title}</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold text-slate-600">{subtitle}</p>
        {children}
      </div>
    </main>
  );
}

function AuthButton({
  children,
  disabled,
  onClick,
  variant = "primary"
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  variant?: "primary" | "secondary";
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-h-10 rounded-md px-3 py-2 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
        variant === "primary" ? "bg-jet text-white hover:bg-ink" : "bg-runway text-slate-700 hover:bg-slate-100"
      }`}
    >
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
  return error instanceof Error ? error.message : fallback;
}
