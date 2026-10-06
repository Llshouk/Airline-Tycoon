"use client";

import { Armchair, Check, RotateCcw, Save, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AircraftImage } from "@/components/AircraftImage";
import { seatProducts } from "@/config/cabinProducts";
import { useTranslation } from "@/i18n";
import { CABIN_CLASSES, totalPassengerSeats } from "@/lib/cabin";
import { cabinComfort, cabinFareMultiplier, configuredCabinLayout, configuredCargoLimit, configuredSection,
  defaultCabinConfiguration, normalizeCabinConfiguration, setCabinSpace, setSeatProduct, validateCabinConfiguration } from "@/lib/cabinConfiguration";
import { formatGBP } from "@/lib/format";
import { estimateExpectedFlightProfit } from "@/lib/economy";
import { useGameStore } from "@/store/gameStore";
import type { CabinConfiguration, SeatGrade } from "@/types/cabin";
import type { AircraftModel, CabinClass, Route } from "@/types/game";

export function SeatConfigurationModal({ model, configuration, registration, route, onRegistrationChange, onCancel, onConfirm }: {
  model: AircraftModel;
  configuration: CabinConfiguration;
  registration: string;
  route?: Route | null;
  onRegistrationChange: (registration: string) => void;
  onCancel: () => void;
  onConfirm: (configuration: CabinConfiguration) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(() => structuredClone(configuration));
  const [registrationDraft, setRegistrationDraft] = useState(registration);
  const [templateId, setTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateNotice, setTemplateNotice] = useState<"saved" | "error" | null>(null);
  const templates = useGameStore((state) => state.game?.cabinTemplates);
  const saveTemplate = useGameStore((state) => state.saveCabinTemplate);
  const deleteTemplate = useGameStore((state) => state.deleteCabinTemplate);
  const difficulty = useGameStore((state) => state.game?.difficultyConfig);
  const panel = useRef<HTMLElement>(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  const validation = validateCabinConfiguration(model, draft);
  const layout = useMemo(() => configuredCabinLayout(model, draft), [model, draft]);
  const financials = useMemo(() => route ? estimateExpectedFlightProfit(route, model,
    { cabinLayout: layout, cabinConfiguration: draft }, difficulty) : null, [route, model, layout, draft, difficulty]);
  const duration = route ? route.distanceKm / model.cruiseSpeedKmh : 2;
  const classLabel = (cabin: CabinClass) => t(cabin === "first" ? "fleet.firstClass" : `fleet.${cabin}`);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("button")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); cancelRef.current(); }
      if (event.key !== "Tab") return;
      const elements = [...(panel.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled)") ?? [])];
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKey); previousFocus?.focus(); };
  }, []);

  function apply() {
    if (!validation.isValid) return;
    onRegistrationChange(registrationDraft);
    onConfirm(structuredClone(draft));
  }

  return (
    <div className="fixed inset-0 z-[6500] flex items-center justify-center bg-ink/50 p-3 sm:p-5">
      <section ref={panel} role="dialog" aria-modal="true" aria-labelledby="seat-configuration-title"
        className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-soft">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <h3 id="seat-configuration-title" className="text-lg font-black text-ink">{t("cabin.title")}</h3>
          <div className="flex gap-2">
            <button type="button" onClick={apply} disabled={!validation.isValid} aria-label={t("cabin.apply")} title={t("cabin.apply")} className="rounded-md p-2 text-mint hover:bg-runway disabled:opacity-30"><Check size={22} /></button>
            <button type="button" onClick={onCancel} aria-label={t("cabin.close")} title={t("cabin.close")} className="rounded-md p-2 text-slate-500 hover:bg-runway"><X size={22} /></button>
          </div>
        </header>
        <div className="p-4 sm:p-5">
          <div className="grid items-center gap-4 border-b border-slate-200 pb-4 sm:grid-cols-[180px_1fr]">
            <AircraftImage model={model} className="h-24 bg-white" />
            <div className="grid grid-cols-2 gap-3">
              <Metric label={model.manufacturer} value={model.model} />
              <Metric label={t("cabin.seats")} value={`${totalPassengerSeats(layout)} / ${model.maxPassengerSeats}`} />
              <label className="min-w-0 text-sm font-bold text-slate-600">{t("fleet.registration")}
                <input value={registrationDraft} onChange={(event) => setRegistrationDraft(event.target.value.toUpperCase())} maxLength={12}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-ink" />
              </label>
              <Metric label={t("cabin.purchase")} value={formatGBP.format(validation.purchasePriceGBP)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 py-4">
            <button type="button" onClick={() => setDraft(defaultCabinConfiguration(model))} className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-bold text-jet"><RotateCcw size={16} />{t("cabin.reset")}</button>
            <button type="button" onClick={() => setDraft(defaultCabinConfiguration(model, true))} className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-bold text-jet"><SlidersHorizontal size={16} />{t("cabin.maximize")}</button>
          </div>
          <div className="flex h-14 overflow-hidden rounded-md border border-slate-300 bg-slate-50" aria-label={t("cabin.space")}>
            {CABIN_CLASSES.filter((cabin) => draft.sections[cabin].spacePercent > 0).map((cabin, index) => (
              <div key={cabin} style={{ width: `${draft.sections[cabin].spacePercent}%` }} title={`${classLabel(cabin)}: ${layout[cabin]}`}
                className={`flex min-w-0 items-center justify-center overflow-hidden border-r border-white px-1 text-xs font-bold ${["bg-coral/20 text-ink", "bg-jet/20 text-ink", "bg-amber-100 text-ink", "bg-mint/20 text-ink"][index]}`}>
                <span className="truncate">{({ first: "F", business: "C", premiumEconomy: "W", economy: "Y" })[cabin]} {layout[cabin]}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {CABIN_CLASSES.map((cabin) => {
              const section = draft.sections[cabin];
              const { product, rows, seats } = configuredSection(model, draft, cabin);
              const products = seatProducts(model, cabin);
              const changePitch = (pitchInches: number) => setDraft(normalizeCabinConfiguration(model, { ...draft,
                sections: { ...draft.sections, [cabin]: { ...section, pitchInches } } }));
              return (
                <article key={cabin} className="min-w-0 rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="font-black text-ink">{classLabel(cabin)}</h4>
                    <span className="text-sm font-bold text-jet">{seats} {t("cabin.seats")}</span>
                  </div>
                  {!product ? <p className="mt-3 text-sm text-slate-500">{t("cabin.unavailable")}</p> : (
                    <>
                      <label className="mt-3 block text-sm font-bold text-slate-600">{t("cabin.grade")}
                        <select aria-label={`${classLabel(cabin)} ${t("cabin.grade")}`} value={section.grade} onChange={(event) => setDraft(setSeatProduct(model, draft, cabin, event.target.value as SeatGrade))}
                          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-ink">
                          {products.map((item) => <option key={item.grade} value={item.grade}>{item.grade[0].toUpperCase() + item.grade.slice(1)} / {item.arrangement}</option>)}
                        </select>
                      </label>
                      <label className="mt-3 block text-sm font-bold text-slate-600">
                        <span className="flex justify-between gap-2"><span>{t("cabin.space")}</span><span>{section.spacePercent.toFixed(1)}%</span></span>
                        <input aria-label={`${classLabel(cabin)} ${t("cabin.space")}`} type="range" min={0} max={100} step={1} value={section.spacePercent}
                          onChange={(event) => setDraft(setCabinSpace(model, draft, cabin, Number(event.target.value)))} className="mt-2 w-full accent-jet" />
                      </label>
                      <div className="mt-3">
                        <label className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-slate-600">
                          <span>{t("cabin.pitch")} ({product.minPitch}-{product.maxPitch} in.)</span>
                          <PitchInput label={`${classLabel(cabin)} ${t("cabin.pitch")}`} min={product.minPitch} max={product.maxPitch} value={section.pitchInches} onChange={changePitch} />
                        </label>
                        <input aria-label={`${classLabel(cabin)} ${t("cabin.pitch")} slider`} type="range" min={product.minPitch} max={product.maxPitch} step={1} value={section.pitchInches}
                          onChange={(event) => changePitch(Number(event.target.value))} className="mt-2 w-full accent-jet" />
                      </div>
                      <div className="my-3 flex justify-center gap-5 border-y border-slate-100 py-3" aria-label={`${classLabel(cabin)} ${product.arrangement}`}>
                        {product.arrangement.split("-").map((group, groupIndex) => <div key={groupIndex} className="flex gap-1">{Array.from({ length: Number(group) }, (_, index) =>
                          <Armchair key={index} size={20} className="shrink-0 text-jet" />)}</div>)}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <Metric label={t("cabin.width")} value={`${product.widthInches} in.`} />
                        <Metric label={t("cabin.rows")} value={String(rows)} />
                        <Metric label={t("cabin.comfort")} value={`${cabinComfort(model, draft, cabin, duration)} / 100`} />
                      </div>
                      {route && seats > 0 ? <div className="mt-3 border-t border-slate-100 pt-2"><Metric label={t("cabin.referenceFare")}
                        value={formatGBP.format((route.recommendedPricing?.[cabin] ?? route.estimatedTicketPrices[cabin]) * cabinFareMultiplier(model, draft, cabin, duration))} /></div> : null}
                    </>
                  )}
                </article>
              );
            })}
          </div>
          <div className="mt-4 grid gap-4 border-y border-slate-200 py-4 sm:grid-cols-2">
            <label className="text-sm font-bold text-slate-600">{t("fleet.cargo")} (0-{configuredCargoLimit(model, draft).toFixed(1)} t)
              <input type="number" min={0} max={configuredCargoLimit(model, draft)} step={0.1} value={draft.cargoTons}
                onChange={(event) => setDraft(normalizeCabinConfiguration(model, { ...draft, cargoTons: Number(event.target.value) }))}
                className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-2 text-ink" />
            </label>
            <div>
              <label className="block text-sm font-bold text-slate-600">{t("cabin.template")}
                <select aria-label={t("cabin.template")} value={templateId} onChange={(event) => {
                  const id = event.target.value;
                  setTemplateId(id);
                  const template = templates?.find((item) => item.id === id && item.modelId === model.id);
                  if (template) { setDraft(structuredClone(template.configuration)); setTemplateName(template.name); setTemplateNotice(null); }
                }} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-ink">
                  <option value="">{t("cabin.templateNone")}</option>
                  {templates?.filter((item) => item.modelId === model.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <div className="mt-2 flex gap-2">
                <input aria-label={t("cabin.templateName")} placeholder={t("cabin.templateName")} value={templateName} maxLength={32}
                  onChange={(event) => setTemplateName(event.target.value)} className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-2 text-sm" />
                <button type="button" title={t("cabin.templateSave")} aria-label={t("cabin.templateSave")} disabled={!templateName.trim() || !validation.isValid}
                  onClick={() => setTemplateNotice(saveTemplate(model.id, templateName, draft) ? "saved" : "error")}
                  className="rounded-md border border-slate-300 p-2 text-jet disabled:opacity-30"><Save size={18} /></button>
                <button type="button" title={t("cabin.templateDelete")} aria-label={t("cabin.templateDelete")} disabled={!templateId}
                  onClick={() => { deleteTemplate(templateId); setTemplateId(""); setTemplateNotice(null); }} className="rounded-md border border-slate-300 p-2 text-coral disabled:opacity-30"><Trash2 size={18} /></button>
              </div>
              {templateNotice ? <p role="status" className="mt-2 text-sm text-jet">{t(templateNotice === "saved" ? "cabin.templateSaved" : "cabin.templateError")}</p> : null}
            </div>
          </div>
          {!validation.isValid ? <p role="alert" className="mt-3 text-sm font-bold text-coral">{t("cabin.invalid")}</p> : null}
          <footer className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Metric label={t("cabin.purchase")} value={formatGBP.format(validation.purchasePriceGBP)} />
              {financials ? <Metric label={t("cabin.estimated")} value={formatGBP.format(financials.profit)} /> : null}
            </div>
            <button type="button" onClick={apply} disabled={!validation.isValid} className="flex items-center gap-2 rounded-md bg-jet px-4 py-2 font-bold text-white disabled:opacity-30"><Check size={18} />{t("cabin.apply")}</button>
          </footer>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="break-words text-xs font-semibold text-slate-500">{label}</p><p className="break-words text-sm font-black text-ink">{value}</p></div>;
}

function PitchInput({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value, min, max]);
  return <input aria-label={label} type="number" min={min} max={max} step={1} value={text}
    onChange={(event) => {
      setText(event.target.value);
      const next = Number(event.target.value);
      if (event.target.value && Number.isInteger(next) && next >= min && next <= max) onChange(next);
    }}
    onBlur={() => { const next = Math.max(min, Math.min(max, Math.round(Number(text)) || min)); setText(String(next)); onChange(next); }}
    className="w-20 rounded-md border border-slate-300 px-2 py-1 text-ink" />;
}
