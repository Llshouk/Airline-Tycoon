"use client";

import { PlaneTakeoff } from "lucide-react";
import { FormEvent, useState } from "react";
import { useAuthSession } from "@/components/AuthGate";
import { getDifficultyConfig } from "@/config/difficulty";
import { airports } from "@/data/airports";
import { useTranslation } from "@/i18n";
import { formatGBP } from "@/lib/format";
import { BASE_AIRPORT_COST, STARTING_CAPITAL, useGameStore } from "@/store/gameStore";

export function StartScreen() {
  const { language, setLanguage, t } = useTranslation();
  const { selectedDifficulty } = useAuthSession();
  const difficultyConfig = getDifficultyConfig(selectedDifficulty);
  const [airlineName, setAirlineName] = useState("Atlas Link Airways");
  const [baseAirportId, setBaseAirportId] = useState("lhr");
  const startGame = useGameStore((state) => state.startGame);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startGame(airlineName, baseAirportId, difficultyConfig.difficulty);
  }

  return (
    <main className="min-h-screen bg-runway">
      <section className="mx-auto grid min-h-screen max-w-6xl items-center gap-8 px-4 py-10 lg:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-lg bg-jet text-white shadow-soft">
            <PlaneTakeoff size={30} />
          </div>
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value === "zh" ? "zh" : "en")}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-jet shadow-soft"
          >
            <option value="en">{t("common.english")}</option>
            <option value="zh">{t("common.chinese")}</option>
          </select>
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-normal text-coral">First playable build</p>
            <h1 className="mt-2 text-4xl font-black leading-tight text-ink sm:text-6xl">{t("app.title")}</h1>
            <p className="mt-4 text-lg text-slate-600">
              Choose a real hub, buy aircraft, open routes, schedule flights, and build cash flow one completed sector at a time.
            </p>
          </div>
          <div className="grid max-w-xl gap-3 sm:grid-cols-3">
            <Metric label="Difficulty" value={difficultyConfig.label} />
            <Metric label="Starting capital" value={formatGBP.format(STARTING_CAPITAL * difficultyConfig.startingCashMultiplier)} />
            <Metric label="Base cost" value={formatGBP.format(BASE_AIRPORT_COST)} />
            <Metric label="Speed" value={`${difficultyConfig.speedMultiplier}x`} />
          </div>
        </div>

        <form onSubmit={onSubmit} className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
          <h2 className="text-xl font-bold text-ink">Create airline</h2>
          <label className="mt-5 block">
            <span className="text-sm font-semibold text-slate-700">Airline name</span>
            <input
              value={airlineName}
              onChange={(event) => setAirlineName(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-3 outline-none focus:border-jet focus:ring-2 focus:ring-jet/20"
              maxLength={40}
            />
          </label>
          <label className="mt-4 block">
            <span className="text-sm font-semibold text-slate-700">Base airport</span>
            <select
              value={baseAirportId}
              onChange={(event) => setBaseAirportId(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-3 outline-none focus:border-jet focus:ring-2 focus:ring-jet/20"
            >
              {airports.map((airport) => (
                <option key={airport.id} value={airport.id}>
                  {airport.iata} - {airport.city}, {airport.country}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="mt-6 w-full rounded-md bg-coral px-4 py-3 font-bold text-white hover:bg-coral/90">
            Start airline
          </button>
          <p className="mt-3 text-sm text-slate-500">
            Your base purchase is deducted immediately, leaving {formatGBP.format(STARTING_CAPITAL * difficultyConfig.startingCashMultiplier - BASE_AIRPORT_COST)}.
          </p>
        </form>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-black text-ink">{value}</p>
    </div>
  );
}
