import { recentOperatingTotals } from "@/lib/financialReports";
import { calculateRemainingDemand } from "@/lib/routeDemand";
import { routePricingFromDefaults } from "@/lib/economy";
import type { GameState, Route } from "@/types/game";

export function routeBusiness(route: Route, game: GameState) {
  const actual = recentOperatingTotals(game.financialHistory, game.currentGameTimeMs, "routes")[route.id];
  const market = calculateRemainingDemand(route.id, game)!;
  const passengers = market.totalDemand.first + market.totalDemand.business + market.totalDemand.premiumEconomy + market.totalDemand.economy;
  const seats = market.usedDemand.first + market.usedDemand.business + market.usedDemand.premiumEconomy + market.usedDemand.economy;
  const pricing = route.pricing ?? routePricingFromDefaults(route);
  const reference = route.recommendedPricing ?? routePricingFromDefaults(route);
  const loadFactor = actual?.passengerCapacity ? (actual.passengers ?? 0) / actual.passengerCapacity : null;
  const cargoLoadFactor = actual?.cargoCapacity ? (actual.cargoTons ?? 0) / actual.cargoCapacity : null;
  const status: "unserved" | "oversupply" | "undersupply" | "balanced" = !seats && !market.usedDemand.cargoTons ? "unserved" : seats > passengers * 1.15 ? "oversupply" :
    seats < passengers * 0.7 ? "undersupply" : "balanced";
  const reasons: ("highFare" | "lowLoad" | "oversupply" | "loss" | "unserved" | "cargoOpportunity")[] = [];
  if (pricing.economy > reference.economy * 1.5) reasons.push("highFare");
  if ((actual?.observedFlights ?? 0) >= 5 && loadFactor !== null && loadFactor < 0.55) reasons.push("lowLoad");
  if (status === "oversupply" || status === "unserved") reasons.push(status);
  if (actual && actual.profit < 0) reasons.push("loss");
  if (market.remainingDemand.cargoTons > market.totalDemand.cargoTons * 0.3) reasons.push("cargoOpportunity");
  return { actual, market, loadFactor, cargoLoadFactor, status, reasons };
}
