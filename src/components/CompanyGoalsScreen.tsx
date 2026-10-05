"use client";

import { ArrowRight, Check, CheckCircle2, Flag, Package, Plane, Route, Target, Trophy, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { airportsById } from "@/data/airports";
import { useTranslation } from "@/i18n";
import { COMPANY_LEVELS, MILESTONES, companyLevel, contractEligibility, normalizeCompanyGrowth, totalDevelopmentPoints, type ContractError } from "@/lib/companyGrowth";
import { formatGBP } from "@/lib/format";
import { DAY_MS, formatGameDate } from "@/lib/time";
import { useGameStore } from "@/store/gameStore";
import type { CompanyContract, CompanyGrowth } from "@/types/companyGrowth";
import type { GameState } from "@/types/game";

type Destination = "map" | "routes" | "schedule" | "market";
const icons = { commuter: Plane, cargo: Package, network: Route };

export function CompanyGoalsScreen({ onNavigate }: { onNavigate: (screen: Destination) => void }) {
  const { t } = useTranslation();
  const game = useGameStore((state) => state.game);
  const accept = useGameStore((state) => state.acceptContract);
  const abandon = useGameStore((state) => state.abandonContract);
  const [tab, setTab] = useState<"offers" | "active" | "company">("offers");
  const [error, setError] = useState<ContractError | null>(null);
  const [abandonId, setAbandonId] = useState<string | null>(null);
  const abandonDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { useGameStore.getState().refreshGoals(); }, []);
  useEffect(() => {
    const dialog = abandonDialog.current;
    if (abandonId && dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, [abandonId]);
  if (!game) return null;
  const growth = normalizeCompanyGrowth(game.companyGrowth, game);
  const refreshTime = game.baseGameTimeMs + (growth.boardCycle + 1) * 3 * DAY_MS;
  return <div className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <h2 className="text-2xl font-black text-ink">{t("growth.title")}</h2>
      <span className="text-sm font-bold text-slate-600">{t("growth.slots")}: {growth.active.length} / 2</span>
    </div>
    <CompanyGrowthSummary game={game} />
    <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-3" role="tablist" aria-label={t("growth.title")}>
      {(["offers", "active", "company"] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={tab === value}
        onClick={() => { setTab(value); setError(null); }} className={`min-h-10 rounded-md px-4 text-sm font-bold ${tab === value ? "bg-jet text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}>
        {t(`growth.${value}`)}{value === "active" ? ` (${growth.active.length})` : ""}
      </button>)}
    </div>
    {error && <p role="alert" className="border-l-4 border-coral bg-white p-3 text-sm text-coral">{t(`growth.error.${error}`)}</p>}
    {tab === "offers" && <section className="space-y-3">
      <p className="text-xs text-slate-500">{t("growth.refresh")}: {formatGameDate(refreshTime)}</p>
      {!growth.offers.length && <p className="py-6 text-sm text-slate-600">{t("growth.noOffers")}</p>}
      <div className="grid gap-3 xl:grid-cols-3">{growth.offers.map((offer) => {
        const consumed = growth.consumedOfferIds.includes(offer.id);
        const eligibility = contractEligibility(game, offer);
        return <ContractCard key={offer.id} contract={offer} game={game}>
          <button type="button" disabled={consumed || Boolean(eligibility)} title={consumed ? t("growth.consumed") : eligibility ? t(`growth.error.${eligibility}`) : undefined}
            onClick={() => { const result = accept(offer.id); setError(result.error ?? null); if (result.ok) setTab("active"); }}
            className="mt-4 flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-jet px-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45">
            <Check size={16} />{consumed ? t("growth.consumed") : t("growth.accept")}
          </button>
          {!consumed && eligibility && <p className="mt-2 text-xs text-slate-500">{t(`growth.error.${eligibility}`)}</p>}
        </ContractCard>;
      })}</div>
    </section>}
    {tab === "active" && <section className="space-y-4">
      {!growth.active.length && <p className="py-6 text-sm text-slate-600">{t("growth.noActive")}</p>}
      <div className="grid gap-3 xl:grid-cols-2">{growth.active.map((contract) => <ContractCard key={contract.id} contract={contract} game={game} active>
        <button type="button" onClick={() => setAbandonId(contract.id)} className="mt-4 flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-bold text-coral hover:bg-red-50">
          <X size={16} />{t("growth.abandon")}
        </button>
      </ContractCard>)}</div>
      <h3 className="border-t border-slate-200 pt-4 font-bold text-ink">{t("growth.history")}</h3>
      <div className="divide-y divide-slate-200">{[...growth.history].reverse().map((contract) => <div key={contract.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
        <div><span className="font-bold">{t(`growth.${contract.kind}`)}</span><span className="ml-2 text-slate-500">{contract.targets.map((target) => airportsById[target.destinationId]?.iata).join(" / ")}</span>
          <p className="text-xs text-slate-500">{formatGameDate(contract.endedGameTimeMs)}</p></div>
        <div className={contract.outcome === "completed" ? "text-mint" : "text-slate-500"}>{t(`growth.${contract.outcome}`)}
          {contract.outcome === "completed" && <p className="text-xs font-bold">+{contract.points} DP · {formatGBP.format(contract.cashReward)}</p>}</div>
      </div>)}</div>
    </section>}
    {tab === "company" && <CompanyGrowthDetails growth={growth} />}
    <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
      {(["map", "routes", "schedule", "market"] as const).map((destination) => <button key={destination} type="button" onClick={() => onNavigate(destination)}
        className="flex min-h-10 items-center gap-2 rounded-md bg-white px-3 text-sm font-bold text-jet hover:bg-slate-100"><ArrowRight size={16} />{t(`growth.${destination}`)}</button>)}
    </div>
    {abandonId && <dialog ref={abandonDialog} onCancel={() => setAbandonId(null)} aria-labelledby="abandon-title"
      className="fixed left-1/2 top-1/2 m-0 max-h-[90vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-white p-5 shadow-soft backdrop:bg-ink/45">
        <h3 id="abandon-title" className="text-lg font-bold text-ink">{t("growth.confirmAbandon")}</h3>
        <p className="mt-3 text-sm text-slate-600">{t("growth.abandonWarning")}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button autoFocus type="button" onClick={() => setAbandonId(null)} className="flex min-h-10 items-center gap-2 rounded-md bg-slate-100 px-3 text-sm font-bold"><Check size={16} />{t("growth.keep")}</button>
          <button type="button" onClick={() => { abandon(abandonId); setAbandonId(null); }} className="flex min-h-10 items-center gap-2 rounded-md bg-coral px-3 text-sm font-bold text-white"><X size={16} />{t("growth.abandon")}</button>
        </div>
    </dialog>}
  </div>;
}

export function CompanyGrowthSummary({ game, onOpen }: { game: GameState; onOpen?: () => void }) {
  const { t } = useTranslation();
  const growth = normalizeCompanyGrowth(game.companyGrowth, game);
  const level = companyLevel(growth), points = totalDevelopmentPoints(growth), next = COMPANY_LEVELS[level + 1];
  const threshold = COMPANY_LEVELS[level].threshold;
  return <section className="border-y border-slate-200 py-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><Trophy className="shrink-0 text-coral" size={24} /><div>
        <h3 className="font-bold text-ink">{t(`growth.${COMPANY_LEVELS[level].id}`)}</h3>
        <p className="text-sm text-slate-600">{t("growth.points")}: <strong>{points.toLocaleString()}</strong> DP <span className="text-xs">({t("growth.permanent")})</span></p>
      </div></div>
      <span className="text-sm font-bold text-jet">{next ? `${t("growth.next")}: ${(next.threshold - points).toLocaleString()} DP` : t("growth.maxLevel")}</span>
      {onOpen && <button type="button" onClick={onOpen} className="flex min-h-10 items-center gap-2 rounded-md bg-white px-3 text-sm font-bold text-jet"><Target size={17} />{t("growth.view")}</button>}
    </div>
    <progress aria-label={t("growth.next")} max={next ? next.threshold - threshold : 1} value={next ? points - threshold : 1} className="mt-3 block h-2 w-full accent-teal-700" />
  </section>;
}
function ContractCard({ contract, game, active = false, children }: { contract: CompanyContract; game: GameState; active?: boolean; children: React.ReactNode }) {
  const { t } = useTranslation();
  const Icon = icons[contract.kind];
  return <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
    <h3 className="flex items-center gap-2 text-base font-bold text-ink"><Icon className="shrink-0 text-jet" size={20} />{t(`growth.${contract.kind}`)}</h3>
    <div className="mt-3 space-y-3">{contract.targets.map((target) => <div key={target.destinationId}>
      <div className="flex flex-wrap justify-between gap-2 text-sm font-bold"><span>{airportsById[target.originId]?.iata} → {airportsById[target.destinationId]?.iata}</span>
        <span>{active ? `${contract.kind === "cargo" ? target.progress.toFixed(1) : target.progress} / ` : ""}{target.required} {contract.kind === "cargo" ? "t" : t(contract.kind === "network" ? "growth.arrivals" : "growth.flights")}</span></div>
      <p className="text-xs text-slate-500">{airportsById[target.destinationId]?.city}{target.needsNewRoute ? ` · ${t("growth.newRoute")}` : ""}</p>
      {active && <progress aria-label={`${airportsById[target.destinationId]?.iata} ${t("growth.active")}`} max={target.required} value={target.progress} className="mt-1 block h-2 w-full accent-teal-700" />}
    </div>)}</div>
    <dl className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-xs text-slate-600">
      <Row label={t("growth.days")} value={String(contract.durationDays)} />
      {active && <><Row label={t("growth.deadline")} value={formatGameDate(contract.deadlineGameTimeMs!)} />
        <Row label={t("growth.remaining")} value={Math.max(0, (contract.deadlineGameTimeMs! - game.currentGameTimeMs) / DAY_MS).toFixed(1)} /></>}
      <Row label={t("growth.reward")} value={`+${contract.points} DP · ${formatGBP.format(contract.cashReward)}`} />
      <Row label={t("growth.quote")} value={formatGBP.format(contract.quotedCost)} />
    </dl>
    {children}
  </article>;
}
function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex flex-wrap justify-between gap-x-3 gap-y-1"><dt>{label}</dt><dd className="font-bold text-ink">{value}</dd></div>;
}
function CompanyGrowthDetails({ growth }: { growth: CompanyGrowth }) {
  const { t } = useTranslation();
  const level = companyLevel(growth);
  return <div className="space-y-5">
    <dl className="grid gap-3 sm:grid-cols-3">{(["contracts", "milestones", "legacy"] as const).map((source) => <div key={source} className="border-l-2 border-mint pl-3 text-sm">
      <dt className="text-slate-500">{t(`growth.${source}Source`)}</dt><dd className="font-bold">{growth.points[source].toLocaleString()} DP</dd>
    </div>)}</dl>
    <dl className="flex flex-wrap gap-x-6 gap-y-2 border-y border-slate-200 py-3 text-sm">
      {(["commuter", "cargo", "network"] as const).map((kind, index) => <div key={kind} className="flex gap-2">
        <dt className="text-slate-500">{t(`growth.${kind}`)}</dt><dd className="font-bold">+{[100, 150, 200][index]} DP</dd>
      </div>)}
    </dl>
    <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="border-b border-slate-200 text-xs text-slate-500"><tr>
      <th className="py-2 pr-3">{t("growth.level")}</th><th className="py-2 pr-3">{t("growth.threshold")}</th><th className="py-2 pr-3">{t("growth.contractRange")}</th><th className="py-2">{t("growth.unlocks")}</th>
    </tr></thead><tbody>{COMPANY_LEVELS.map((value, index) => <tr key={value.id} className={`border-b border-slate-100 ${index === level ? "bg-teal-50" : ""}`}>
      <td className="py-3 pr-3 font-bold">{t(`growth.${value.id}`)}{index <= level && <CheckCircle2 className="ml-2 inline text-mint" size={14} />}</td>
      <td className="pr-3">{value.threshold.toLocaleString()} DP</td><td className="pr-3">{Number.isFinite(value.maxDistanceKm) ? `${value.maxDistanceKm.toLocaleString()} km` : t("growth.unlimited")}</td>
      <td>{[t("growth.commuter"), index >= 1 ? t("growth.cargo") : "", index >= 2 ? t("growth.network") : ""].filter(Boolean).join(" / ")}</td>
    </tr>)}</tbody></table></div>
    <h3 className="flex items-center gap-2 font-bold text-ink"><Flag size={18} className="text-coral" />{t("growth.milestones")}</h3>
    <div className="divide-y divide-slate-200">{MILESTONES.map((milestone) => <div key={milestone.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
      <div><h4 className="font-bold">{t(`growth.${milestone.id}`)}</h4><p className="text-xs text-slate-500">{Math.min(milestone.required, growth.progress[milestone.metric]).toLocaleString()} / {milestone.required}</p></div>
      <div className="text-right"><p className="font-bold">+{milestone.points} DP · {formatGBP.format(milestone.cash)}</p>
        <p className={`text-xs ${growth.milestones[milestone.id] ? "text-mint" : "text-slate-500"}`}>{t(growth.milestones[milestone.id] === "legacy" ? "growth.legacy" : growth.milestones[milestone.id] ? "growth.earned" : "growth.pending")}</p></div>
    </div>)}</div>
  </div>;
}
