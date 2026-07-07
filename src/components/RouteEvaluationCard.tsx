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
        <div className="flex flex-wrap items-center gap-2">
          <GradeBadge grade={evaluation.overallGrade} label={t("routeEvaluation.overallGrade")} />
          <span className="rounded-md bg-jet px-2 py-1 text-xs font-black text-white">{evaluation.overallScore}/100</span>
        </div>
      </div>

      <div className={`mt-3 grid gap-2 text-sm ${compact ? "grid-cols-2" : "grid-cols-2 md:grid-cols-5"}`}>
        <Score label={t("routeEvaluation.demandScore")} value={<ScoreWithGrade score={evaluation.demandScore} grade={evaluation.demandGrade} />} />
        <Score label={t("routeEvaluation.profitScore")} value={<ScoreWithGrade score={evaluation.profitScore} grade={evaluation.profitGrade} />} />
        <Score label={t("routeEvaluation.aircraftFit")} value={<ScoreWithGrade score={evaluation.aircraftFitScore} grade={evaluation.aircraftFitGrade} />} />
        <Score label={t("routeEvaluation.riskLevel")} value={<RiskBadge risk={evaluation.riskLevel} score={evaluation.riskScore} />} />
        <Score label={t("routeEvaluation.strategicValue")} value={<ValueWithScore value={strategicLabel(evaluation.strategicValue, t)} score={evaluation.strategicScore} />} />
      </div>

      <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
        <Info label={t("routeEvaluation.estimatedWeeklyRevenue")} value={formatGBP.format(evaluation.estimatedWeeklyRevenue)} />
        <Info label={t("routeEvaluation.estimatedWeeklyProfit")} value={evaluation.estimatedWeeklyProfit === undefined ? "-" : formatGBP.format(evaluation.estimatedWeeklyProfit)} />
      </div>

      {compact ? null : <CabinDemandPanel evaluation={evaluation} />}

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

      {!compact && evaluation.scoreReasons.length > 0 ? (
        <NoticeList title={t("routeEvaluation.whyThisScore")} items={evaluation.scoreReasons} tone="neutral" />
      ) : null}

      {evaluation.warnings.length > 0 ? (
        <NoticeList title={t("routeEvaluation.warnings")} items={evaluation.warnings.map((warning) => translatedNotice(warning, t))} tone="warning" compact={compact} />
      ) : null}

      {!compact && evaluation.suggestions.length > 0 ? (
        <NoticeList title={t("routeEvaluation.suggestions")} items={evaluation.suggestions.map((suggestion) => translatedNotice(suggestion, t))} tone="success" />
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

function ScoreWithGrade({ score, grade }: { score: number; grade: RouteGrade }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-black text-ink">{score}/100</span>
      <GradeBadge grade={grade} />
    </div>
  );
}

function GradeBadge({ grade, label }: { grade: RouteGrade; label?: string }) {
  const color = grade === "A+" || grade === "A" ? "bg-mint/15 text-mint" : grade === "B" ? "bg-sky-100 text-sky-700" : grade === "C" ? "bg-amber-100 text-amber-700" : "bg-coral/10 text-coral";
  return <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-black ${color}`}>{label ? `${label}: ${grade}` : grade}</span>;
}

function RiskBadge({ risk, score }: { risk: RouteRiskLevel; score: number }) {
  const { t } = useTranslation();
  const color = risk === "low" ? "bg-mint/15 text-mint" : risk === "medium" ? "bg-amber-100 text-amber-700" : "bg-coral/10 text-coral";
  return <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-black ${color}`}>{riskLabel(risk, t)} / {score}</span>;
}

function ValueWithScore({ value, score }: { value: string; score: number }) {
  return <span className="font-black capitalize text-ink">{value} / {score}</span>;
}

function CabinDemandPanel({ evaluation }: { evaluation: RouteEvaluation }) {
  const { t } = useTranslation();
  const demand = evaluation.cabinDemandBreakdown;
  return (
    <div className="mt-3 rounded-md bg-runway p-3 text-sm">
      <p className="font-black text-ink">{t("routeEvaluation.cabinDemand")}</p>
      <div className="mt-2 grid gap-2 text-xs font-semibold text-slate-600 sm:grid-cols-2 lg:grid-cols-5">
        <CabinDemandItem label={t("fleet.firstClass")} value={formatNumber.format(demand.first)} />
        <CabinDemandItem label={t("fleet.business")} value={formatNumber.format(demand.business)} />
        <CabinDemandItem label={t("fleet.premiumEconomy")} value={formatNumber.format(demand.premiumEconomy)} />
        <CabinDemandItem label={t("fleet.economy")} value={formatNumber.format(demand.economy)} />
        <CabinDemandItem label={t("fleet.cargo")} value={`${demand.cargo.toFixed(1)} t`} />
      </div>
      {demand.first === 0 ? <p className="mt-2 text-xs font-bold text-slate-500">{t("routeEvaluation.shortHaulFirstDemandNote")}</p> : null}
    </div>
  );
}

function CabinDemandItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white px-2 py-2">
      <p className="text-slate-500">{label}</p>
      <p className="mt-1 font-black text-ink">{value}</p>
    </div>
  );
}

function NoticeList({ title, items, tone, compact = false }: { title: string; items: string[]; tone: "neutral" | "warning" | "success"; compact?: boolean }) {
  const visibleItems = compact ? items.slice(0, 2) : items.slice(0, 6);
  const color = tone === "warning" ? "bg-amber-50 text-amber-700" : tone === "success" ? "bg-mint/10 text-mint" : "bg-runway text-slate-700";
  return (
    <div className="mt-3">
      <p className="text-xs font-black uppercase tracking-normal text-slate-500">{title}</p>
      <div className="mt-2 space-y-1">
        {visibleItems.map((item) => (
          <p key={item} className={`rounded-md px-3 py-2 text-xs font-bold ${color}`}>- {item}</p>
        ))}
      </div>
    </div>
  );
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
  if (message === "No owned aircraft has enough range") return t("routeEvaluation.aircraftRangeTooShort");
  if (message === "Short-haul routes do not support meaningful First Class demand") return t("routeEvaluation.shortHaulNoFirst");
  if (message === "Cabin configuration does not match route demand") return t("routeEvaluation.cabinMismatch");
  if (message === "This aircraft has too many First Class seats for a short-haul route") return t("routeEvaluation.tooManyFirstSeats");
  if (message === "Use economy-focused regional or narrow-body aircraft") return t("routeEvaluation.useEconomyAircraft");
  if (message === "Buy or move a suitable aircraft before opening this route") return t("routeEvaluation.buyOrMoveAircraft");
  if (message === "Prioritize long-haul aircraft with premium and cargo capacity") return t("routeEvaluation.useLongHaulPremiumAircraft");
  if (message === "Strong route opportunity") return t("routeEvaluation.strongRoute");
  if (message === "Weak route") return t("routeEvaluation.weakRoute");
  return message;
}
