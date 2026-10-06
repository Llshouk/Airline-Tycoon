import { aircraftById } from "@/data/aircraft";
import { airports, airportsById } from "@/data/airports";
import { estimateDemand } from "@/lib/demand";
import { estimateExpectedFlightProfit, estimateRouteOpeningCost, estimateTicketPrices, estimateCargoRatePerTon } from "@/lib/economy";
import { applyFinanceEvents, normalizeFinancialHistory } from "@/lib/financialReports";
import { distanceKm, routeIdFor } from "@/lib/geo";
import { DAY_MS } from "@/lib/time";
import type { CompanyContract, CompanyGrowth, ContractKind, ContractTarget, MilestoneId } from "@/types/companyGrowth";
import type { FinanceEvent } from "@/types/finance";
import type { AircraftInstance, GameState, Route } from "@/types/game";

export const COMPANY_LEVELS = [
  { id: "regional", threshold: 0, maxDistanceKm: 1500 },
  { id: "growing", threshold: 300, maxDistanceKm: 2500 },
  { id: "domestic", threshold: 1000, maxDistanceKm: 4000 },
  { id: "international", threshold: 2500, maxDistanceKm: 8000 },
  { id: "global", threshold: 6000, maxDistanceKm: Infinity }
] as const;
export const MILESTONES: { id: MilestoneId; metric: keyof CompanyGrowth["progress"]; required: number; points: number; cash: number }[] = [
  { id: "firstFlight", metric: "flights", required: 1, points: 50, cash: 25000 },
  { id: "flights100", metric: "flights", required: 100, points: 150, cash: 100000 },
  { id: "passengers1000", metric: "passengers", required: 1000, points: 100, cash: 75000 },
  { id: "cargo100", metric: "cargoTons", required: 100, points: 100, cash: 75000 },
  { id: "fleet5", metric: "fleet", required: 5, points: 100, cash: 100000 }
];
export const totalDevelopmentPoints = (growth: CompanyGrowth) => growth.points.contracts + growth.points.milestones + growth.points.legacy;
export function companyLevel(growth: CompanyGrowth) {
  const points = totalDevelopmentPoints(growth);
  return COMPANY_LEVELS.reduce((index, level, i) => points >= level.threshold ? i : index, 0);
}
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
const pairKey = (a: string, b: string) => [a, b].sort().join(":");
const cityKey = (id: string) => `${airportsById[id]?.country}:${airportsById[id]?.city}`;
const samePair = (a: string, b: string, target: ContractTarget) => pairKey(a, b) === pairKey(target.originId, target.destinationId);
export const isCargoContract = (kind: ContractKind) => kind === "cargo" || kind === "longTerm";

export function contractTargetAmount(contract: CompanyContract, target: ContractTarget, event: Extract<FinanceEvent, { kind: "flight" }>, accepted: number) {
  if (!samePair(event.entry.originAirportId, event.entry.destinationAirportId, target) ||
    event.departureGameTimeMs === undefined || event.departureGameTimeMs < accepted || event.gameTimeMs < accepted) return 0;
  if (contract.kind === "longTerm" && Math.floor(Math.max(0, event.gameTimeMs - accepted - 1) / (7 * DAY_MS)) !== target.deliveryWeek) return 0;
  if (isCargoContract(contract.kind)) return finite(event.entry.cargoTons);
  if ((contract.kind === "network" || contract.kind === "charter") && event.entry.destinationAirportId !== target.destinationId) return 0;
  return contract.kind === "charter" ? finite(event.entry.passengerCount) : event.entry.passengerCount > 0 ? 1 : 0;
}

export function createCompanyGrowth(game: GameState, legacy = false): CompanyGrowth {
  const progress = { flights: legacy ? finite(game.completedFlights) : 0, passengers: legacy ? finite(game.passengerCount) : 0,
    cargoTons: legacy ? finite(game.cargoTransportedTons) : 0, fleet: game.fleet.length };
  const milestones: CompanyGrowth["milestones"] = {};
  let legacyPoints = legacy ? Math.min(6000, Math.floor(progress.flights / 100) * 100 +
    Math.floor(progress.passengers / 10000) * 50 + Math.floor(progress.cargoTons / 1000) * 50) : 0;
  if (legacy) for (const milestone of MILESTONES) {
    if (progress[milestone.metric] >= milestone.required) {
      milestones[milestone.id] = "legacy";
      legacyPoints += milestone.points;
    }
  }
  return { schemaVersion: 1, points: { contracts: 0, milestones: 0, legacy: legacyPoints }, progress, milestones,
    settledThroughGameTimeMs: game.currentGameTimeMs, boardCycle: -1, boardSignature: "", offers: [], consumedOfferIds: [], active: [], history: [], cooldowns: [] };
}

