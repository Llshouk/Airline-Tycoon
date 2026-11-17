"use client";

import { Download, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "@/i18n";
import { createCompactSaveState, restoreGameStateFromCloudSave } from "@/lib/cloudSave";
import { normalizeGame, useGameStore } from "@/store/gameStore";

/** A save the player can keep outside the browser, so clearing site data is not the end of an airline. */
export function SaveFilePanel() {
  const { t } = useTranslation();
  const loadGame = useGameStore((state) => state.loadGameStateFromCloud);
  const picker = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function exportSave() {
    const game = normalizeGame(useGameStore.getState().game);
    if (!game) return;
    const text = JSON.stringify({ app: "airline-tycoon", exportedAt: new Date().toISOString(), save: createCompactSaveState(game) });
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a");
    const name = game.airlineName.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "airline";
    link.href = url;
    link.download = `${name}-${new Date().toISOString().slice(0, 10)}.airline-save.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage({ ok: true, text: t("saveFile.exported") });
  }

  async function importSave(file: File | undefined) {
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const payload = parsed && typeof parsed === "object" && "save" in parsed ? (parsed as { save: unknown }).save : parsed;
      if (!payload || typeof payload !== "object" || !Array.isArray((payload as { fleet?: unknown }).fleet) ||
        !Array.isArray((payload as { routes?: unknown }).routes)) throw new Error("not a save");
      const game = normalizeGame(restoreGameStateFromCloudSave(payload));
      if (!game || !window.confirm(t("saveFile.confirmImport"))) return;
      // Time spent away from the file is not simulated: play resumes from the moment it was saved.
      const result = loadGame({ ...game, lastTickRealMs: Date.now() });
      setMessage({ ok: result.ok, text: result.ok ? t("saveFile.imported") : t("saveFile.invalid") });
    } catch {
      setMessage({ ok: false, text: t("saveFile.invalid") });
    } finally {
      if (picker.current) picker.current.value = "";
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-lg font-bold text-ink">{t("saveFile.title")}</h3>
      <p className="mt-1 max-w-prose text-sm text-slate-600">{t("saveFile.description")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={exportSave}
          className="flex min-h-10 items-center gap-2 rounded-md bg-apron px-4 py-2 text-sm font-bold text-white hover:bg-apron-light">
          <Download size={16} aria-hidden="true" />{t("saveFile.export")}
        </button>
        <button type="button" onClick={() => picker.current?.click()}
          className="flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-ink hover:bg-slate-50">
          <Upload size={16} aria-hidden="true" />{t("saveFile.import")}
        </button>
        <input ref={picker} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden="true"
          onChange={(event) => void importSave(event.target.files?.[0])} />
      </div>
      {message ? <p role="status" className={`mt-3 text-sm font-semibold ${message.ok ? "text-mint" : "text-coral"}`}>{message.text}</p> : null}
    </section>
  );
}
