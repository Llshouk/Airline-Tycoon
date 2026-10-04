"use client";

import { useTranslation } from "@/i18n";
import { formatCompanyAge, formatCompanyFoundedAt } from "@/lib/time";
import type { GameState } from "@/types/game";

export function CompanyAge({ game }: { game: Pick<GameState, "baseGameTimeMs" | "currentGameTimeMs"> }) {
  const { language, t } = useTranslation();
  return (
    <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
      <div className="flex flex-wrap gap-x-2">
        <dt>{t("company.age")}</dt>
        <dd className="font-semibold text-ink">{formatCompanyAge(game, language)}</dd>
      </div>
      <div className="flex flex-wrap gap-x-2">
        <dt>{t("company.founded")}</dt>
        <dd>{formatCompanyFoundedAt(game.baseGameTimeMs, language)}</dd>
      </div>
    </dl>
  );
}