function validContract(raw: CompanyContract) {
  return raw && typeof raw.id === "string" && raw.id.length < 500 && typeof raw.key === "string" && raw.key.length < 500 &&
    ["commuter", "cargo", "network", "charter", "longTerm"].includes(raw.kind) && Array.isArray(raw.targets) && raw.targets.length >= 1 && raw.targets.length <= 3 &&
    raw.targets.every((target) => target && airportsById[target.originId] && airportsById[target.destinationId] &&
      target.originId !== target.destinationId && Number.isFinite(target.required) && target.required > 0 &&
      Number.isFinite(target.progress) && target.progress >= 0 && typeof target.needsNewRoute === "boolean") &&
    (raw.kind !== "longTerm" || (raw.targets.length === 3 && raw.targets.every((target, index) => target.deliveryWeek === index))) &&
    Number.isFinite(raw.durationDays) && raw.durationDays > 0 && raw.durationDays <= 21 &&
    Number.isFinite(raw.points) && raw.points > 0 && raw.points <= 350 &&
    Number.isFinite(raw.quotedCost) && raw.quotedCost >= 0 && Number.isFinite(raw.cashReward) && raw.cashReward >= 0 && raw.cashReward <= 1000000;
}

export function normalizeCompanyGrowth(raw: CompanyGrowth | undefined, game: GameState): CompanyGrowth {
  if (!raw || raw.schemaVersion !== 1) return createCompanyGrowth(game, true);
  const clean = (items: CompanyContract[] | undefined, cap: number) => (Array.isArray(items) ? items : []).slice(0, cap).filter(validContract)
    .map((item) => ({ ...item, targets: item.targets.map((target) => ({ ...target, progress: Math.min(target.required, target.progress) })) }));
  const milestones = Object.fromEntries(MILESTONES.filter((m) => ["earned", "legacy"].includes(raw.milestones?.[m.id] ?? ""))
    .map((m) => [m.id, raw.milestones[m.id]]));
  return { ...raw, points: { contracts: Math.floor(finite(raw.points?.contracts)), milestones: Math.floor(finite(raw.points?.milestones)), legacy: Math.floor(finite(raw.points?.legacy)) },
    progress: { flights: finite(raw.progress?.flights), passengers: finite(raw.progress?.passengers), cargoTons: finite(raw.progress?.cargoTons), fleet: finite(raw.progress?.fleet) },
    milestones, settledThroughGameTimeMs: Math.min(game.currentGameTimeMs, finite(raw.settledThroughGameTimeMs)),
    boardCycle: Number.isInteger(raw.boardCycle) ? raw.boardCycle : -1, boardSignature: typeof raw.boardSignature === "string" ? raw.boardSignature : "",
    offers: clean(raw.offers, 3), consumedOfferIds: (Array.isArray(raw.consumedOfferIds) ? raw.consumedOfferIds : []).slice(0, 3).filter((id) => typeof id === "string"),
    active: clean(raw.active, 2).filter((item) => Number.isFinite(item.acceptedGameTimeMs) && item.acceptedGameTimeMs! <= game.currentGameTimeMs &&
      item.deadlineGameTimeMs === item.acceptedGameTimeMs! + item.durationDays * DAY_MS),
    history: (Array.isArray(raw.history) ? raw.history : []).slice(-20).filter((item) => validContract(item) &&
      ["completed", "expired", "abandoned"].includes(item.outcome) && Number.isFinite(item.endedGameTimeMs) && item.endedGameTimeMs <= game.currentGameTimeMs),
    cooldowns: (Array.isArray(raw.cooldowns) ? raw.cooldowns : []).filter((item) => item && typeof item.key === "string" && Number.isFinite(item.untilGameTimeMs) &&
      item.untilGameTimeMs > game.currentGameTimeMs).slice(-32) };
}

