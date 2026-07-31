"use client";

import { useTranslation } from "@/i18n";
import { formatGBP, formatGBPDecimal, percent } from "@/lib/format";
import type { RouteEconomicsResult, RouteSuitability } from "@/lib/economics/economicsTypes";

type WeeklyEconomics = {
  flights: number;
  revenue: number;
  cost: number;
  profit: number;
};

export function OperatingEconomicsPanel({
  economics,
  weekly,
  contextLabel,
  compact = false
}: {
  economics: RouteEconomicsResult;
  weekly?: WeeklyEconomics;
  contextLabel?: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const breakEven = economics.estimatedBreakEvenLoadFactor === undefined
    ? t("economics.unavailable")
    : economics.breakEvenAchievable
      ? percent(economics.estimatedBreakEvenLoadFactor)
      : t("economics.aboveFullLoad");

  return (
    <section className="mt-3 min-w-0 border-y border-slate-200 bg-runway/70 px-3 py-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-black text-ink">{t("economics.title")}</p>
          <p className="text-xs font-semibold text-slate-500">
            {contextLabel ? `${contextLabel} - ` : ""}{t("economics.estimatedValue")}
          </p>
        </div>
        <span className={suitabilityClass(economics.routeSuitability)}>
          {suitabilityLabel(economics.routeSuitability, t)}
        </span>
      </div>

      <div className={`mt-3 grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4"}`}>
        <Metric label={`${t("economics.estimatedRevenue")} / ${t("economics.perFlight")}`} value={formatGBP.format(economics.estimatedRevenuePerFlight)} />
        <Metric label={`${t("economics.totalOperatingCost")} / ${t("economics.perFlight")}`} value={formatGBP.format(economics.estimatedTotalCostPerFlight)} />
        <Metric label={`${t("economics.operatingProfit")} / ${t("economics.perFlight")}`} value={formatGBP.format(economics.estimatedOperatingProfitPerFlight)} tone={economics.estimatedOperatingProfitPerFlight < 0 ? "danger" : "success"} />
        <Metric label={t("economics.operatingMargin")} value={percent(economics.estimatedOperatingMargin)} tone={economics.estimatedOperatingMargin < 0 ? "danger" : "default"} />
        {compact ? null : (
          <>
            <Metric label={t("economics.breakEvenLoadFactor")} value={breakEven} tone={!economics.breakEvenAchievable ? "danger" : "default"} />
            <Metric label={t("economics.capacityUtilization")} value={percent(economics.capacityUtilization)} />
            <Metric label={t("economics.costPerKm")} value={formatGBPDecimal.format(economics.estimatedCostPerKm)} />
            <Metric label={t("economics.costPerSeatKm")} value={economics.estimatedCostPerSeatKm === undefined ? t("economics.unavailable") : formatGBPDecimal.format(economics.estimatedCostPerSeatKm)} />
          </>
        )}
      </div>

      {compact ? null : (
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-200 pt-3 md:grid-cols-4">
          <CostLine label={t("economics.fuelCost")} value={economics.estimatedFuelCostPerFlight} />
          <CostLine label={t("economics.crewCost")} value={economics.estimatedCrewCostPerFlight} />
          <CostLine label={t("economics.airportFees")} value={economics.estimatedAirportCostPerFlight} />
          <CostLine label={t("economics.maintenanceReserve")} value={economics.estimatedMaintenanceReservePerFlight} />
        </div>
      )}

      {weekly ? (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 md:grid-cols-4">
          <Metric label={t("economics.weeklyFlights")} value={String(weekly.flights)} />
          <Metric label={`${t("economics.estimatedRevenue")} / ${t("economics.perWeek")}`} value={formatGBP.format(weekly.revenue)} />
          <Metric label={`${t("economics.totalOperatingCost")} / ${t("economics.perWeek")}`} value={formatGBP.format(weekly.cost)} />
          <Metric label={`${t("economics.operatingProfit")} / ${t("economics.perWeek")}`} value={formatGBP.format(weekly.profit)} tone={weekly.profit < 0 ? "danger" : "success"} />
        </div>
      ) : null}
    </section>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "success" | "danger" }) {
  const valueClass = tone === "success" ? "text-mint" : tone === "danger" ? "text-coral" : "text-ink";
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={`break-words font-black tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}

function CostLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 text-xs">
      <span className="block break-words font-semibold text-slate-500">{label}</span>
      <span className="mt-1 block whitespace-nowrap font-black tabular-nums text-ink">{formatGBP.format(value)}</span>
    </div>
  );
}

function suitabilityClass(suitability: RouteSuitability) {
  const color = suitability === "strong"
    ? "bg-mint/15 text-mint"
    : suitability === "marginal"
      ? "bg-amber-100 text-amber-700"
      : "bg-coral/10 text-coral";
  return `rounded-md px-2 py-1 text-xs font-black ${color}`;
}

function suitabilityLabel(suitability: RouteSuitability, t: ReturnType<typeof useTranslation>["t"]) {
  if (suitability === "strong") return t("economics.profitableRoute");
  if (suitability === "marginal") return t("economics.marginalRoute");
  if (suitability === "loss-making") return t("economics.lossMakingRoute");
  return t("economics.ineligibleRoute");
}
