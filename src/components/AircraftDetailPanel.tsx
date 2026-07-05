"use client";

import { Pencil, X } from "lucide-react";
import { useState } from "react";
import { AircraftWeeklyTimetableGrid } from "@/components/AircraftWeeklyTimetableGrid";
import { AircraftSideImage } from "@/components/AircraftSideImage";
import { aircraftById } from "@/data/aircraft";
import { airportsById } from "@/data/airports";
import { useTranslation } from "@/i18n";
import { formatGBP } from "@/lib/format";
import { useGameStore } from "@/store/gameStore";
import type { AircraftInstance, FlightStatus, GameState } from "@/types/game";

export function AircraftDetailPanel({
  aircraft,
  game,
  onClose
}: {
  aircraft: AircraftInstance;
  game: GameState;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const updateAircraftRegistration = useGameStore((state) => state.updateAircraftRegistration);
  const [isEditingRegistration, setIsEditingRegistration] = useState(false);
  const [registrationDraft, setRegistrationDraft] = useState(aircraft.registration);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const model = aircraftById[aircraft.modelId];
  const homeBase = airportsById[aircraft.homeBaseAirportId];
  const currentLocation = aircraftCurrentLocationLabel(aircraft);
  const totalProfit = game.flightLog
    .filter((entry) => entry.aircraftId === aircraft.id)
    .reduce((sum, entry) => sum + entry.profit, 0);

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-ink/35 p-4">
      <section className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-lg border border-slate-200 bg-white shadow-soft">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-coral">{t("detail.title")}</p>
            <h3 className="text-xl font-black text-ink">{aircraft.registration}</h3>
            <p className="text-sm font-semibold text-slate-500">
              {model.manufacturer} {model.model}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="flex h-9 w-9 items-center justify-center rounded-md bg-runway text-jet transition hover:bg-slate-200"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-4">
            <AircraftSideImage
              src={model.sideImageUrl}
              alt={model.sideImageAlt}
              size="large"
              imageScale={model.imageScale}
              imageOffsetX={model.imageOffsetX}
              imageOffsetY={model.imageOffsetY}
            />
            <div className="rounded-md border border-slate-200 p-3">
              <p className="mb-2 text-sm font-black text-ink">{t("fleet.registration")}</p>
              {isEditingRegistration ? (
                <div className="space-y-2">
                  <input
                    value={registrationDraft}
                    onChange={(event) => setRegistrationDraft(event.target.value.toUpperCase())}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 font-black text-ink outline-none focus:border-jet focus:ring-2 focus:ring-jet/20"
                  />
                  {registrationError ? <p className="text-xs font-bold text-coral">{registrationError}</p> : null}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const result = updateAircraftRegistration(aircraft.id, registrationDraft);
                        if (!result.ok) {
                          setRegistrationError(result.message);
                          return;
                        }
                        setIsEditingRegistration(false);
                        setRegistrationError(null);
                      }}
                      className="rounded-md bg-coral px-3 py-2 text-sm font-bold text-white hover:bg-coral/90"
                    >
                      {t("fleet.saveRegistration")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRegistrationDraft(aircraft.registration);
                        setIsEditingRegistration(false);
                        setRegistrationError(null);
                      }}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setRegistrationDraft(aircraft.registration);
                    setRegistrationError(null);
                    setIsEditingRegistration(true);
                  }}
                  className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
                >
                  <Pencil size={14} />
                  {t("fleet.editRegistration")}
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Info label="Model" value={`${model.manufacturer} ${model.model}`} />
              <Info label={t("fleet.homeBase")} value={homeBase?.iata ?? aircraft.homeBaseAirportId} />
              <Info label={t("fleet.currentAirport")} value={currentLocation} />
              <Info label={t("detail.status")} value={statusLabel(aircraft.status, t)} />
              <Info label={t("detail.totalFlights")} value={String(aircraft.totalFlights)} />
              <Info label={t("detail.totalRevenue")} value={formatGBP.format(aircraft.totalRevenue)} />
              <Info label={t("detail.totalProfit")} value={formatGBP.format(totalProfit)} />
              <Info label="Cargo" value={`${aircraft.cargoTransportedTons.toFixed(1)} t`} />
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="mb-2 text-sm font-black text-ink">{t("detail.cabin")}</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Info label={t("fleet.firstClass")} value={String(aircraft.cabinLayout.first)} />
                <Info label={t("fleet.business")} value={String(aircraft.cabinLayout.business)} />
                <Info label={t("fleet.premiumEconomy")} value={String(aircraft.cabinLayout.premiumEconomy)} />
                <Info label={t("fleet.economy")} value={String(aircraft.cabinLayout.economy)} />
                <Info label={t("fleet.cargo")} value={`${aircraft.cabinLayout.cargoTons} t`} />
              </div>
            </div>
          </aside>

          <div>
            <h4 className="mb-3 font-black text-ink">{t("detail.weeklyTimetable")}</h4>
            {aircraft.schedule.length > 0 ? (
              <AircraftWeeklyTimetableGrid aircraft={aircraft} routes={game.routes} compact />
            ) : (
              <p className="rounded-md border border-dashed border-slate-300 bg-runway px-3 py-6 text-center text-sm text-slate-500">
                {t("detail.noSchedule")}
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function aircraftCurrentLocationLabel(aircraft: AircraftInstance) {
  const activeFlight = aircraft.schedule.find((item) => item.status === "in-flight");
  if (activeFlight) {
    const origin = airportsById[activeFlight.originAirportId];
    const destination = airportsById[activeFlight.destinationAirportId];
    return `In flight: ${origin?.iata ?? activeFlight.originAirportId} - ${destination?.iata ?? activeFlight.destinationAirportId}`;
  }
  const airport = airportsById[aircraft.currentAirportId];
  return airport?.iata ?? aircraft.currentAirportId;
}

function statusLabel(status: FlightStatus | AircraftInstance["status"] | "conflict", t: ReturnType<typeof useTranslation>["t"]) {
  if (status === "in-flight") return t("status.in-flight");
  if (status === "completed") return t("status.completed");
  if (status === "conflict") return t("status.conflict");
  return t("status.scheduled");
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-runway px-3 py-2">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="truncate font-bold text-ink">{value}</p>
    </div>
  );
}