function reward(growth: CompanyGrowth, points: number, cash: number, time: number, source: "contracts" | "milestones", events: FinanceEvent[]) {
  growth.points[source] += points;
  if (cash) events.push({ kind: "cash", gameTimeMs: time, category: "contractRewards", delta: cash });
}
function finish(growth: CompanyGrowth, contract: CompanyContract, outcome: "completed" | "expired" | "abandoned", time: number, events: FinanceEvent[]) {
  growth.history = [...growth.history, { ...contract, outcome, endedGameTimeMs: time }].slice(-20);
  growth.cooldowns = [...growth.cooldowns.filter((item) => item.key !== contract.key && item.untilGameTimeMs > time),
    { key: contract.key, untilGameTimeMs: time + 7 * DAY_MS }].slice(-32);
  if (outcome === "completed") reward(growth, contract.points, contract.cashReward, time, "contracts", events);
}
function awardMilestones(growth: CompanyGrowth, time: number, events: FinanceEvent[]) {
  for (const milestone of MILESTONES) if (!growth.milestones[milestone.id] && growth.progress[milestone.metric] >= milestone.required) {
    growth.milestones[milestone.id] = "earned";
    reward(growth, milestone.points, milestone.cash, time, "milestones", events);
  }
}

// Consume only newly settled events, chronologically, before checking tick-end expiry.
export function advanceCompanyGrowth(game: GameState, events: readonly FinanceEvent[], fleetPurchase = false) {
  const growth = normalizeCompanyGrowth(game.companyGrowth, game);
  const rewards: FinanceEvent[] = [];
  const checkpoint = growth.settledThroughGameTimeMs;
  const seen = new Set<string>();
  for (const event of [...events].filter((event) => event.kind === "flight").sort((a, b) => a.gameTimeMs - b.gameTimeMs)) {
    if (event.kind !== "flight" || !Number.isFinite(event.gameTimeMs) || event.gameTimeMs <= checkpoint || event.gameTimeMs > game.currentGameTimeMs || seen.has(event.entry.id)) continue;
    seen.add(event.entry.id);
    growth.progress.flights += 1;
    growth.progress.passengers += finite(event.entry.passengerCount);
    growth.progress.cargoTons = Math.round((growth.progress.cargoTons + finite(event.entry.cargoTons)) * 1000000) / 1000000;
    awardMilestones(growth, event.gameTimeMs, rewards);
    growth.active = growth.active.filter((contract) => {
      if (event.gameTimeMs > contract.deadlineGameTimeMs!) {
        finish(growth, contract, "expired", contract.deadlineGameTimeMs!, rewards);
        return false;
      }
      if (!Number.isFinite(event.departureGameTimeMs) || event.departureGameTimeMs! < contract.acceptedGameTimeMs! ||
        event.departureGameTimeMs! > event.gameTimeMs) return true;
      for (const target of contract.targets) if (samePair(event.entry.originAirportId, event.entry.destinationAirportId, target)) {
        const amount = contractTargetAmount(contract, target, event, contract.acceptedGameTimeMs!);
        target.progress = Math.min(target.required, Math.round((target.progress + amount) * 1000000) / 1000000);
      }
      if (contract.targets.every((target) => target.progress >= target.required)) {
        finish(growth, contract, "completed", event.gameTimeMs, rewards);
        return false;
      }
      return true;
    });
  }
  growth.active = growth.active.filter((contract) => {
    if (game.currentGameTimeMs <= contract.deadlineGameTimeMs!) return true;
    finish(growth, contract, "expired", contract.deadlineGameTimeMs!, rewards);
    return false;
  });
  growth.settledThroughGameTimeMs = game.currentGameTimeMs;
  if (fleetPurchase) {
    growth.progress.fleet = Math.max(growth.progress.fleet, game.fleet.length);
    awardMilestones(growth, game.currentGameTimeMs, rewards);
  }
  return { growth, rewards, cashReward: rewards.reduce((sum, event) => sum + (event.kind === "cash" ? event.delta : 0), 0) };
}

