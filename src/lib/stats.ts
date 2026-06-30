import { aircraftById } from "@/data/aircraft";
import { getCurrentCash } from "@/lib/cash";
import { estimateRouteOpeningCost, estimateWeeklyScheduleFinancials } from "@/lib/economy";
import type { AircraftInstance, GameState, Route } from "@/types/game";

export interface DashboardStats {
  cash: number;
  aircraftOwned: number;
  activeAircraft: number;
  aircraftInFlight: number;
  openRoutes: number;
  scheduledWeeklyFlights: number;
  completedFlights: number;
  passengerCount: number;
  cargoTransportedTons: number;
  totalRevenue: number;
  totalOperatingCost: number;
  totalProfit: number;
  estimatedWeeklyRevenue: number;
  estimatedWeeklyCost: number;
  estimatedWeeklyProfit: number;
  companyValuation: number;
  fleetValue: number;
  routeNetworkValue: number;
}

export function calculateDashboardStats(game: GameState): DashboardStats {
  const fleetStats = calculateFleetStats(game.fleet);
  const routeStats = calculateRouteStats(game.routes);
  const scheduleStats = calculateScheduleStats(game);
  const totalRevenue = game.flightLog.reduce((sum, entry) => sum + entry.revenue, 0);
  const totalOperatingCost = game.flightLog.reduce((sum, entry) => sum + entry.cost, 0);
  const totalProfit = game.flightLog.reduce((sum, entry) => sum + entry.profit, 0);
  const cash = getCurrentCash(game);
  const companyValuation = calculateCompanyValuation({
    cash,
    fleetValue: fleetStats.fleetValue,
    routeNetworkValue: routeStats.routeNetworkValue,
    recentProfit: totalProfit
  });

  return {
    cash,
    aircraftOwned: game.fleet.length,
    activeAircraft: fleetStats.activeAircraft,
    aircraftInFlight: fleetStats.aircraftInFlight,
    openRoutes: game.routes.length,
    scheduledWeeklyFlights: scheduleStats.scheduledWeeklyFlights,
    completedFlights: game.completedFlights,
    passengerCount: game.passengerCount,
    cargoTransportedTons: game.cargoTransportedTons,
    totalRevenue,
    totalOperatingCost,
    totalProfit,
    estimatedWeeklyRevenue: scheduleStats.estimatedWeeklyRevenue,
    estimatedWeeklyCost: scheduleStats.estimatedWeeklyCost,
    estimatedWeeklyProfit: scheduleStats.estimatedWeeklyProfit,
    companyValuation,
    fleetValue: fleetStats.fleetValue,
    routeNetworkValue: routeStats.routeNetworkValue
  };
}

export function calculateFleetStats(fleet: AircraftInstance[]) {
  return {
    activeAircraft: fleet.filter((aircraft) => aircraft.status !== "idle").length,
    aircraftInFlight: fleet.filter((aircraft) => aircraft.status === "in-flight").length,
    fleetValue: fleet.reduce((sum, aircraft) => sum + (aircraft.purchasePriceGBP ?? aircraftById[aircraft.modelId]?.estimatedPriceGBP ?? 0) * 0.82, 0)
  };
}

export function calculateRouteStats(routes: Route[]) {
  return {
    routeNetworkValue: routes.reduce((sum, route) => sum + estimateRouteOpeningCost(route.distanceKm) * 0.75, 0)
  };
}

export function calculateScheduleStats(game: GameState) {
  return game.fleet.reduce(
    (totals, aircraft) => {
      const model = aircraftById[aircraft.modelId];
      if (!model) return totals;
      aircraft.weeklySchedules.forEach((schedule) => {
        const route = game.routes.find((item) => item.id === schedule.routeId);
        if (!route) return;
        const estimate = estimateWeeklyScheduleFinancials(schedule, route, model, aircraft, game.difficultyConfig);
        totals.scheduledWeeklyFlights += estimate.weeklyFlights;
        totals.estimatedWeeklyRevenue += estimate.weeklyRevenue;
        totals.estimatedWeeklyCost += estimate.weeklyCost;
        totals.estimatedWeeklyProfit += estimate.weeklyProfit;
      });
      return totals;
    },
    {
      scheduledWeeklyFlights: 0,
      estimatedWeeklyRevenue: 0,
      estimatedWeeklyCost: 0,
      estimatedWeeklyProfit: 0
    }
  );
}

export function calculateCompanyValuation(input: {
  cash: number;
  fleetValue: number;
  routeNetworkValue: number;
  recentProfit: number;
}) {
  // Simple V1 valuation: cash plus depreciated fleet, route-network value, and a modest positive profit multiple.
  return Math.round(input.cash + input.fleetValue + input.routeNetworkValue + Math.max(0, input.recentProfit) * 2.5);
}
