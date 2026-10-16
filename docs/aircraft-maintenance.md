# Aircraft Maintenance and Reliability

Maintenance uses game time and simplified gameplay assumptions, not certified aircraft limits.

## One-Click Full Maintenance (V1.7.3 Follow-Up)

- Full maintenance is now one action from the aircraft's Fleet detail. It uses
  that aircraft's own home base, not necessarily the airline's primary base.
- On the ground at home, work starts after any remaining turnaround. In flight,
  the current leg finishes without diversion; the aircraft then takes its next
  compatible scheduled return home. Other conflicting departures are cancelled.
- If no compatible return exists, an independent empty ferry is added after
  landing/turnaround. It moves through the normal flight engine, never teleports,
  never opens a commercial route and carries no passengers or cargo.
- A grounded aircraft may use this empty recovery ferry as a deliberate gameplay
  simplification. Passenger flying remains blocked. Direct ferry distance must
  fit the model range and both airports must exist; invalid legacy positions
  receive a visible blocked-return message. Multi-stop ferry planning is deferred.
- There is no workshop/aircraft-count limit. Batch full maintenance includes idle,
  grounded and airborne aircraft, with a separate return/work timeline per aircraft.
- Starting service uses the existing reserve/shortfall quote at actual start.
  Cash shortages wait at base and retry automatically; a later funded start is
  not backdated. Ferry operating cost settles once on arrival as maintenance
  spending. Ferry wear/reserve is recorded, but no passenger satisfaction,
  commercial flight count, market demand, contract delivery or milestone flight
  is credited for an empty ferry.
- Work still takes 8 game hours for narrowbodies and 12 for widebodies. The
  overlapping dated flights are cancelled, not the weekly timetable. After work,
  the next original departure from the actual airport resumes automatically.
  Past cancellations are never resurrected or awarded income.
- Fleet rows and detail show independent progress. Detail includes percentage,
  remaining game time, completion time and the next eligible timetable flight.
  Returning/waiting aircraft show 0%; completed work shows 100%. Pausing freezes
  progress; local/cloud compact saves retain it and one latest completion record.
- A selected aircraft detail remains open when completion removes the aircraft
  from a live maintenance filter. Explicit filter changes still close the detail.
- Existing technical inspections and legacy dated reservations remain compatible.
  Cancel before work starts if needed; an airborne ferry finishes safely rather
  than disappearing. Active work is not refundable or cancellable.
- No database migration, new package or unrelated economy change is included.
  The public version remains 1.7.3 pending a separately requested release.

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
- Full maintenance uses the automatic home-base flow above. Legacy dated reservations and technical inspection can still start immediately on the ground or after a dated flight and its actual turnaround. Pausing simulation pauses maintenance progress.
- Reliability begins at 99.5%, with readable penalties for wear, age, hours/cycles since service, and overdue service, bounded to 80-99.5%. Starting maintenance does not improve reliability before completion. Model-specific verified baselines remain a TODO.
- Technical disruption probability is `1 - reliability / 100`, bounded to 0.5-20%. Each eligible departure checks once using its deterministic flight ID. A disruption adds 15-90 game minutes alongside existing operational delay and turnaround rules; reloads do not reroll it.
- New maintenance cancels dated departures that overlap the maintenance window rather than postponing them indefinitely. The weekly service template is retained. Afterwards, departures from the wrong airport are cancelled until the first position-compatible leg can resume. There is no teleportation or automatic replacement aircraft.
- Reservations cost nothing to book; the actual quote and affordability are checked at the start after the anchor's wear and reserve funding. Insufficient funds, a deleted anchor, or grounding before the anchor leave a visible blocked reservation with no maintenance charge. Cancel and rebook, or maintain immediately on the ground.
- Fleet supports condition filtering and batch automatic full maintenance. Legacy reservation validation remains atomic, and aircraft registrations, locations, schedules and accounts remain independent.
- Reservations can be cancelled before work starts. Active work cannot be cancelled/refunded. Legacy active maintenance tasks without a recovery window keep the old retained-flight delay behavior.

## Persistence and Stability

