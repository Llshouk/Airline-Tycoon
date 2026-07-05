"use client";

import { CalendarPlus, Pencil, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AircraftDetailPanel } from "@/components/AircraftDetailPanel";
import { AircraftImage } from "@/components/AircraftImage";
import { AircraftWeeklyTimetableGrid } from "@/components/AircraftWeeklyTimetableGrid";
import { aircraftById } from "@/data/aircraft";
import { airportsById } from "@/data/airports";
import { useTranslation } from "@/i18n";
import { estimateScheduleFinancials, estimateWeeklyScheduleFinancials } from "@/lib/economy";
import { formatGBP, formatNumber } from "@/lib/format";
import {
  findDuplicateFlightNumber,
  formatRouteCode,
  formatScheduleFlightNumbers,
  generateDefaultFlightNumber,
  hasScheduleConflict,
  minutesToTime,
  nextFlightNumber,
  normalizeScheduleTime,
  previewBlocksForWeeklySchedule,
  validateWeeklySchedule,
  weekDays,
  weeklyEventBlocksFromSchedule
} from "@/lib/schedule";
import { calculateRemainingDemandForSchedulePreview, type ScheduleDemandPreview } from "@/lib/routeDemand";
import { formatDuration } from "@/lib/time";
import { useGameStore } from "@/store/gameStore";
import type { AircraftInstance, DayOfWeek, Route, WeeklySchedule } from "@/types/game";

