// GBP gameplay calibration, not live fuel quotes or certified aircraft performance.
// TODO: Replace legacy fuel coefficients with sourced aircraft performance profiles.
export const OPERATING_COST_PROFILES = {
  narrowbody: {
    cruiseFuelScale: 0.016, departureFuelScale: 0.65, crewPerHour: 520, minimumCrewHours: 1,
    airportFactor: 1, maintenancePerHour: 1100, maintenancePerCycle: 500
  },
  widebody: {
    cruiseFuelScale: 0.0105, departureFuelScale: 0.85, crewPerHour: 1150, minimumCrewHours: 1.5,
    airportFactor: 1.8, maintenancePerHour: 2400, maintenancePerCycle: 1000
  }
} as const;

export const AIRPORT_MOVEMENT_COST = { regional: 400, large: 800, mega: 1200 } as const;
export const CARGO_HANDLING_COST_PER_TON = 35;