type Quote = { cost: number; cargo: number; passengers: number; legs: number };
function capableAircraft(game: GameState, route: Route) {
  return game.fleet.filter((aircraft) => aircraft.status !== "grounded" && aircraft.homeBaseAirportId === route.originAirportId &&
    aircraftById[aircraft.modelId]?.rangeKm >= route.distanceKm);
}
function quoteAircraft(game: GameState, route: Route, aircraft: AircraftInstance, days: number): Quote {
  const model = aircraftById[aircraft.modelId];
  const estimate = estimateExpectedFlightProfit(route, model, aircraft.cabinLayout, game.difficultyConfig);
  const unavailable = Math.max(0, (aircraft.lifecycle?.maintenance?.completesGameTimeMs ?? game.currentGameTimeMs) - game.currentGameTimeMs);
  const blockHours = route.distanceKm / model.cruiseSpeedKmh + model.turnaroundMinutes / 60 + 0.75;
  // Conservative capacity envelope, not a promise that existing schedules meet a contract.
  // The explicit contract forecast checks the actual combined timetable separately.
  const legs = Math.floor(Math.max(0, days * 24 - unavailable / 3600000) / blockHours * 0.4);
  return { cost: estimate.cost, cargo: estimate.cargoTons, passengers: estimate.passengerCount, legs };
}
function blocked(growth: CompanyGrowth, key: string, now: number) {
  return growth.active.some((contract) => contract.key === key) || growth.cooldowns.some((item) => item.key === key && item.untilGameTimeMs > now);
}
function contractFor(game: GameState, growth: CompanyGrowth, route: Route, kind: Exclude<ContractKind, "network">, level: number, cycle: number): CompanyContract | null {
  const cargo = isCargoContract(kind);
  const days = kind === "longTerm" ? 21 : kind === "charter" ? 5 : kind === "commuter" ? 7 : 10;
  const key = `${kind}:${pairKey(route.originAirportId, route.destinationAirportId)}`;
  if (blocked(growth, key, game.currentGameTimeMs)) return null;
  const quotes = capableAircraft(game, route).map((aircraft) => quoteAircraft(game, route, aircraft, days))
    .filter((quote) => cargo ? quote.cargo >= 0.1 && quote.legs >= 4 : quote.passengers > 0 && quote.legs >= 4)
    .sort((a, b) => cargo ? b.cargo * b.legs - a.cargo * a.legs : b.legs - a.legs);
  const quote = quotes[0];
  if (!quote) return null;
  const required = kind === "charter" ? Math.max(1, Math.floor(Math.min(800 + level * 100, quote.passengers * quote.legs * 0.25))) :
    kind === "longTerm" ? Math.max(1, Math.floor(Math.min(120 + level * 30, quote.cargo * quote.legs * 0.15))) :
    kind === "commuter" ? Math.min(20 + level * 5, Math.floor(quote.legs * 0.6)) :
    Math.max(1, Math.floor(Math.min(120 + level * 30, quote.cargo * quote.legs * 0.45)));
  if (cargo && quote.cargo * quote.legs < required * (kind === "longTerm" ? 3 : 1)) return null;
  const legs = kind === "commuter" ? required : Math.ceil(required / (cargo ? quote.cargo : quote.passengers)) * (kind === "longTerm" ? 3 : 1);
  const quotedCost = Math.round(quote.cost * legs);
  return { id: `${cycle}:${key}`, key, kind, durationDays: days, points: kind === "longTerm" ? 350 : kind === "charter" ? 250 : kind === "commuter" ? 100 : 150,
    cashReward: Math.min(1000000, Math.round(quotedCost * 0.08)), quotedCost,
    targets: Array.from({ length: kind === "longTerm" ? 3 : 1 }, (_, index) => ({ originId: route.originAirportId,
      destinationId: route.destinationAirportId, required, progress: 0, needsNewRoute: false,
      ...(kind === "longTerm" ? { deliveryWeek: index } : {}) })) };
}
function previewRoute(originId: string, destinationId: string): Route {
  const origin = airportsById[originId], destination = airportsById[destinationId];
  const distance = distanceKm(origin, destination);
  return { id: routeIdFor(originId, destinationId), originAirportId: originId, destinationAirportId: destinationId,
    distanceKm: distance, estimatedDemand: estimateDemand(origin, destination, distance),
    estimatedTicketPrices: estimateTicketPrices(distance), estimatedCargoRatePerTon: estimateCargoRatePerTon(distance), isOpen: false };
}
function networkContract(game: GameState, growth: CompanyGrowth, level: number, cycle: number): CompanyContract | null {
  for (const baseId of game.baseAirports) {
    const routes = game.routes.filter((route) => route.isOpen && route.originAirportId === baseId &&
      route.distanceKm <= COMPANY_LEVELS[level].maxDistanceKm && capableAircraft(game, route).some((aircraft) => {
        const quote = quoteAircraft(game, route, aircraft, 14);
        return quote.passengers > 0 && quote.legs >= 12;
      }));
    const cities = new Set([cityKey(baseId)]);
    const targets: ContractTarget[] = [];
    let cost = 0;
    for (const route of routes) if (!cities.has(cityKey(route.destinationAirportId)) && targets.length < 2) {
      cities.add(cityKey(route.destinationAirportId));
      targets.push({ originId: baseId, destinationId: route.destinationAirportId, required: 2, progress: 0, needsNewRoute: false });
      cost += Math.min(...capableAircraft(game, route).map((aircraft) => quoteAircraft(game, route, aircraft, 14).cost)) * 4;
    }
    if (targets.length !== 2) continue;
    const candidates = airports.filter((airport) => !cities.has(cityKey(airport.id)) &&
      !game.routes.some((route) => route.isOpen && pairKey(route.originAirportId, route.destinationAirportId) === pairKey(baseId, airport.id)))
      .map((airport) => previewRoute(baseId, airport.id)).filter((route) => route.distanceKm <= COMPANY_LEVELS[level].maxDistanceKm &&
        estimateRouteOpeningCost(route.distanceKm) <= game.money).sort((a, b) => a.distanceKm - b.distanceKm);
    const route = candidates.find((route) => capableAircraft(game, route).some((aircraft) => {
      const quote = quoteAircraft(game, route, aircraft, 14);
      return quote.passengers > 0 && quote.legs >= 12;
    }));
    if (!route) continue;
    targets.push({ originId: baseId, destinationId: route.destinationAirportId, required: 2, progress: 0, needsNewRoute: true });
    const key = `network:${targets.map((target) => pairKey(target.originId, target.destinationId)).sort().join("|")}`;
    if (blocked(growth, key, game.currentGameTimeMs)) continue;
    cost += Math.min(...capableAircraft(game, route).map((aircraft) => quoteAircraft(game, route, aircraft, 14).cost)) * 4;
    return { id: `${cycle}:${key}`, key, kind: "network", targets, durationDays: 14, points: 200,
      quotedCost: Math.round(cost), cashReward: Math.min(1000000, Math.round(cost * 0.08)) };
  }
  return null;
}
function hash(value: string) { let result = 2166136261; for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619); return result >>> 0; }

