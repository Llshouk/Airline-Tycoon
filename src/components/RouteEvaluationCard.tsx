"use client";

import type { ReactNode } from "react";
import { aircraftById } from "@/data/aircraft";
import { useTranslation } from "@/i18n";
import { formatGBP, formatNumber } from "@/lib/format";
import type { RouteEvaluation, RouteGrade, RouteRiskLevel, RouteStrategicValue } from "@/lib/routeEvaluation";
import type { GameState } from "@/types/game";

type Props = {
  evaluation: RouteEvaluation;
  game: GameState;
  compact?: boolean;
};

export function RouteEvaluationCard({ evaluation, game, compact = false }: Props) {
  const { t } = useTranslation();
  const recommendedAircraft = evaluation.recommendedAircraftIds
    .map((aircraftId) => {
      const aircraft = game.fleet.find((item) => item.id === aircraftId);
      const model = aircraft ? aircraftById[aircraft.modelId] : null;
      return aircraft && model ? `${aircraft.registration} ${model.model}` : null;
    })
    .filter((item): item is string => Boolean(item));

  return (
    <section className="mt-4 rounded-md border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-black uppercase tracking-normal text-coral">{t("routeEvaluation.title")}</p>
          <p className="mt-1 text-sm font-semibold text-slate-500">{gradeDescription(evaluation.overallGrade, t)}</p>
        </div>
        <GradeBadge grade={evaluation.overallGrade} label={t("routeEvaluation.overallGrade")} />
      </div>

      <div className={`mt-3 grid gap-2 text-sm ${compact ? "grid-cols-2" : "grid-cols-2 md:grid-cols-5"}`}>
        <Score label={t("routeEvaluation.demandScore")} value={<GradeBadge grade={evaluation.demandScore} />} />
        <Score label={t("routeEvaluation.profitScore")} value={<GradeBadge grade={evaluation.profitScore} />} />
        <Score label={t("routeEvaluation.aircraftFit")} value={<GradeBadge grade={evaluation.aircraftFitScore} />} />
        <Score label={t("routeEvaluation.riskLevel")} value={<RiskBadge risk={evaluation.riskLevel} />} />
        <Score label={t("routeEvaluation.strategicValue")} value={<span className="font-black capitalize text-ink">{strategicLabel(evaluation.strategicValue, t)}</span>} />
      </div>

      <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
        <Info label={t("routeEvaluation.estimatedWeeklyRevenue")} value={formatGBP.format(evaluation.estimatedWeeklyRevenue)} />
        <Info label={t("routeEvaluation.estimatedWeeklyProfit")} value={evaluation.estimatedWeeklyProfit === undefined ? "-" : formatGBP.format(evaluation.estimatedWeeklyProfit)} />
      </div>

      {compact ? null : (
        <div className="mt-3 rounded-md bg-runway p-3 text-sm">
          <p className="font-black text-ink">{t("routes.weeklyDemand")}</p>
          <p className="mt-1 text-xs font-semibold text-slate-600">
            F {formatNumber.format(evaluation.adjustedDemand.first)} / B {formatNumber.format(evaluation.adjustedDemand.business)} / W{" "}
            {formatNumber.format(evaluation.adjustedDemand.premiumEconomy)} / Y {formatNumber.format(evaluation.adjustedDemand.economy)} / Cargo{" "}
            {evaluation.adjustedDemand.cargoTons.toFixed(1)} t
          </p>
        </div>
      )}

      <div className="mt-3">
        <p className="text-xs font-black uppercase tracking-normal text-slate-500">{t("routeEvaluation.recommendedAircraft")}</p>
        {recommendedAircraft.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {recommendedAircraft.map((label) => (
              <span key={label} className="rounded-md bg-mint/10 px-2 py-1 text-xs font-black text-mint">
                {label}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 rounded-md bg-coral/10 px-3 py-2 text-sm font-bold text-coral">{t("routeEvaluation.noSuitableAircraft")}</p>
        )}
      </div>

      {evaluation.warnings.length > 0 ? (
        <div className="mt-3 space-y-1">
          {evaluation.warnings.map((warning) => (
            <p key={warning} className="rounded-md bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
              {translatedNotice(warning, t)}
            </p>
          ))}
        </div>
      ) : null}

      {!compact && evaluation.suggestions.length > 0 ? (
        <div className="mt-3 space-y-1">
          {evaluation.suggestions.map((suggestion) => (
            <p key={suggestion} className="rounded-md bg-mint/10 px-3 py-2 text-xs font-bold text-mint">
              {translatedNotice(suggestion, t)}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Score({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md bg-runway px-3 py-2">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <div className="mt-1">{value}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-runway px-3 py-2">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="truncate font-bold text-ink">{value}</p>
    </div>
  );
}

function GradeBadge({ grade, label }: { grade: RouteGrade; label?: string }) {
  const color = grade === "A+" || grade === "A" ? "bg-mint/15 text-mint" : grade === "B" ? "bg-sky-100 text-sky-700" : grade === "C" ? "bg-amber-100 text-amber-700" : "bg-coral/10 text-coral";
  return <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-black ${color}`}>{label ? `${label}: ${grade}` : grade}</span>;
}

function RiskBadge({ risk }: { risk: RouteRiskLevel }) {
  const { t } = useTranslation();
  const color = risk === "low" ? "bg-mint/15 text-mint" : risk === "medium" ? "bg-amber-100 text-amber-700" : "bg-coral/10 text-coral";
  return <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-black ${color}`}>{riskLabel(risk, t)}</span>;
}

function riskLabel(risk: RouteRiskLevel, t: ReturnType<typeof useTranslation>["t"]) {
  if (risk === "low") return t("routeEvaluation.lowRisk");
  if (risk === "medium") return t("routeEvaluation.mediumRisk");
  return t("routeEvaluation.highRisk");
}

function strategicLabel(value: RouteStrategicValue, t: ReturnType<typeof useTranslation>["t"]) {
  if (value === "high") return t("routeEvaluation.highValue");
  if (value === "medium") return t("routeEvaluation.mediumValue");
  return t("routeEvaluation.lowValue");
}

function gradeDescription(grade: RouteGrade, t: ReturnType<typeof useTranslation>["t"]) {
  return grade === "A+" || grade === "A" ? t("routeEvaluation.strongRoute") : grade === "D" ? t("routeEvaluation.weakRoute") : t("routeEvaluation.routeEvaluation");
}

function translatedNotice(message: string, t: ReturnType<typeof useTranslation>["t"]) {
  if (message === "No suitable aircraft available") return t("routeEvaluation.noSuitableAircraft");
  if (message === "Short-haul routes do not support meaningful First Class demand") return t("routeEvaluation.shortHaulNoFirst");
  if (message === "Cabin configuration does not match route demand") return t("routeEvaluation.cabinMismatch");
  if (message === "Strong route opportunity") return t("routeEvaluation.strongRoute");
  if (message === "Weak route") return t("routeEvaluation.weakRoute");
  return message;
}