- Reservations, recovery windows and cancellation reasons are additive to compact format 2; no database migration is required.
- Cancelled flights have no revenue, passengers, cargo or wear. Their actual departure/arrival fields remain absent after reload.
- Future cancellations are retained until their dates pass, even if they exceed the terminal-history cap. A per-aircraft processed-time watermark prevents expired/pruned weekly events from being regenerated and settled again.
- Each completed leg and maintenance shortfall settles once. Changes to speed or pause reconcile elapsed time first.
- Per-aircraft profit is cumulative rather than recomputed from a bounded recent log. Legacy saves with incomplete history show recorded profit as partial; missing historical earnings are not invented.

## Accounting

The V1.4 shared flight calculation already deducts a maintenance reserve from completed-flight profit. V1.5 records that same amount in the aircraft's reserve balance.

`service cost = labour + parts`

`reserve used = min(service cost, floor(reserve balance))`

`additional cash cost = service cost - reserve used`

Only additional cash cost is deducted from canonical `game.money` and `game.totalProfit`, once at the start of maintenance. Completion does not charge again. Aircraft and Finance details display cumulative additional spend. Dashboard lifetime profit uses the authoritative total, not the bounded recent-flight log.

Cash uses whole GBP. Fractional reserve is retained rather than spent above its balance, preventing the next normalization tick from changing cash.

Labour is GBP 12,000 for an inspection or 65,000 for full service. Parts are `(100 - condition) * 200` or `* 1,800`, respectively. Widebody costs use a 1.6 factor. All are explicitly tunable gameplay values.

## Validation

The 2026-10-16 one-click follow-up passes 169 automated tests, including 100
simultaneous home-base services, existing and empty-ferry returns, grounded
recovery, original weekly departures after reload, cash retry timing,
same-time cancel/rebook uniqueness, own-base selection and stepped/catch-up
settlement equivalence. Typecheck, lint and optimized Next.js build pass.
Browser acceptance covers EN/ZH at 1440x1000, 390x844, 320x740 and 844x390,
using the actual Fleet actions, real simulation clock, independent percentage,
pause/reload, filtered-detail completion and original-flight recovery. Optional
verifier: `tests/verifyHomeMaintenance.cjs`; run `pnpm test` first, provide
`PLAYWRIGHT_MODULE`, optional `PLAYWRIGHT_CHANNEL`, and `UI_CHECK_URL`.

The 2026-10-03 regression run passes 56 tests, including 100 independent aircraft, delayed anchors, cross-day maintenance, blocked reservations, cancellation history pruning, compact restore, fractional reserves, cumulative profit, and airport time-zone/DST checks.

Browser acceptance used an isolated disposable fixture through the real Fleet and aircraft-detail components. Single and batch reservations, cancellation reasons, once-only charges, compact reload, position-compatible recovery, Escape handling, and English/Chinese layouts passed. At 390px, document width was 390px and dialog content width matched its 364px viewport. No JavaScript runtime error was captured; the pre-existing missing favicon still produces an unrelated 404. The fixture is removed after verification. Live authenticated Supabase upload/download remains credential-gated.

## Simplified Night Operations

- Passenger demand on routes up to 1,500 km is multiplied by 0.85 for departures at the origin's local 23:00-06:00. This is a gameplay parameter, not measured airport traffic data. Cargo and longer routes are unchanged. Timed schedule estimates include the outbound and return origin's local time.
- Airport time conversion uses IANA zones and handles daylight saving. Existing timetable fields retain UTC semantics despite the legacy `departureTimeLocal` name.
- Airport night rules are opt-in and default off for old saves. New or edited plans are checked over the next 14 days: FRA is blocked at local 23:00-05:00; LHR gets an advisory rather than a blanket ban. Existing flights are not retroactively cancelled.
- These rules simplify real restrictions and exceptions. Runtime curfew handling for delayed flights, diversion, quotas, verified night fees, replacement aircraft and model-specific maintenance programs remain TODOs. Workshop capacity is intentionally unlimited.
- Operator references: [Frankfurt FAQ](https://www.fraport.com/de/nachhaltigkeit/nachbarschaftsdialog/mein-anliegen/fragen-und-antworten.html), [Heathrow night flights](https://www.heathrow.com/company/local-community/noise/operations/night-flights).
