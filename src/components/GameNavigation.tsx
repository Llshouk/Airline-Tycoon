"use client";

import { BarChart3, CalendarClock, CircleDollarSign, Flag, Map, MoreHorizontal, Plane, Route, Settings, Store, Trophy, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation, type TranslationKey } from "@/i18n";

export type GameScreen = "dashboard" | "map" | "fleet" | "market" | "routes" | "schedule" | "finance" | "growth" | "leaderboard" | "settings";

export const gameNavigation: { id: GameScreen; labelKey: TranslationKey; icon: LucideIcon; accent: string }[] = [
  { id: "map", labelKey: "nav.map", icon: Map, accent: "#7dc8e5" },
  { id: "fleet", labelKey: "nav.fleet", icon: Plane, accent: "#f1d470" },
  { id: "market", labelKey: "nav.market", icon: Store, accent: "#ee9a80" },
  { id: "routes", labelKey: "nav.routes", icon: Route, accent: "#87d6b0" },
  { id: "schedule", labelKey: "nav.schedule", icon: CalendarClock, accent: "#a7c9f2" },
  { id: "finance", labelKey: "nav.finance", icon: CircleDollarSign, accent: "#87d6b0" },
  { id: "dashboard", labelKey: "nav.dashboard", icon: BarChart3, accent: "#7dc8e5" },
  { id: "growth", labelKey: "nav.growth", icon: Flag, accent: "#f1d470" },
  { id: "leaderboard", labelKey: "nav.leaderboard", icon: Trophy, accent: "#ee9a80" },
  { id: "settings", labelKey: "nav.settings", icon: Settings, accent: "#cad7da" }
];

export function GameNavigation({ screen, onNavigate }: { screen: GameScreen; onNavigate: (screen: GameScreen) => void }) {
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);
  const more = useRef<HTMLDivElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    function dismiss(event: PointerEvent) {
      if (!more.current?.contains(event.target as Node)) setMoreOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMoreOpen(false);
        moreButton.current?.focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  function navigate(next: GameScreen) {
    setMoreOpen(false);
    onNavigate(next);
  }

  return (
    <nav className="game-dock" aria-label={t("shell.navigation")}>
      <div className="game-dock-items">
        {gameNavigation.map((item, index) => {
          const Icon = item.icon;
          const label = t(item.labelKey);
          return (
            <button key={item.id} type="button" aria-label={label} aria-current={screen === item.id ? "page" : undefined}
              onClick={() => navigate(item.id)} data-screen={item.id}
              className={`game-dock-button ${index >= 5 ? "dock-secondary" : ""} ${screen === item.id ? "is-active" : ""}`}>
              <Icon size={23} style={{ color: item.accent }} aria-hidden="true" />
              <span className="game-tooltip" aria-hidden="true">{label}</span>
              <span className="dock-label" aria-hidden="true">{item.id === "market" ? t("shell.marketShort") : label}</span>
            </button>
          );
        })}
        <div ref={more} className="dock-more">
          <button ref={moreButton} type="button" aria-label={t("shell.more")} aria-expanded={moreOpen} aria-controls="game-more-navigation"
            onClick={() => setMoreOpen((open) => !open)} className={`game-dock-button ${gameNavigation.findIndex((item) => item.id === screen) >= 5 ? "is-active" : ""}`}>
            <MoreHorizontal size={24} aria-hidden="true" />
            <span className="dock-label" aria-hidden="true">{t("shell.more")}</span>
          </button>
          {moreOpen ? <div id="game-more-navigation" className="dock-more-menu" aria-label={t("shell.more")}>
            {gameNavigation.slice(5).map((item) => {
              const Icon = item.icon;
              return <button key={item.id} type="button" data-screen={item.id} aria-current={screen === item.id ? "page" : undefined} onClick={() => navigate(item.id)}>
                <Icon size={20} style={{ color: item.accent }} aria-hidden="true" /><span>{t(item.labelKey)}</span>
              </button>;
            })}
          </div> : null}
        </div>
      </div>
    </nav>
  );
}
