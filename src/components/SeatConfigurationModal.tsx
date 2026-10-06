"use client";

import { Check, ChevronDown, Minus, Plus, RotateCcw, Save, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AircraftImage } from "@/components/AircraftImage";
import { CABIN_COLORS, CabinLayoutDesigner, SeatRowPreview } from "@/components/CabinLayoutDesigner";
import { SeatProductImage } from "@/components/SeatProductImage";
import { seatProducts } from "@/config/cabinProducts";
import { useTranslation } from "@/i18n";
import { totalPassengerSeats } from "@/lib/cabin";
import { cabinComfort, cabinFareMultiplier, configuredCabinLayout, configuredCargoLimit, configuredSection,
  defaultCabinConfiguration, normalizeCabinConfiguration, setCabinSpace, setSeatProduct, validateCabinConfiguration } from "@/lib/cabinConfiguration";
import { formatGBP } from "@/lib/format";
import { estimateExpectedFlightProfit } from "@/lib/economy";
import { useGameStore } from "@/store/gameStore";
import type { CabinConfiguration, SeatGrade } from "@/types/cabin";
import type { AircraftModel, CabinClass, Route } from "@/types/game";

export function SeatConfigurationModal({ model, configuration, registration, route, onRegistrationChange, onCancel, onConfirm }: {
  model: AircraftModel; configuration: CabinConfiguration; registration: string; route?: Route | null;
  onRegistrationChange: (registration: string) => void; onCancel: () => void;
  onConfirm: (configuration: CabinConfiguration) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(() => normalizeCabinConfiguration(model, structuredClone(configuration)));
  const [selected, setSelected] = useState<CabinClass>("economy");
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
  const label = (cabin: CabinClass) => t(cabin === "first" ? "fleet.firstClass" : `fleet.${cabin}`);
  const section = draft.sections[selected];
  const { product, rows, seats } = configuredSection(model, draft, selected);
  const products = seatProducts(model, selected);
  const color = CABIN_COLORS[selected];
  const comfort = cabinComfort(model, draft, selected, duration);
  const changePitch = (pitchInches: number) => setDraft((previous) => normalizeCabinConfiguration(model, { ...previous,
    sections: { ...previous.sections, [selected]: { ...previous.sections[selected], pitchInches } } }));
  const chooseGrade = (grade: SeatGrade) => setDraft((previous) => setSeatProduct(model, previous, selected, grade));

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("button")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); cancelRef.current(); }
      if (event.key !== "Tab") return;
      const elements = [...(panel.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [role=slider][tabindex='0']") ?? [])];
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
    <div className="fixed inset-0 z-[6500] flex items-center justify-center bg-ink/60 p-2 backdrop-blur-sm sm:p-5">
      <section ref={panel} role="dialog" aria-modal="true" aria-labelledby="seat-configuration-title"
        className="animate-modal-in flex max-h-[94dvh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-6">
          <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-normal text-slate-500">{model.manufacturer} / {model.model}</p>
            <h3 id="seat-configuration-title" className="text-lg font-black text-ink">{t("cabin.title")}</h3></div>
          <button type="button" onClick={onCancel} aria-label={t("cabin.close")} title={t("cabin.close")} className="rounded-md p-2 text-slate-500 hover:bg-runway"><X size={22} /></button>
        </header>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-5 pt-4 sm:px-6" data-testid="cabin-scroll">
          <div className="grid items-center gap-4 border-b border-slate-100 pb-4 sm:grid-cols-[180px_1fr]">
            <AircraftImage model={model} className="hidden h-24 bg-white sm:block" />
            <div className="grid grid-cols-2 items-center gap-3 sm:grid-cols-3">
              <Metric label={t("cabin.seats")} value={`${totalPassengerSeats(layout)} / ${model.maxPassengerSeats}`} />
              <Metric label={t("cabin.purchase")} value={formatGBP.format(validation.purchasePriceGBP)} />
              <label className="col-span-2 text-xs font-bold text-slate-500 sm:col-span-1">{t("fleet.registration")}
                <input aria-label={t("fleet.registration")} value={registrationDraft} onChange={(event) => setRegistrationDraft(event.target.value.toUpperCase())} maxLength={12}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm text-ink" />
              </label>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 py-3">
            <button type="button" onClick={() => setDraft(defaultCabinConfiguration(model))} title={t("cabin.reset")} aria-label={t("cabin.reset")}
              className="flex items-center gap-2 rounded-md px-2 py-2 text-xs font-bold text-jet hover:bg-runway"><RotateCcw size={16} />{t("cabin.reset")}</button>
            <button type="button" onClick={() => setDraft(defaultCabinConfiguration(model, true))} title={t("cabin.maximize")} aria-label={t("cabin.maximize")}
              className="flex items-center gap-2 rounded-md px-2 py-2 text-xs font-bold text-jet hover:bg-runway"><SlidersHorizontal size={16} />{t("cabin.maximize")}</button>
          </div>
          <CabinLayoutDesigner model={model} configuration={draft} selected={selected} onSelect={setSelected} onChange={setDraft} />
          {product ? <div id="cabin-editor-panel" role="tabpanel" aria-labelledby={`cabin-tab-${selected}`} className="border-t border-slate-200 pt-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h4 className="text-base font-black text-ink">{label(selected)}</h4>
              <span className="flex items-center gap-2 text-sm font-bold" style={{ color }}><span className="cabin-seat-count" key={seats}>{seats}</span> {t("cabin.seats")}</span>
            </div>
            <div role="radiogroup" aria-label={`${label(selected)} ${t("cabin.grade")}`} className="grid grid-cols-3 gap-2 sm:gap-4">
              {products.map((item, index) => <button key={item.grade} type="button" role="radio" aria-checked={section.grade === item.grade}
                aria-label={`${label(selected)} ${item.grade}`} tabIndex={section.grade === item.grade ? 0 : -1}
                onClick={() => chooseGrade(item.grade)}
                onKeyDown={(event) => {
                  const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
                  if (direction) { event.preventDefault(); const next = (index + direction + products.length) % products.length; chooseGrade(products[next].grade);
                    (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus(); }
                }}
                className="cabin-product group min-w-0 overflow-hidden rounded-md border-2 text-left outline-none transition hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-sky"
                style={{ borderColor: section.grade === item.grade ? color : "#e2e8f0" }}>
                <SeatProductImage cabin={selected} grade={item.grade} alt={`${label(selected)} ${item.grade}`} />
                <span className="flex items-center justify-between gap-1 px-2 pt-2 text-xs font-black capitalize text-ink sm:px-3 sm:text-sm">
                  {item.grade}{section.grade === item.grade ? <Check size={15} style={{ color }} /> : null}
                </span>
                <span className="block px-2 pb-2 pt-1 text-[11px] font-semibold text-slate-500 sm:px-3 sm:text-xs">{item.arrangement} / {item.widthInches} in.</span>
              </button>)}
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr]">
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-2"><Metric label={t("cabin.arrangement")} value={product.arrangement} /><Metric label={t("cabin.rows")} value={String(rows)} /></div>
                <SeatRowPreview arrangement={product.arrangement} cabin={selected} />
                <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-500"><span>{t("cabin.comfort")}</span><span className="text-ink">{comfort} / 100</span></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="cabin-comfort-fill h-full rounded-full" style={{ width: `${comfort}%`, backgroundColor: color }} /></div>
              </div>
              <div className="min-w-0">
                <label className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-500">
                  <span>{t("cabin.pitch")} <span className="font-normal">({product.minPitch}-{product.maxPitch} in.)</span></span>
                  <span className="flex items-center gap-1">
                    <button type="button" aria-label={t("cabin.lessPitch")} title={t("cabin.lessPitch")} disabled={section.pitchInches <= product.minPitch} onClick={() => changePitch(section.pitchInches - 1)} className="rounded-md p-1.5 text-ink hover:bg-runway disabled:opacity-30"><Minus size={16} /></button>
                    <PitchInput label={`${label(selected)} ${t("cabin.pitch")}`} min={product.minPitch} max={product.maxPitch} value={section.pitchInches} onChange={changePitch} />
                    <button type="button" aria-label={t("cabin.morePitch")} title={t("cabin.morePitch")} disabled={section.pitchInches >= product.maxPitch} onClick={() => changePitch(section.pitchInches + 1)} className="rounded-md p-1.5 text-ink hover:bg-runway disabled:opacity-30"><Plus size={16} /></button>
                  </span>
                </label>
                <input aria-label={`${label(selected)} ${t("cabin.pitch")} slider`} type="range" min={product.minPitch} max={product.maxPitch} step={1} value={section.pitchInches}
                  onChange={(event) => changePitch(Number(event.target.value))} className="my-3 w-full" style={{ accentColor: color }} />
                <label className="block text-xs font-bold text-slate-500"><span className="flex justify-between gap-2"><span>{t("cabin.space")}</span><span className="text-ink">{section.spacePercent.toFixed(1)}%</span></span>
                  <input aria-label={`${label(selected)} ${t("cabin.space")}`} type="range" min={0} max={100} step={1} value={section.spacePercent}
                    onChange={(event) => setDraft((previous) => setCabinSpace(model, previous, selected, Number(event.target.value)))} className="mt-3 w-full" style={{ accentColor: color }} />
                </label>
                {route && seats > 0 ? <div className="mt-3"><Metric label={t("cabin.referenceFare")}
                  value={formatGBP.format((route.recommendedPricing?.[selected] ?? route.estimatedTicketPrices[selected]) * cabinFareMultiplier(model, draft, selected, duration))} /></div> : null}
              </div>
            </div>
          </div> : null}
          <details className="mt-5 border-t border-slate-200 pt-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1 text-sm font-bold text-slate-600">{t("cabin.options")}<ChevronDown size={16} /></summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-500">{t("fleet.cargo")} (0-{configuredCargoLimit(model, draft).toFixed(1)} t)
                <input aria-label={t("fleet.cargo")} type="number" min={0} max={configuredCargoLimit(model, draft)} step={0.1} value={draft.cargoTons}
                  onChange={(event) => setDraft((previous) => normalizeCabinConfiguration(model, { ...previous, cargoTons: Number(event.target.value) }))}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-2 text-sm text-ink" />
              </label>
              <div>
                <label className="block text-xs font-bold text-slate-500">{t("cabin.template")}
                  <select aria-label={t("cabin.template")} value={templateId} onChange={(event) => {
                    const id = event.target.value; setTemplateId(id);
                    const template = templates?.find((item) => item.id === id && item.modelId === model.id);
                    if (template) { setDraft(normalizeCabinConfiguration(model, structuredClone(template.configuration))); setTemplateName(template.name); setTemplateNotice(null); }
                  }} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-ink">
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
          </details>
          {!validation.isValid ? <p role="alert" className="mt-3 text-sm font-bold text-coral">{t("cabin.invalid")}</p> : null}
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="min-w-0"><Metric label={t("cabin.purchase")} value={formatGBP.format(validation.purchasePriceGBP)} />
            {financials ? <p className="mt-1 hidden text-xs text-slate-500 sm:block">{t("cabin.estimated")}: {formatGBP.format(financials.profit)}</p> : null}</div>
          <button type="button" onClick={apply} disabled={!validation.isValid} className="flex shrink-0 items-center gap-2 rounded-md bg-jet px-3 py-2.5 text-sm font-bold text-white disabled:opacity-30"><Check size={18} />{t("cabin.apply")}</button>
        </footer>
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
    onChange={(event) => { setText(event.target.value); const next = Number(event.target.value);
      if (event.target.value && Number.isInteger(next) && next >= min && next <= max) onChange(next); }}
    onBlur={() => { const next = Math.max(min, Math.min(max, Math.round(Number(text)) || min)); setText(String(next)); onChange(next); }}
    className="w-16 rounded-md border border-slate-300 px-2 py-1 text-center text-sm text-ink" />;
}
