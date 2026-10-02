# Aircraft Maintenance and Reliability

V1.5.0 uses game time and simplified gameplay assumptions, not certified aircraft limits.

## Ownership and Persistence

- `AircraftInstance.lifecycle` owns hours, cycles, condition, reserve, service counters, costs, and an optional active maintenance task for one registered aircraft.
- `normalizeAircraftLifecycle` is the compatibility boundary for purchases, old saves, local/cloud restoration, and simulation.
- Legacy aircraft start this system with condition 100, zero recorded flight hours and reserve, and the existing total flight count as lifetime cycles. Acquisition and last service default to upgrade game time. Unknown past hours/age are not invented, and previously spent reserves are not retroactively credited.
- Lifecycle fields and per-flight technical decisions are additive to compact save format 2. Registration, model, cabin, base, routes, and timetables stay unchanged. No Supabase table migration is required.
- Cloud errors still use the existing local save path; no auth or Supabase configuration was changed.

## Flight and Service Rules

- Age is elapsed game time divided by 365.25 days. Each completed leg records actual airborne hours and one cycle exactly once.
- Condition decreases by 0.035 points per airborne hour and 0.045 points per completed leg, bounded to 0-100.
- Full service becomes due after 500 flight hours, 250 cycles, 90 game days, or condition at/below 70. An 80% interval or condition at/below 80 warns in advance.
- Condition at/below 30 grounds the aircraft. Grounded flights stay scheduled, with no revenue, flight hours, or cycles.
- Technical inspection takes 2 game hours and improves condition by 8 points without resetting full-service intervals. Full service takes 8 hours for non-widebodies or 12 hours for widebodies, restores condition to 100, and resets service counters at completion.
- Work starts immediately on the ground, not while airborne. Pausing the simulation pauses maintenance progress. Future bookings, workshop capacity, and base-specific facilities are TODOs.
- Reliability begins at 99.5%, with readable penalties for wear, age, hours/cycles since service, and overdue service, bounded to 80-99.5%. Starting maintenance does not improve reliability before completion. Model-specific verified baselines remain a TODO.
- Technical disruption probability is `1 - reliability / 100`, bounded to 0.5-20%. Each eligible departure checks once using its deterministic flight ID. A disruption adds 15-90 game minutes alongside existing operational delay and turnaround rules; reloads do not reroll it.
- Maintenance holds and technical delays propagate through an aircraft's chronological timeline. Existing timetables are retained. Explicit cancellation/rebooking choices and backlog handling remain TODOs; V1.5 does not silently cancel flights.

## Accounting

The V1.4 shared flight calculation already deducts a maintenance reserve from completed-flight profit. V1.5 records that same amount in the aircraft's reserve balance.

`service cost = labour + parts`

`reserve used = min(service cost, reserve balance)`

`additional cash cost = service cost - reserve used`

Only additional cash cost is deducted from canonical `game.money` and `game.totalProfit`, once at the start of maintenance. Completion does not charge again. Aircraft and Finance details display cumulative additional spend. Dashboard lifetime profit uses the authoritative total, not the bounded recent-flight log.

Labour is GBP 12,000 for an inspection or 65,000 for full service. Parts are `(100 - condition) * 200` or `* 1,800`, respectively. Widebody costs use a 1.6 factor. All are explicitly tunable gameplay values.

## Validation

The focused tests cover legacy aircraft independence, finite normalization, age/hours/cycles, due thresholds, inspection/full service, reserve shortfalls, grounding mid-timeline, turnaround propagation, stable technical delays, active and completed maintenance through compact JSON restore, canonical cash, pause, affordability, and airborne rejection.

Browser acceptance used synthetic aircraft through the real Fleet/detail/Finance components. It verified an GBP 87,000 shortfall once, completion and delayed flight revenue, an independently grounded aircraft, unchanged accounting after compact reload, English/Chinese maintenance labels, and a 390px layout without horizontal overflow. Live authenticated Supabase upload/download remains a separate credential-gated check.
