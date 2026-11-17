"use client";

import { PlaneTakeoff } from "lucide-react";
import { FormEvent, useState } from "react";
import { useAuthSession } from "@/components/AuthGate";
import { EntryBackdrop } from "@/components/EntryBackdrop";
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

  const startingCapital = STARTING_CAPITAL * difficultyConfig.startingCashMultiplier;

  return (
    <main className="relative min-h-screen overflow-hidden bg-apron">
      <EntryBackdrop />
      <section className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-4 py-10 lg:grid-cols-[1fr_420px]">
        <div>
          <div className="flex items-center justify-between gap-4">
            <span className="grid h-12 w-12 place-items-center rounded bg-sign text-apron"><PlaneTakeoff size={26} aria-hidden="true" /></span>
            <select
              aria-label={t("shell.language")}
              value={language}
              onChange={(event) => setLanguage(event.target.value === "zh" ? "zh" : "en")}
              className="h-10 rounded border border-apron-line bg-apron-light px-3 text-sm font-semibold text-white lg:hidden"
            >
              <option value="en">{t("common.english")}</option>
              <option value="zh">{t("common.chinese")}</option>
            </select>
          </div>
          <h1 className="mt-6 text-5xl font-bold leading-none text-white sm:text-7xl">{t("app.title")}</h1>
          <p className="mt-5 max-w-xl text-lg text-slate-300">{t("start.pitch")}</p>
          <dl className="mt-8 grid max-w-xl grid-cols-1 gap-x-8 gap-y-4 border-t border-apron-line pt-6 sm:grid-cols-3">
            <Metric label={t("start.difficulty")} value={t(`difficulty.${difficultyConfig.difficulty}`)} />
            <Metric label={t("start.capital")} value={formatGBP.format(startingCapital)} />
            <Metric label={t("start.baseCost")} value={formatGBP.format(BASE_AIRPORT_COST)} />
          </dl>
        </div>

        <form onSubmit={onSubmit} className="rounded-lg bg-white p-6 shadow-lift">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-2xl font-bold text-ink">{t("start.create")}</h2>
            <select
              aria-label={t("shell.language")}
              value={language}
              onChange={(event) => setLanguage(event.target.value === "zh" ? "zh" : "en")}
              className="hidden h-9 rounded border border-slate-300 bg-white px-2 text-sm font-semibold text-ink lg:block"
            >
              <option value="en">{t("common.english")}</option>
              <option value="zh">{t("common.chinese")}</option>
            </select>
          </div>
          <label className="mt-5 block">
            <span className="text-sm font-semibold text-slate-700">{t("start.airlineName")}</span>
            <input
              value={airlineName}
              onChange={(event) => setAirlineName(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-3 text-ink outline-none focus:border-jet focus:ring-2 focus:ring-jet/20"
              maxLength={40}
            />
          </label>
          <label className="mt-4 block">
            <span className="text-sm font-semibold text-slate-700">{t("start.baseAirport")}</span>
            <select
              value={baseAirportId}
              onChange={(event) => setBaseAirportId(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-ink outline-none focus:border-jet focus:ring-2 focus:ring-jet/20"
            >
              {airports.map((airport) => (
                <option key={airport.id} value={airport.id}>
                  {airport.iata} - {airport.city}, {airport.country}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="mt-6 w-full rounded-md bg-sign px-4 py-3 text-lg font-bold text-apron hover:bg-sign-deep">
            {t("start.submit")}
          </button>
          <p className="mt-3 text-sm text-slate-500">
            {t("start.afterBase")} {formatGBP.format(startingCapital - BASE_AIRPORT_COST)}
          </p>
        </form>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-slate-400">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-semibold text-white">{value}</dd>
    </div>
  );
}
