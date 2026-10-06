"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "@/i18n";
import { formatGBP } from "@/lib/format";
import { forecastOperations } from "@/lib/operationForecast";
import { prepareWeeklySchedule, type WeeklyScheduleInput } from "@/lib/scheduleActions";
import { formatGameDate } from "@/lib/time";
import type { GameState } from "@/types/game";

export function ScheduleMarketForecast({ game, input }: { game: GameState; input: WeeklyScheduleInput }) {
  const { t } = useTranslation();
  const [result, setResult] = useState<{ profit: number; passengers: number; flights: number; time: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  function calculate() {
    const candidate = prepareWeeklySchedule(game, input);
    if (!candidate.game) { setError(candidate.message); setResult(null); return; }
    const schedule = candidate.game.fleet.find((aircraft) => aircraft.id === input.aircraftId)!.weeklySchedules.at(-1)!;
    const forecast = forecastOperations(candidate.game);
    const flights = forecast.flights.filter((event) => event.entry.id.startsWith(schedule.id + "-"));
    setResult({ profit: flights.reduce((sum, event) => sum + event.entry.profit, 0), passengers: flights.reduce((sum, event) => sum + event.entry.passengerCount, 0),
      flights: flights.length, time: game.currentGameTimeMs });
    setError(null);
  }
  return <section className="mt-3 border-y border-slate-200 py-3">
    <button type="button" onClick={calculate} className="flex min-h-10 items-center gap-2 rounded-md bg-slate-100 px-3 text-sm font-bold text-jet"><RefreshCw size={16} />{t("market.sharedForecast")}</button>
    {result && <div className="mt-2 text-sm"><p className="text-xs text-slate-500">{t("market.asOf")}: {formatGameDate(result.time)}</p>
      <p className="mt-1 font-bold">{t("market.profit")}: {formatGBP.format(result.profit)}</p><p>{t("market.flights")}: {result.flights} / {t("market.passengers")}: {result.passengers}</p>
    </div>}
    {error && <p role="alert" className="mt-2 text-sm text-coral">{error}</p>}
  </section>;
}
