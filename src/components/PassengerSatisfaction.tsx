"use client";

import { Smile } from "lucide-react";
import { useTranslation } from "@/i18n";
import { passengerExperienceSummary } from "@/lib/passengerExperience";
import type { AircraftInstance } from "@/types/game";

export function PassengerSatisfaction({ fleet, now, company = false }: {
  fleet: Pick<AircraftInstance, "passengerExperience">[]; now: number; company?: boolean;
}) {
  const { t } = useTranslation();
  const summary = passengerExperienceSummary(fleet, now);
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 border-y border-slate-200 py-3">
      <div className="flex min-w-0 items-center gap-2"><Smile size={20} className="shrink-0 text-mint" />
        <div><h3 className="text-sm font-black text-ink">{t(company ? "cabin.companySatisfaction" : "cabin.satisfaction")}</h3>
          <p className="text-xs text-slate-500">{t("cabin.recent")}</p></div>
      </div>
      <div className="text-sm font-bold text-jet">
        {summary.score === null ? t("cabin.noReviews") : `${summary.score} / 100`}
        {summary.passengers > 0 ? <p className="text-xs font-semibold text-slate-500">{t("cabin.reviews")}: {summary.passengers.toLocaleString()}</p> : null}
      </div>
    </section>
  );
}
