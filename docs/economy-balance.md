# V1.5.2 Economy and Finance

## Company Clock

Company age is derived from currentGameTimeMs minus baseGameTimeMs, displayed
as days, hours and minutes on Dashboard and Finance. It is simulated elapsed
time, not time since installing or opening the browser. Pausing stops it; speed
controls change its progression. Founding dates display in UTC. Both original
clock fields already persist in local and compact cloud saves.

## Finance Sorting

Recent flight records support ascending/descending profit, natural flight-number
order, passengers, fractional cargo tons, revenue, cost and completion time.
Default order is latest completed first. Equal values use latest completion as
a tie-breaker; missing legacy flight numbers stay last in either direction.
Sorting copies the list and never edits accounting or persisted history.
The existing 60-record game log and compact-save limit remain unchanged.

## Earnings Decision

V1.5.1 multiplied Easy-mode ticket and cargo revenue by 3.15, or 3.78 on routes
at least 5,500 km long. High weekly demand also overrode utilization: capacity
was capped after multiplying demand by load factor, often yielding full aircraft.

V1.5.2 caps demand at capacity before applying passenger/cargo load factors.
Easy revenue uses 2.8, with a 1.1 long-haul bonus (3.08 combined). Simulation
retains 3.15 and 1.2 before its existing fivefold sandbox bonus. Realistic
retains multiplier 1. Costs, prices set by players and maintenance rules are
unchanged. Integer settlement profit equals rounded revenue minus rounded cost.
Previews, timetable estimates and actual settlements use the same owner.
No historical flight income, cash or profit is retroactively recalculated.

Representative daylight, default-cabin/default-price Easy previews:

| Route / aircraft | V1.5.1 profit (GBP) | V1.5.2 profit (GBP) |
| --- | ---: | ---: |
| LHR-CDG / A220-300 | 44,325 | 31,188 |
| LHR-MAD / A320neo | 92,716 | 20,642 |
| LHR-JFK / A350-900 | 729,611 | 308,771 |
| LHR-HKG / 787-9 | 1,039,418 | 116,496 |

These are deterministic route preview samples, not promises about every flight.
Actual utilization, pricing, layout and local night demand can change results;
some flights can lose money. Some short-haul contributions remain generous.

For perspective, [IATA's June 2026 outlook](https://www.iata.org/en/pressroom/2026-releases/06-07-middle-east-disruptions-high-fuel-prices-halve-airline-industry-profitability/)
forecasts a 4.1% industry operating margin and a 2.0% net margin. These are
airline-wide results during a fuel-price shock, not target profit percentages
for individual game flights. This change is a gameplay rebalance, not a claim
of calibrated real-world airline accounting.

## Deferred

- TODO: calibrate fuel/crew/airport units by aircraft category before calling
  Realistic a realistic financial model; its legacy costs can make default
  long-haul fares loss-making.
- TODO: model depreciation or lease payments, fixed airline overhead and taxes
  separately from per-flight operating contribution.
- TODO: allocate a shared weekly route market across simultaneous aircraft
  rather than reusing weekly demand independently for each settlement.
- TODO: evaluate a larger or aggregate long-term financial history without
  unbounded save growth.