export function ScheduleScreen() {
  const { t } = useTranslation();
  const game = useGameStore((state) => state.game);
  const createWeeklySchedule = useGameStore((state) => state.createWeeklySchedule);
  const deleteWeeklySchedule = useGameStore((state) => state.deleteWeeklySchedule);
  const [selectedScheduleBaseId, setSelectedScheduleBaseId] = useState("");
  const [aircraftId, setAircraftId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [outboundFlightNumber, setOutboundFlightNumber] = useState("AL101");
  const [returnFlightNumber, setReturnFlightNumber] = useState("AL102");
  const [departureTimeLocal, setDepartureTimeLocal] = useState("08:00");
  const [hasUserEditedDepartureTime, setHasUserEditedDepartureTime] = useState(false);
  const [isRoundTrip, setIsRoundTrip] = useState(true);
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([]);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [detailAircraftId, setDetailAircraftId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const baseAirportIds = game?.baseAirports ?? (game ? [game.primaryBaseAirport ?? game.baseAirportId] : []);
  const selectedScheduleBase =
    selectedScheduleBaseId && baseAirportIds.includes(selectedScheduleBaseId)
      ? selectedScheduleBaseId
      : game?.primaryBaseAirport ?? baseAirportIds[0] ?? "";
  const visibleRoutes = useMemo(
    () => (game ? game.routes.filter((route) => route.originAirportId === selectedScheduleBase) : []),
    [game, selectedScheduleBase]
  );
  const selectedRoute = visibleRoutes.find((route) => route.id === routeId) ?? null;
  const visibleAircraft = useMemo(
    () =>
      game && selectedRoute
        ? game.fleet.filter(
            (aircraft) =>
              canAircraftOperateRoute({
                aircraft,
                route: selectedRoute,
                selectedBase: selectedScheduleBase,
                routes: game.routes,
                isRoundTrip,
                editingScheduleId
              }).canOperate
          )
        : [],
    [editingScheduleId, game, isRoundTrip, selectedRoute, selectedScheduleBase]
  );
  const selectedAircraft = visibleAircraft.find((aircraft) => aircraft.id === aircraftId) ?? visibleAircraft[0];
  const model = selectedAircraft ? aircraftById[selectedAircraft.modelId] : null;
  const recommendedDepartureTime = useMemo(
    () =>
      getRecommendedDepartureTime({
        selectedAircraft: selectedAircraft ?? null,
        selectedRoute: selectedRoute ?? null,
        routes: game?.routes ?? [],
        selectedDays,
        isRoundTrip,
        editingScheduleId
      }),
    [editingScheduleId, game?.routes, isRoundTrip, selectedAircraft, selectedDays, selectedRoute]
  );

  useEffect(() => {
    if (!game) return;
    const bases = game.baseAirports ?? [game.primaryBaseAirport ?? game.baseAirportId];
    const nextBase = selectedScheduleBaseId && bases.includes(selectedScheduleBaseId) ? selectedScheduleBaseId : game.primaryBaseAirport ?? bases[0] ?? "";
    if (nextBase !== selectedScheduleBaseId) setSelectedScheduleBaseId(nextBase);
  }, [game, selectedScheduleBaseId]);

  useEffect(() => {
    if (!selectedRoute) {
      if (aircraftId) setAircraftId("");
      return;
    }
    if (selectedAircraft && selectedAircraft.id !== aircraftId) setAircraftId(selectedAircraft.id);
    if (!selectedAircraft && aircraftId) setAircraftId("");
  }, [aircraftId, selectedAircraft, selectedRoute]);

  useEffect(() => {
    if (routeId && !selectedRoute) setRouteId("");
  }, [routeId, selectedRoute]);

  useEffect(() => {
    if (editingScheduleId || hasUserEditedDepartureTime) return;
    setDepartureTimeLocal(recommendedDepartureTime);
  }, [editingScheduleId, hasUserEditedDepartureTime, recommendedDepartureTime]);

  useEffect(() => {
    if (!game || !selectedAircraft || editingScheduleId) return;
    const allSchedules = game.fleet.flatMap((aircraft) => aircraft.weeklySchedules);
    const index = allSchedules.length;
    const outbound = generateDefaultFlightNumber(game.airlineName, index);
    const inbound = nextFlightNumber(outbound);
    setOutboundFlightNumber(outbound);
    setReturnFlightNumber(inbound);
  }, [editingScheduleId, game?.airlineName, selectedAircraft?.id]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const projection = useMemo(() => {
    if (!selectedRoute || !model || !selectedAircraft || !game) return null;
    const oneWayMs = (selectedRoute.distanceKm / model.cruiseSpeedKmh) * 60 * 60 * 1000;
    const turnaroundMs = model.turnaroundMinutes * 60 * 1000;
    const estimate = estimateScheduleFinancials({
      route: selectedRoute,
      model,
      aircraft: selectedAircraft,
      daysOfWeek: selectedDays,
      isRoundTrip,
      difficultyConfig: game.difficultyConfig
    });
    return {
      oneWayMs,
      blockMs: isRoundTrip ? oneWayMs * 2 + turnaroundMs * 2 : oneWayMs + turnaroundMs,
      estimate
    };
  }, [game, isRoundTrip, model, selectedAircraft, selectedDays, selectedRoute]);

  const preview = useMemo(() => {
    if (!game || !selectedAircraft || !selectedRoute) return { blocks: [], conflict: false, error: null as string | null };
    const baselineAircraft = {
      ...selectedAircraft,
      schedule: selectedAircraft.schedule.filter((item) => item.weeklyScheduleId !== editingScheduleId)
    };
    const existingBlocks = weeklyEventBlocksFromSchedule(baselineAircraft, game.routes);
    const duplicateFlightNumber = findDuplicateFlightNumber({
      outboundFlightNumber,
      returnFlightNumber,
      isRoundTrip,
      schedules: game.fleet.flatMap((aircraft) => aircraft.weeklySchedules),
      currentScheduleId: editingScheduleId ?? undefined
    });
    const error = duplicateFlightNumber
      ? "Flight number already exists. Please use a unique flight number."
      : validateWeeklySchedule({
      aircraft: selectedAircraft,
      route: selectedRoute,
      daysOfWeek: selectedDays,
      departureTimeLocal,
      outboundFlightNumber,
      returnFlightNumber,
      isRoundTrip,
      existingSchedules: baselineAircraft.schedule
    });
    const tentative = previewBlocksForWeeklySchedule({
      aircraft: selectedAircraft,
      route: selectedRoute,
      daysOfWeek: selectedDays,
      departureTimeLocal,
      isRoundTrip,
      outboundFlightNumber: outboundFlightNumber.trim().toUpperCase(),
      returnFlightNumber: returnFlightNumber.trim().toUpperCase(),
      conflict: false
    });
    const conflict = hasScheduleConflict(existingBlocks, tentative);
    const blocks = previewBlocksForWeeklySchedule({
      aircraft: selectedAircraft,
      route: selectedRoute,
      daysOfWeek: selectedDays,
      departureTimeLocal,
      isRoundTrip,
      outboundFlightNumber: outboundFlightNumber.trim().toUpperCase(),
      returnFlightNumber: returnFlightNumber.trim().toUpperCase(),
      conflict
    });
    return { blocks, conflict, error: error ?? (conflict ? "Schedule conflict: preview overlaps existing aircraft timetable." : null) };
  }, [departureTimeLocal, editingScheduleId, game, isRoundTrip, outboundFlightNumber, returnFlightNumber, selectedAircraft, selectedDays, selectedRoute, t]);

  const demandPreview = useMemo(() => {
    if (!game || !selectedAircraft || !selectedRoute) return null;
    return calculateRemainingDemandForSchedulePreview(
      selectedRoute.id,
      game,
      selectedAircraft.cabinLayout,
      selectedDays.length,
      isRoundTrip,
      editingScheduleId ?? undefined
    );
  }, [editingScheduleId, game, isRoundTrip, selectedAircraft, selectedDays.length, selectedRoute]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    if (!game) return;
    if (!selectedAircraft) {
      showScheduleFailure("Select an aircraft.");
      return;
    }
    if (!selectedRoute) {
      showScheduleFailure("Select a route.");
      return;
    }
    if (!selectedScheduleBase) {
      showScheduleFailure("No base airport available.");
      return;
    }
    if (selectedRoute.originAirportId !== selectedScheduleBase) {
      showScheduleFailure("Schedule save failed: this route does not belong to the selected base.");
      return;
    }
    if (selectedAircraft.homeBaseAirportId !== selectedScheduleBase) {
      showScheduleFailure("Schedule save failed: this aircraft is not based at the selected airport.");
      return;
    }
    const suitability = canAircraftOperateRoute({
      aircraft: selectedAircraft,
      route: selectedRoute,
      selectedBase: selectedScheduleBase,
      routes: game.routes,
      isRoundTrip,
      editingScheduleId
    });
    if (!suitability.canOperate) {
      if (suitability.reasons.includes("range")) {
        showScheduleFailure("Schedule save failed: aircraft range is too short.");
      } else if (suitability.reasons.includes("availability")) {
        showScheduleFailure("Schedule save failed: aircraft has no available timetable slot.");
      } else {
        showScheduleFailure("Schedule save failed: this aircraft cannot operate the selected route.");
      }
      return;
    }
    if (preview.error) {
      showScheduleFailure(preview.error);
      return;
    }
    const normalizedDepartureTime = normalizeScheduleTime(departureTimeLocal);
    const result = createWeeklySchedule({
      aircraftId: selectedAircraft.id,
      routeId: selectedRoute.id,
      outboundFlightNumber: outboundFlightNumber.trim().toUpperCase(),
      returnFlightNumber: isRoundTrip ? returnFlightNumber.trim().toUpperCase() : undefined,
      daysOfWeek: selectedDays,
      departureTimeLocal: normalizedDepartureTime,
      isRoundTrip,
      scheduleBaseAirportId: selectedScheduleBase,
      replaceWeeklyScheduleId: editingScheduleId ?? undefined
    });
    if (!result.ok) {
      showScheduleFailure(result.message);
      return;
    }
    setToast({ type: "success", message: t("schedule.saveSuccess") });
    setAircraftId(selectedAircraft.id);
    setRouteId(selectedRoute.id);
    setEditingScheduleId(null);
    setHasUserEditedDepartureTime(false);
    setSelectedDays([]);
  }

  function showScheduleFailure(message: string) {
    const localized = localizeScheduleError(message, t);
    setLocalError(localized);
    setToast({ type: "error", message: `${t("schedule.saveFailed")}\n${localized}` });
  }

  function toggleDay(day: DayOfWeek) {
    setSelectedDays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort((a, b) => a - b)
    );
  }

  function editSchedule(aircraftIdValue: string, schedule: WeeklySchedule) {
    setLocalError(null);
    setEditingScheduleId(schedule.id);
    const route = game?.routes.find((item) => item.id === schedule.routeId);
    if (route) setSelectedScheduleBaseId(route.originAirportId);
    setAircraftId(aircraftIdValue);
    setRouteId(schedule.routeId);
    setOutboundFlightNumber(schedule.outboundFlightNumber);
    setReturnFlightNumber(schedule.returnFlightNumber ?? nextFlightNumber(schedule.outboundFlightNumber));
    setDepartureTimeLocal(schedule.departureTimeLocal);
    setHasUserEditedDepartureTime(true);
    setIsRoundTrip(schedule.isRoundTrip);
    setSelectedDays(schedule.daysOfWeek);
  }

  if (!game) return null;
  const detailAircraft = detailAircraftId ? game.fleet.find((aircraft) => aircraft.id === detailAircraftId) : null;
  const gridAircraft =
    selectedAircraft && editingScheduleId
      ? {
          ...selectedAircraft,
          schedule: selectedAircraft.schedule.filter((item) => item.weeklyScheduleId !== editingScheduleId)
        }
      : selectedAircraft;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-black text-ink">{t("schedule.title")}</h2>
        <p className="text-slate-600">Build recurring services by day of week, departure time, flight number, and route pattern.</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
        <label className="block max-w-sm">
          <span className="text-sm font-semibold text-slate-700">{t("schedule.scheduleBase")}</span>
          <select
            value={selectedScheduleBase}
            onChange={(event) => {
              setSelectedScheduleBaseId(event.target.value);
              setAircraftId("");
              setRouteId("");
              setEditingScheduleId(null);
              setHasUserEditedDepartureTime(false);
            }}
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-3 font-bold text-jet outline-none transition focus:border-jet focus:ring-2 focus:ring-jet/20"
          >
            {baseAirportIds.length === 0 ? <option value="">{t("schedule.noBaseAvailable")}</option> : null}
            {baseAirportIds.map((airportId) => {
              const airport = airportsById[airportId];
              return airport ? (
                <option key={airportId} value={airportId}>
                  {airport.iata} {airport.city}
                </option>
              ) : null;
            })}
          </select>
        </label>
        {baseAirportIds.length === 0 ? <p className="mt-3 rounded-md bg-runway px-3 py-3 text-sm font-semibold text-slate-500">{t("schedule.noBaseAvailable")}</p> : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <form onSubmit={onSubmit} className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <div className="flex items-center gap-2">
            <CalendarPlus size={20} className="text-coral" />
            <h3 className="font-bold text-ink">{editingScheduleId ? "Edit timetable" : t("schedule.create")}</h3>
          </div>
          <label className="mt-4 block">
            <span className="text-sm font-semibold text-slate-700">{t("schedule.route")}</span>
            <select
              value={selectedRoute?.id ?? ""}
              onChange={(event) => {
                setRouteId(event.target.value);
                setAircraftId("");
                setEditingScheduleId(null);
                setHasUserEditedDepartureTime(false);
              }}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-3 outline-none transition focus:border-jet focus:ring-2 focus:ring-jet/20"
            >
              <option value="">{visibleRoutes.length === 0 ? "No routes from this base" : "Select a route"}</option>
              {visibleRoutes.map((route) => (
                <option key={route.id} value={route.id}>
                  {airportsById[route.originAirportId].iata} - {airportsById[route.destinationAirportId].iata}
                </option>
              ))}
            </select>
          </label>
          {selectedRoute ? (
            <label className="mt-4 block">
              <span className="text-sm font-semibold text-slate-700">{t("schedule.aircraft")}</span>
              <select
                value={selectedAircraft?.id ?? ""}
                onChange={(event) => {
                  setAircraftId(event.target.value);
                  setEditingScheduleId(null);
                  setHasUserEditedDepartureTime(false);
                }}
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-3 outline-none transition focus:border-jet focus:ring-2 focus:ring-jet/20"
              >
                {visibleAircraft.length === 0 ? <option value="">{t("schedule.noSuitableAircraft")}</option> : null}
                {visibleAircraft.map((aircraft) => {
                  const aircraftModel = aircraftById[aircraft.modelId];
                  const airport = airportsById[aircraft.currentAirportId];
                  return (
                    <option key={aircraft.id} value={aircraft.id}>
                      {aircraft.registration} - {aircraftModel.model} at {airport.iata}
                    </option>
                  );
                })}
              </select>
              {visibleAircraft.length === 0 ? <p className="mt-2 rounded-md bg-runway px-3 py-2 text-sm font-semibold text-slate-500">{t("schedule.noSuitableAircraft")}</p> : null}
            </label>
          ) : (
            <p className="mt-4 rounded-md bg-runway px-3 py-3 text-sm font-semibold text-slate-500">Select a route before choosing aircraft.</p>
          )}
          <label className="mt-4 block">
            <span className="text-sm font-semibold text-slate-700">Flight Number</span>
            <input
              value={outboundFlightNumber}
              onChange={(event) => setOutboundFlightNumber(event.target.value.toUpperCase())}
              maxLength={8}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-3 outline-none transition focus:border-jet focus:ring-2 focus:ring-jet/20"
              placeholder="KA101"
            />
          </label>
          {isRoundTrip ? (
            <label className="mt-4 block">
              <span className="text-sm font-semibold text-slate-700">Return Flight Number</span>
              <input
                value={returnFlightNumber}
                onChange={(event) => setReturnFlightNumber(event.target.value.toUpperCase())}
                maxLength={8}
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-3 outline-none transition focus:border-jet focus:ring-2 focus:ring-jet/20"
                placeholder={nextFlightNumber(outboundFlightNumber)}
              />
            </label>
          ) : null}
          <label className="mt-4 block">
            <span className="text-sm font-semibold text-slate-700">{t("schedule.departureTime")}</span>
            <input
              type="time"
              step={300}
              value={departureTimeLocal}
              onChange={(event) => {
                setDepartureTimeLocal(event.target.value);
                setHasUserEditedDepartureTime(true);
              }}
              onBlur={(event) => setDepartureTimeLocal(normalizeScheduleTime(event.target.value))}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-3 outline-none transition focus:border-jet focus:ring-2 focus:ring-jet/20"
            />
            <span className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-500">{t("schedule.recommendedTimeHint")}</span>
              <button
                type="button"
                onClick={() => {
                  setDepartureTimeLocal(recommendedDepartureTime);
                  setHasUserEditedDepartureTime(false);
                }}
                className="rounded-md bg-runway px-2 py-1 text-xs font-black text-jet hover:bg-slate-100"
              >
                {t("schedule.useRecommendedTime")} ({recommendedDepartureTime})
              </button>
            </span>
          </label>
          <div className="mt-4">
            <span className="text-sm font-semibold text-slate-700">{t("schedule.operatingDays")}</span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {weekDays.map((day) => (
                <button
                  key={day.id}
                  type="button"
                  onClick={() => toggleDay(day.id)}
                  className={`rounded-md px-3 py-2 text-sm font-bold transition ${
                    selectedDays.includes(day.id) ? "bg-jet text-white" : "bg-runway text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {day.short}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 rounded-md bg-runway p-2">
            <button
              type="button"
              onClick={() => {
                setIsRoundTrip(false);
                if (!hasUserEditedDepartureTime) setDepartureTimeLocal(recommendedDepartureTime);
              }}
              className={`rounded-md px-3 py-2 text-sm font-bold transition ${!isRoundTrip ? "bg-mint text-white" : "bg-white text-slate-600"}`}
            >
              {t("schedule.oneWay")}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsRoundTrip(true);
                if (!hasUserEditedDepartureTime) setDepartureTimeLocal(recommendedDepartureTime);
              }}
              className={`rounded-md px-3 py-2 text-sm font-bold transition ${isRoundTrip ? "bg-mint text-white" : "bg-white text-slate-600"}`}
            >
              {t("schedule.roundTrip")}
            </button>
          </div>
          {projection && selectedRoute ? (
            <ScheduleFinancialSummary
              routeLabel={`${airportsById[selectedRoute.originAirportId].iata} - ${airportsById[selectedRoute.destinationAirportId].iata}`}
              aircraftLabel={selectedAircraft?.registration ?? "-"}
              flightLabel={formatScheduleFlightNumbers({ outboundFlightNumber, returnFlightNumber: isRoundTrip ? returnFlightNumber : undefined })}
              daysLabel={selectedDays.map((day) => weekDays.find((item) => item.id === day)?.short).join(", ") || "-"}
              tripType={isRoundTrip ? "Round-trip" : "One-way"}
              distance={`${formatNumber.format(selectedRoute.distanceKm)} km`}
              blockTime={formatDuration(projection.blockMs)}
              estimate={projection.estimate}
            />
          ) : null}
          {demandPreview ? <RemainingDemandPreview summary={demandPreview} /> : null}
          {localError ? (
            <p className="mt-4 whitespace-pre-line rounded-md bg-coral/10 px-3 py-2 text-sm font-bold text-coral">{localError}</p>
          ) : null}
          <button
            type="submit"
            disabled={false}
            className="mt-4 w-full rounded-md bg-coral px-4 py-3 font-bold text-white transition hover:bg-coral/90 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {t("schedule.save")}
          </button>
        </form>

        <div className="space-y-4">
          <div className="space-y-4 xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto xl:pr-1">
            {selectedAircraft ? (
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button type="button" onClick={() => setDetailAircraftId(selectedAircraft.id)} className="flex min-w-0 items-center gap-3 text-left">
                    {model ? <AircraftImage model={model} className="h-14 w-24 shrink-0" /> : null}
                    <span>
                      <span className="block font-black text-ink">{selectedAircraft.registration}</span>
                      <span className="block text-sm text-slate-500">
                        {model?.manufacturer} {model?.model}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailAircraftId(selectedAircraft.id)}
                    className="rounded-md bg-runway px-3 py-2 text-sm font-bold text-jet hover:bg-slate-100"
                  >
                    View aircraft timetable
                  </button>
                </div>
              </div>
            ) : null}
            <AircraftWeeklyTimetableGrid aircraft={gridAircraft} routes={game.routes} previewBlocks={preview.blocks} />
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
            <h3 className="font-black text-ink">Saved services</h3>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {!selectedAircraft || selectedAircraft.weeklySchedules.length === 0 ? (
                <p className="rounded-md bg-runway px-3 py-4 text-sm text-slate-500">{t("schedule.noFlightsForAircraft")}</p>
              ) : (
                selectedAircraft.weeklySchedules.map((service) => {
                  const route = game.routes.find((item) => item.id === service.routeId);
                  const serviceModel = aircraftById[selectedAircraft.modelId];
                  if (!route || !serviceModel) return null;
                  const estimate = estimateWeeklyScheduleFinancials(service, route, serviceModel, selectedAircraft, game.difficultyConfig);
                  return (
                    <div key={service.id} className="rounded-md border border-slate-200 p-3">
                      <p className="font-bold text-ink">
                        <span className="block truncate whitespace-nowrap tabular-nums">
                          {formatScheduleFlightNumbers(service)} {formatRouteCode(route)}
                        </span>
                      </p>
                      <p className="text-sm text-slate-500">
                        {service.daysOfWeek.map((day) => weekDays.find((item) => item.id === day)?.short).join(", ")} at {service.departureTimeLocal}
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <Info label="Weekly revenue" value={formatGBP.format(estimate.weeklyRevenue)} />
                        <Info label="Weekly profit" value={formatGBP.format(estimate.weeklyProfit)} />
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => editSchedule(selectedAircraft.id, service)}
                          className="flex items-center gap-1 rounded-md bg-runway px-2 py-1 text-xs font-bold text-jet transition hover:bg-slate-100"
                        >
                          <Pencil size={13} />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteWeeklySchedule(selectedAircraft.id, service.id)}
                          className="flex items-center gap-1 rounded-md bg-coral/10 px-2 py-1 text-xs font-bold text-coral transition hover:bg-coral/20"
                        >
                          <Trash2 size={13} />
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </section>
      {toast ? <ScheduleToast type={toast.type} message={toast.message} onClose={() => setToast(null)} /> : null}
      {detailAircraft ? <AircraftDetailPanel aircraft={detailAircraft} game={game} onClose={() => setDetailAircraftId(null)} /> : null}
    </div>
  );
}

function getRecommendedDepartureTime({
  selectedAircraft,
  selectedRoute,
  routes,
  selectedDays,
  isRoundTrip,
  editingScheduleId
}: {
  selectedAircraft: AircraftInstance | null;
  selectedRoute: Route | null;
  routes: Route[];
  selectedDays: DayOfWeek[];
  isRoundTrip: boolean;
  editingScheduleId: string | null;
}) {
  if (!selectedAircraft || !selectedRoute) return "08:00";

  const baselineAircraft: AircraftInstance = {
    ...selectedAircraft,
    schedule: selectedAircraft.schedule.filter((item) => item.weeklyScheduleId !== editingScheduleId)
  };
  const existingBlocks = weeklyEventBlocksFromSchedule(baselineAircraft, routes);
  const daysToCheck = selectedDays.length > 0 ? selectedDays : [0 as DayOfWeek];
  const candidates = recommendedDepartureCandidates(existingBlocks.map((block) => block.endMinute));

  for (const candidate of candidates) {
    const preview = previewBlocksForWeeklySchedule({
      aircraft: selectedAircraft,
      route: selectedRoute,
      daysOfWeek: daysToCheck,
      departureTimeLocal: candidate,
      isRoundTrip,
      outboundFlightNumber: "REC101",
      returnFlightNumber: "REC102",
      conflict: false
    });
    if (!hasScheduleConflict(existingBlocks, preview)) return candidate;
  }

  return "08:00";
}

function canAircraftOperateRoute({
  aircraft,
  route,
  selectedBase,
  routes,
  isRoundTrip,
  editingScheduleId
}: {
  aircraft: AircraftInstance;
  route: Route;
  selectedBase: string;
  routes: Route[];
  isRoundTrip: boolean;
  editingScheduleId: string | null;
}) {
  const reasons: string[] = [];
  const model = aircraftById[aircraft.modelId];
  if (aircraft.homeBaseAirportId !== selectedBase) reasons.push("base");
  if (!model || model.rangeKm < route.distanceKm) reasons.push("range");
  if (reasons.length === 0 && !hasAnyTimetableSlot({ aircraft, route, routes, isRoundTrip, editingScheduleId })) reasons.push("availability");
  return { canOperate: reasons.length === 0, reasons };
}

function hasAnyTimetableSlot({
  aircraft,
  route,
  routes,
  isRoundTrip,
  editingScheduleId
}: {
  aircraft: AircraftInstance;
  route: Route;
  routes: Route[];
  isRoundTrip: boolean;
  editingScheduleId: string | null;
}) {
  const baselineAircraft: AircraftInstance = {
    ...aircraft,
    schedule: aircraft.schedule.filter((item) => item.weeklyScheduleId !== editingScheduleId)
  };
  const existingBlocks = weeklyEventBlocksFromSchedule(baselineAircraft, routes);
  const candidates = recommendedDepartureCandidates(existingBlocks.map((block) => block.endMinute));

  for (const day of weekDays) {
    for (const candidate of candidates) {
      const preview = previewBlocksForWeeklySchedule({
        aircraft,
        route,
        daysOfWeek: [day.id],
        departureTimeLocal: candidate,
        isRoundTrip,
        outboundFlightNumber: "CHK101",
        returnFlightNumber: "CHK102",
        conflict: false
      });
      if (!hasScheduleConflict(existingBlocks, preview)) return true;
    }
  }

  return false;
}

function recommendedDepartureCandidates(existingEndMinutes: number[]) {
  const preferred = ["08:00", "09:00", "10:00", "07:00", "11:00", "12:00"];
  const afterExisting = existingEndMinutes.map((minute) => minutesToTime(roundUpToFiveMinutes(minute)));
  const fullDay = Array.from({ length: 24 * 12 }, (_, index) => minutesToTime(index * 5));
  return Array.from(new Set([...preferred, ...afterExisting, ...fullDay])).map(normalizeScheduleTime);
}

function roundUpToFiveMinutes(minute: number) {
  return Math.ceil(minute / 5) * 5;
}

function ScheduleToast({ type, message, onClose }: { type: "success" | "error"; message: string; onClose: () => void }) {
  return (
    <div className="fixed bottom-5 right-5 z-[6500] max-w-sm rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-soft animate-slide-in">
      <div className="flex items-start justify-between gap-3">
        <p className={`whitespace-pre-line font-black ${type === "success" ? "text-mint" : "text-coral"}`}>{message}</p>
        <button type="button" onClick={onClose} className="rounded px-2 py-1 text-xs font-black text-slate-500 hover:bg-runway">
          x
        </button>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-runway px-3 py-2">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="font-bold text-ink">{value}</p>
    </div>
  );
}

function ScheduleFinancialSummary({
  routeLabel,
  aircraftLabel,
  flightLabel,
  daysLabel,
  tripType,
  distance,
  blockTime,
  estimate
}: {
  routeLabel: string;
  aircraftLabel: string;
  flightLabel: string;
  daysLabel: string;
  tripType: string;
  distance: string;
  blockTime: string;
  estimate: ReturnType<typeof estimateScheduleFinancials>;
}) {
  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-runway p-3 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <Info label="Route" value={routeLabel} />
        <Info label="Aircraft" value={aircraftLabel} />
        <Info label="Flight number" value={flightLabel} />
        <Info label="Days" value={daysLabel} />
        <Info label="Pattern" value={tripType} />
        <Info label="Distance" value={distance} />
        <Info label="Block time" value={blockTime} />
        <Info label="Weekly flights" value={String(estimate.weeklyFlights)} />
        <Info label="Passengers/flight" value={String(estimate.perFlight.passengerCount)} />
        <Info label="Cargo/flight" value={`${estimate.perFlight.cargoTons.toFixed(1)} t`} />
        <Info label="Revenue/flight" value={formatGBP.format(estimate.perFlight.revenue)} />
        <Info label="Cost/flight" value={formatGBP.format(estimate.perFlight.cost)} />
        <Info label="Profit/flight" value={formatGBP.format(estimate.perFlight.profit)} />
        <Info label="Weekly revenue" value={formatGBP.format(estimate.weeklyRevenue)} />
        <Info label="Weekly cost" value={formatGBP.format(estimate.weeklyCost)} />
        <Info label="Weekly profit" value={formatGBP.format(estimate.weeklyProfit)} />
      </div>
    </div>
  );
}

function RemainingDemandPreview({ summary }: { summary: ScheduleDemandPreview }) {
  const rows = [
    { label: "First", key: "first", suffix: "" },
    { label: "Business", key: "business", suffix: "" },
    { label: "Premium", key: "premiumEconomy", suffix: "" },
    { label: "Economy", key: "economy", suffix: "" },
    { label: "Cargo", key: "cargoTons", suffix: " t" }
  ] as const;

  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-white p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-black text-ink">Remaining Weekly Demand</p>
        <p className="text-xs font-semibold text-slate-500">Updates from the selected route and draft timetable</p>
      </div>
      <div className="mt-3 overflow-hidden rounded-md border border-slate-100">
        <div className="grid grid-cols-[1fr_repeat(4,78px)] gap-2 bg-slate-50 px-3 py-2 text-xs font-black uppercase tracking-normal text-slate-500">
          <span>Cabin</span>
          <span>Total</span>
          <span>Used</span>
          <span>Preview</span>
          <span>After</span>
        </div>
        {rows.map((row) => {
          const remaining = summary.remainingAfterPreview[row.key];
          const oversupply = summary.oversupplyAfterPreview[row.key];
          return (
            <div key={row.key} className="grid grid-cols-[1fr_repeat(4,78px)] gap-2 border-t border-slate-100 px-3 py-2 text-xs">
              <span className="font-bold text-ink">{row.label}</span>
              <span>{formatScheduleDemand(summary.totalDemand[row.key], row.suffix)}</span>
              <span>{formatScheduleDemand(summary.usedDemand[row.key], row.suffix)}</span>
              <span>{formatScheduleDemand(summary.previewDemand[row.key], row.suffix)}</span>
              <span className={oversupply > 0 ? "font-black text-coral" : "font-black text-mint"}>
                {oversupply > 0 ? `+${formatScheduleDemand(oversupply, row.suffix)} over` : formatScheduleDemand(remaining, row.suffix)}
              </span>
            </div>
          );
        })}
      </div>
      {summary.warnings.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {summary.warnings.map((warning) => (
            <span key={warning} className="rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">
              {warning}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatScheduleDemand(value: number, suffix: string) {
  return suffix ? `${value.toFixed(1)}${suffix}` : formatNumber.format(Math.round(value));
}

function localizeScheduleError(message: string, t: ReturnType<typeof useTranslation>["t"]) {
  if (message === "Flight number already exists. Please use a unique flight number.") {
    return t("schedule.flightNumberDuplicateFull");
  }
  if (message === "Departure minutes must be in 5-minute intervals.") {
    return t("schedule.departureMinuteInterval");
  }
  if (message === "Select at least one operating day.") {
    return t("schedule.selectOperatingDay");
  }
  if (message === "Schedule save failed: this route does not belong to the selected base.") {
    return t("schedule.routeWrongBase");
  }
  if (message === "Schedule save failed: this aircraft is not based at the selected airport.") {
    return t("schedule.aircraftWrongBase");
  }
  if (message === "Schedule save failed: this aircraft cannot operate the selected route.") {
    return t("schedule.aircraftCannotOperateRoute");
  }
  if (message === "Schedule save failed: aircraft range is too short.") {
    return t("schedule.aircraftRangeTooShort");
  }
  if (message === "Schedule save failed: aircraft has no available timetable slot.") {
    return t("schedule.aircraftNoAvailableSlot");
  }
  if (message === "No base airport available.") {
    return t("schedule.noBaseAvailable");
  }
  return message;
}