export function refreshContractBoard(game: GameState, raw?: CompanyGrowth): CompanyGrowth {
  const growth = raw ?? normalizeCompanyGrowth(game.companyGrowth, game);
  const level = companyLevel(growth);
  const cycle = Math.floor((game.currentGameTimeMs - game.baseGameTimeMs) / (3 * DAY_MS));
  const signature = `${game.fleet.length}:${game.routes.length}:${level}`;
  if (growth.boardCycle === cycle && (growth.offers.length >= 3 || growth.boardSignature === signature)) return growth;
  const next = { ...growth, boardCycle: cycle, boardSignature: signature,
    offers: growth.boardCycle === cycle ? [...growth.offers] : [], consumedOfferIds: growth.boardCycle === cycle ? [...growth.consumedOfferIds] : [],
    cooldowns: growth.cooldowns.filter((item) => item.untilGameTimeMs > game.currentGameTimeMs) };
  const candidates: CompanyContract[] = [];
  if (level >= 3) for (const kind of (level >= 4 ? ["longTerm", "charter"] : ["charter"]) as Exclude<ContractKind, "network">[]) {
    const offer = game.routes.filter((route) => route.isOpen).map((route) => contractFor(game, next, route, kind, level, cycle)).find(Boolean);
    if (offer) candidates.push(offer);
  }
  if (level >= 2) { const network = networkContract(game, next, level, cycle); if (network) candidates.push(network); }
  // Longer existing routes remain available to isolated-base and long-haul startups.
  const routes = game.routes.filter((route) => route.isOpen)
    .sort((a, b) => Number(a.distanceKm > COMPANY_LEVELS[level].maxDistanceKm) - Number(b.distanceKm > COMPANY_LEVELS[level].maxDistanceKm) ||
      hash(`${cycle}:${a.id}`) - hash(`${cycle}:${b.id}`) || a.id.localeCompare(b.id));
  offers: for (const route of routes) for (const kind of (level >= 1 ? ["cargo", "commuter"] : ["commuter"]) as ContractKind[]) {
    if (kind === "network") continue;
    const offer = contractFor(game, next, route, kind, level, cycle);
    if (offer && !next.offers.some((item) => item.key === offer.key) && !candidates.some((item) => item.key === offer.key)) candidates.push(offer);
    if (candidates.length >= 3) break offers;
  }
  next.offers.push(...candidates.filter((candidate) => !next.offers.some((offer) => offer.key === candidate.key)).slice(0, 3 - next.offers.length));
  return next;
}

