"use client";

import { useMemo, useState } from "react";
import { ENABLE_GAME_CONSOLE } from "@/config/gameBalance";
import { useTranslation } from "@/i18n";
import { formatGBP } from "@/lib/format";
import { useGameStore } from "@/store/gameStore";
import type { GameState } from "@/types/game";

export function GameConsole({ onClose }: { onClose?: () => void }) {
  const { t } = useTranslation();
  const game = useGameStore((state) => state.game);
  const addConsoleMoney = useGameStore((state) => state.addConsoleMoney);
  const setConsoleMoney = useGameStore((state) => state.setConsoleMoney);
  const addConsoleStats = useGameStore((state) => state.addConsoleStats);
  const unlockAllAirportsForTesting = useGameStore((state) => state.unlockAllAirportsForTesting);
  const clearAllSchedulesForTesting = useGameStore((state) => state.clearAllSchedulesForTesting);
  const importGameStateForTesting = useGameStore((state) => state.importGameStateForTesting);
  const resetGame = useGameStore((state) => state.resetGame);
  const [moneyAmount, setMoneyAmount] = useState("10000000");
  const [flightsAmount, setFlightsAmount] = useState("10");
  const [passengersAmount, setPassengersAmount] = useState("1000");
  const [cargoAmount, setCargoAmount] = useState("25");
  const [importText, setImportText] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const exportText = useMemo(() => (game ? JSON.stringify(game, null, 2) : ""), [game]);

  if (!ENABLE_GAME_CONSOLE || !game) return null;

  function readNumber(value: string, label: string) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
      setMessage(`${label} must be a valid positive number.`);
      return null;
    }
    return amount;
  }

  function importSave() {
    try {
      const parsed = JSON.parse(importText) as GameState;
      const result = importGameStateForTesting(parsed);
      setMessage(result.message);
    } catch {
      setMessage("Import failed: invalid JSON.");
    }
  }

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-normal text-amber-700">{t("console.testingOnly")}</p>
          <h3 className="font-black text-ink">{t("console.gameConsole")}</h3>
          <p className="text-sm text-slate-600">Fast local testing controls. These changes persist to localStorage.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {message ? <span className="rounded-md bg-white px-3 py-2 text-sm font-bold text-amber-700">{message}</span> : null}
          {onClose ? (
            <button type="button" onClick={onClose} className="rounded-md border border-amber-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-amber-50">
              Close
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-amber-100 bg-white p-3">
          <h4 className="font-bold text-ink">Money</h4>
          <p className="mt-1 text-sm font-semibold text-slate-500">{t("console.currentCash")}: {formatGBP.format(game.money)}</p>
          <input
            type="number"
            min="0"
            value={moneyAmount}
            onChange={(event) => setMoneyAmount(event.target.value)}
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 font-bold outline-none focus:border-jet focus:ring-2 focus:ring-jet/20"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const amount = readNumber(moneyAmount, "Money");
                if (amount === null) return;
                addConsoleMoney(amount);
                setMessage(`Added ${amount.toLocaleString("en-GB")}.`);
              }}
              className="rounded-md bg-jet px-3 py-2 text-sm font-bold text-white transition hover:bg-jet/90"
            >
              {t("console.addMoney")}
            </button>
            <button
              type="button"
              onClick={() => {
                const amount = readNumber(moneyAmount, "Money");
                if (amount === null) return;
                setConsoleMoney(amount);
                setMessage(`Money set to ${amount.toLocaleString("en-GB")}.`);
              }}
              className="rounded-md bg-coral px-3 py-2 text-sm font-bold text-white transition hover:bg-coral/90"
            >
              {t("console.setMoney")}
            </button>
          </div>
        </div>

        <div className="rounded-md border border-amber-100 bg-white p-3">
          <h4 className="font-bold text-ink">Stats</h4>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <MiniNumber label="Flights" value={flightsAmount} onChange={setFlightsAmount} />
            <MiniNumber label="Passengers" value={passengersAmount} onChange={setPassengersAmount} />
            <MiniNumber label="Cargo" value={cargoAmount} onChange={setCargoAmount} />
          </div>
          <button
            type="button"
            onClick={() => {
              const completedFlights = readNumber(flightsAmount, "Flights");
              const passengerCount = readNumber(passengersAmount, "Passengers");
              const cargoTransportedTons = readNumber(cargoAmount, "Cargo");
              if (completedFlights === null || passengerCount === null || cargoTransportedTons === null) return;
              addConsoleStats({ completedFlights, passengerCount, cargoTransportedTons });
              setMessage("Stats added.");
            }}
            className="mt-2 rounded-md bg-jet px-3 py-2 text-sm font-bold text-white transition hover:bg-jet/90"
          >
            Add Stats
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={unlockAllAirportsForTesting} className="rounded-md bg-runway px-3 py-2 text-sm font-bold text-jet transition hover:bg-slate-100">
          Unlock all airport endpoints
        </button>
        <button type="button" onClick={clearAllSchedulesForTesting} className="rounded-md bg-runway px-3 py-2 text-sm font-bold text-jet transition hover:bg-slate-100">
          Clear all schedules
        </button>
        <button type="button" onClick={resetGame} className="rounded-md bg-coral/10 px-3 py-2 text-sm font-bold text-coral transition hover:bg-coral/20">
          {t("console.resetSave")}
        </button>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <label className="block">
          <span className="text-sm font-bold text-slate-700">{t("console.exportSave")}</span>
          <textarea readOnly value={exportText} className="mt-2 h-40 w-full rounded-md border border-slate-300 bg-white p-3 font-mono text-xs outline-none" />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-700">{t("console.importSave")}</span>
          <textarea
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            placeholder="Paste exported JSON"
            className="mt-2 h-40 w-full rounded-md border border-slate-300 bg-white p-3 font-mono text-xs outline-none focus:border-jet focus:ring-2 focus:ring-jet/20"
          />
          <button type="button" onClick={importSave} className="mt-2 rounded-md bg-jet px-3 py-2 text-sm font-bold text-white transition hover:bg-jet/90">
            {t("console.importSave")}
          </button>
        </label>
      </div>
    </section>
  );
}

function MiniNumber({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="text-xs font-bold text-slate-500">{label}</span>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm font-bold outline-none focus:border-jet focus:ring-2 focus:ring-jet/20"
      />
    </label>
  );
}
