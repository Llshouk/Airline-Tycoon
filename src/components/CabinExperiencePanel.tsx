"use client";

import { PassengerSatisfaction } from "@/components/PassengerSatisfaction";
import { useTranslation } from "@/i18n";
import { CABIN_CLASSES } from "@/lib/cabin";
import { cabinComfort, configuredSection } from "@/lib/cabinConfiguration";
import { passengerExperienceSummary } from "@/lib/passengerExperience";
import type { AircraftInstance, AircraftModel } from "@/types/game";

export function CabinExperiencePanel({ aircraft, model, now, durationHours = 2 }: {
  aircraft: AircraftInstance; model: AircraftModel; now: number; durationHours?: number;
}) {
  const { t } = useTranslation();
  return (
    <section className="mb-4">
      <PassengerSatisfaction fleet={[aircraft]} now={now} />
      {!aircraft.cabinConfiguration ? <p className="mt-2 text-xs font-semibold text-slate-500">{t("cabin.legacy")}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {CABIN_CLASSES.filter((cabin) => aircraft.cabinLayout[cabin] > 0).map((cabin) => {
          const config = aircraft.cabinConfiguration;
          const product = config ? configuredSection(model, config, cabin).product : undefined;
          const rating = passengerExperienceSummary([aircraft], now, cabin);
          const label = t(cabin === "first" ? "fleet.firstClass" : `fleet.${cabin}`);
          return <div key={cabin} className="min-w-0 border-b border-slate-100 py-3 text-sm">
            <h4 className="font-black text-ink">{label}: {aircraft.cabinLayout[cabin]}</h4>
            {config && product ? <dl className="mt-2 grid grid-cols-2 gap-2">
              <Value label={t("cabin.grade")} value={product.grade[0].toUpperCase() + product.grade.slice(1)} />
              <Value label={t("cabin.arrangement")} value={product.arrangement} />
              <Value label={t("cabin.pitch")} value={`${config.sections[cabin].pitchInches} in.`} />
              <Value label={t("cabin.width")} value={`${product.widthInches} in.`} />
              <Value label={t("cabin.comfort")} value={`${cabinComfort(model, config, cabin, durationHours)} / 100`} />
            </dl> : null}
            <p className="mt-2 text-xs text-slate-500">{t("cabin.satisfaction")}: {rating.score === null ? t("cabin.noReviews") : `${rating.score} / 100 (${rating.passengers})`}</p>
          </div>;
        })}
      </div>
    </section>
  );
}

function Value({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="break-words text-xs text-slate-500">{label}</dt><dd className="font-semibold text-ink">{value}</dd></div>;
}