export type ContractError = "noGame" | "slotsFull" | "unavailable" | "ineligible";
export function contractEligibility(game: GameState, offer: CompanyContract): ContractError | null {
  if (game.gameStatus !== "active") return "noGame";
  const growth = normalizeCompanyGrowth(game.companyGrowth, game);
  if (offer.kind === "charter" && companyLevel(growth) < 3 || offer.kind === "longTerm" && companyLevel(growth) < 4) return "ineligible";
  if (growth.active.length >= 2) return "slotsFull";
  if (growth.consumedOfferIds.includes(offer.id) || blocked(growth, offer.key, game.currentGameTimeMs)) return "unavailable";
  let openingCost = 0;
  for (const target of offer.targets) {
    const route = game.routes.find((route) => route.isOpen && samePair(route.originAirportId, route.destinationAirportId, target));
    if (target.needsNewRoute && route) return "ineligible";
    if (!route && !target.needsNewRoute) return "ineligible";
    const preview = route ?? previewRoute(target.originId, target.destinationId);
    if (!game.baseAirports.includes(target.originId)) return "ineligible";
    const capacity = capableAircraft(game, preview).map((aircraft) => quoteAircraft(game, preview, aircraft, offer.durationDays));
    if (!capacity.some((quote) => isCargoContract(offer.kind) ? quote.cargo > 0 && quote.cargo * quote.legs >= target.required * (offer.kind === "longTerm" ? 3 : 1) :
      offer.kind === "charter" ? quote.passengers * quote.legs * 0.5 >= target.required :
        quote.passengers > 0 && quote.legs >= target.required * (offer.kind === "network" ? 2 : 1))) return "ineligible";
    if (!route) openingCost += estimateRouteOpeningCost(preview.distanceKm);
  }
  return openingCost <= game.money ? null : "ineligible";
}
export function acceptCompanyContract(game: GameState, id: string): { game: GameState; error?: ContractError } {
  const growth = refreshContractBoard(game);
  const offer = growth.offers.find((item) => item.id === id);
  if (!offer) return { game: { ...game, companyGrowth: growth }, error: "unavailable" };
  const error = contractEligibility({ ...game, companyGrowth: growth }, offer);
  if (error) return { game: { ...game, companyGrowth: growth }, error };
  const contract = { ...offer, targets: offer.targets.map((target) => ({ ...target, progress: 0 })),
    acceptedGameTimeMs: game.currentGameTimeMs, deadlineGameTimeMs: game.currentGameTimeMs + offer.durationDays * DAY_MS };
  return { game: { ...game, companyGrowth: { ...growth, consumedOfferIds: [...growth.consumedOfferIds, id], active: [...growth.active, contract] } } };
}
export function abandonCompanyContract(game: GameState, id: string): GameState {
  const growth = normalizeCompanyGrowth(game.companyGrowth, game);
  const contract = growth.active.find((item) => item.id === id);
  if (!contract) return game;
  finish(growth, contract, "abandoned", game.currentGameTimeMs, []);
  growth.active = growth.active.filter((item) => item.id !== id);
  return { ...game, companyGrowth: growth };
}
export function applyCompanyGrowth(game: GameState, events: readonly FinanceEvent[], fleetPurchase = false): GameState {
  const result = advanceCompanyGrowth(game, events, fleetPurchase);
  const next = { ...game, money: game.money + result.cashReward, companyGrowth: result.growth,
    financialHistory: applyFinanceEvents(game.financialHistory ?? normalizeFinancialHistory(undefined, game.currentGameTimeMs, game.money), result.rewards, game.currentGameTimeMs) };
  return { ...next, companyGrowth: refreshContractBoard(next, result.growth) };
}
