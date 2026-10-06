import { aircraftById } from "@/data/aircraft";
import { validateCabinConfiguration } from "@/lib/cabinConfiguration";
import type { CabinTemplate } from "@/types/cabin";

export const MAX_CABIN_TEMPLATES = 12;
export function normalizeCabinTemplates(raw: CabinTemplate[] | undefined): CabinTemplate[] {
  const seen = new Set<string>();
  return (Array.isArray(raw) ? raw : []).filter((item) => {
    const model = item && aircraftById[item.modelId];
    if (!model || typeof item.id !== "string" || typeof item.name !== "string" || !item.name.trim() ||
      item.name.length > 32 || seen.has(item.id) || !item.configuration || !validateCabinConfiguration(model, item.configuration).isValid) return false;
    seen.add(item.id);
    return true;
  }).slice(0, MAX_CABIN_TEMPLATES).map((item) => ({ ...item, name: item.name.trim() }));
}
