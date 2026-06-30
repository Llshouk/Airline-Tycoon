"use client";

import { Cloud, LogOut, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "@/i18n";
import {
  getCloudSaveMetadata,
  getLocalSaveMetadata,
  getSupabaseConfigurationMessage,
  isSupabaseConfigured,
  loadCloudSaveIntoGame,
  saveGameToCloud,
  uploadLocalSaveToCloud,
  type CloudSaveMetadata,
  type LocalSaveMetadata
} from "@/lib/cloudSave";
import { supabase } from "@/lib/supabaseClient";
import { useGameStore } from "@/store/gameStore";

export function CloudSavePanel() {
  const { t } = useTranslation();
  const game = useGameStore((state) => state.game);
  const loadGameStateFromCloud = useGameStore((state) => state.loadGameStateFromCloud);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cloudMetadata, setCloudMetadata] = useState<CloudSaveMetadata | null>(null);
  const [localMetadata, setLocalMetadata] = useState<LocalSaveMetadata>({ hasSave: false, updatedAt: null });
  const [isBusy, setIsBusy] = useState(false);
  const configured = isSupabaseConfigured();
  const configurationMessage = getSupabaseConfigurationMessage();

  useEffect(() => {
    setLocalMetadata(getLocalSaveMetadata());
    if (!supabase) {
      setMessage(configurationMessage ?? t("cloud.supabaseNotConfigured"));
      return;
    }

    let isMounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      const nextEmail = data.session?.user.email ?? null;
      setUserEmail(nextEmail);
      if (nextEmail) void refreshCloudMetadata();
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextEmail = session?.user.email ?? null;
      setUserEmail(nextEmail);
      setLocalMetadata(getLocalSaveMetadata());
      if (nextEmail) {
        void refreshCloudMetadata();
      } else {
        setCloudMetadata(null);
      }
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  const comparisonText = useMemo(() => {
    if (!localMetadata.hasSave && !cloudMetadata) return t("cloud.noSaveMetadata");
    const localTime = formatDate(localMetadata.updatedAt);
    const cloudTime = formatDate(cloudMetadata?.updatedAt ?? null);
    if (localMetadata.updatedAt && cloudMetadata?.updatedAt) {
      const localMs = Date.parse(localMetadata.updatedAt);
      const cloudMs = Date.parse(cloudMetadata.updatedAt);
      const newer = localMs > cloudMs ? t("cloud.localNewer") : cloudMs > localMs ? t("cloud.cloudNewer") : t("cloud.sameAge");
      return `${t("cloud.localUpdated")}: ${localTime} | ${t("cloud.cloudUpdated")}: ${cloudTime} | ${newer}`;
    }
    return `${t("cloud.localUpdated")}: ${localTime} | ${t("cloud.cloudUpdated")}: ${cloudTime}`;
  }, [cloudMetadata, localMetadata, t]);

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

  async function handleSignUp() {
    const client = supabase;
    if (!client) {
      setMessage(configurationMessage ?? t("cloud.supabaseNotConfigured"));
      return;
    }
    await runCloudAction(async () => {
      const { error } = await client.auth.signUp({ email, password });
      if (error) throw error;
      setMessage(t("cloud.signUpComplete"));
    });
  }

  async function handleLogIn() {
    const client = supabase;
    if (!client) {
      setMessage(configurationMessage ?? t("cloud.supabaseNotConfigured"));
      return;
    }
    await runCloudAction(async () => {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setMessage(t("cloud.loggedIn"));
      await refreshCloudMetadata();
    });
  }

  async function handleLogOut() {
    const client = supabase;
    if (!client) return;
    await runCloudAction(async () => {
      const { error } = await client.auth.signOut();
      if (error) throw error;
      setMessage(t("cloud.loggedOut"));
      setCloudMetadata(null);
    });
  }

  async function handleSaveToCloud() {
    if (!game) return;
    await runCloudAction(async () => {
      const metadata = await saveGameToCloud(game);
      setCloudMetadata(metadata);
      setLocalMetadata(getLocalSaveMetadata());
      setMessage(t("cloud.savedToCloud"));
    });
  }

  async function handleUploadLocalSave() {
    if (!game) return;
    await runCloudAction(async () => {
      const metadata = await uploadLocalSaveToCloud(game);
      setCloudMetadata(metadata);
      setLocalMetadata(getLocalSaveMetadata());
      setMessage(t("cloud.localSaveUploaded"));
    });
  }

  async function handleLoadCloudSave() {
    await runCloudAction(async () => {
      const result = await loadCloudSaveIntoGame((cloudGame) => {
        const loaded = loadGameStateFromCloud(cloudGame);
        if (!loaded.ok) throw new Error(loaded.message);
      });
      if (!result) {
        setMessage(t("cloud.noCloudSaveFound"));
        return;
      }
      setCloudMetadata(result.metadata);
      setLocalMetadata(getLocalSaveMetadata());
      setMessage(t("cloud.cloudSaveLoaded"));
    });
  }

  async function runCloudAction(action: () => Promise<void>) {
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
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
      <div className="mb-3 flex items-center gap-2">
        <Cloud size={20} className="text-mint" />
        <h3 className="font-bold text-ink">{t("cloud.title")}</h3>
      </div>
      <p className="mb-4 text-sm text-slate-600">{t("cloud.description")}</p>

      {!configured ? (
        <StatusMessage>{configurationMessage ?? t("cloud.supabaseNotConfigured")}</StatusMessage>
      ) : userEmail ? (
        <div className="space-y-4">
          <div className="rounded-md border border-mint/30 bg-mint/5 p-3 text-sm">
            <p className="font-bold text-ink">{t("cloud.loggedIn")}</p>
            <p className="text-slate-600">{userEmail}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-runway p-3 text-xs font-semibold text-slate-600">
            {comparisonText}
          </div>
          {!cloudMetadata ? <StatusMessage>{t("cloud.noCloudSaveFound")}</StatusMessage> : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <CloudButton disabled={isBusy || !game} onClick={handleSaveToCloud}>
              {t("cloud.saveToCloud")}
            </CloudButton>
            <CloudButton disabled={isBusy || !cloudMetadata} onClick={handleLoadCloudSave}>
              {t("cloud.loadCloudSave")}
            </CloudButton>
            <CloudButton disabled={isBusy || !game} onClick={handleUploadLocalSave}>
              <UploadCloud size={16} />
              {t("cloud.uploadLocalSave")}
            </CloudButton>
            <CloudButton disabled={isBusy} onClick={handleLogOut} variant="secondary">
              <LogOut size={16} />
              {t("cloud.logOut")}
            </CloudButton>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
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
          </div>
          <div className="flex flex-wrap gap-2">
            <CloudButton disabled={isBusy || !email || !password} onClick={handleSignUp}>
              {t("cloud.signUp")}
            </CloudButton>
            <CloudButton disabled={isBusy || !email || !password} onClick={handleLogIn} variant="secondary">
              {t("cloud.logIn")}
            </CloudButton>
          </div>
        </div>
      )}

      {message ? <StatusMessage>{message}</StatusMessage> : null}
    </section>
  );
}

function CloudButton({
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
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
        variant === "primary" ? "bg-jet text-white hover:bg-ink" : "bg-runway text-slate-700 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

function StatusMessage({ children }: { children: ReactNode }) {
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
