# V1.5.3 Financial Reports and Fleet Attention

## V1.7.0 Shared Markets

Seven-day per-route and per-aircraft aggregates now retain observed passengers,
cargo tons, payload capacity and passenger/cargo revenue splits. Older rows
default missing metrics safely; they do not reconstruct historical sales or
change past cash/profit. Flight accounting locks at departure and is observed
once on arrival. Route analysis separates actual seven-day results from explicit
isolated forward forecasts. See [shared route market](route-market.md).

## V1.6.0 Company Rewards

Contracts and milestones add a separate `contractRewards` cash category.
Rewards increase canonical `game.money` and closing cash, not passenger/cargo
revenue, per-flight profit or operating profit. They are recorded at the actual
completion/crossing game time, including offline catch-up, and persist in
compact-save format 2. Old report rows default the new category to zero.
Historical company migration grants points only. See [company growth](company-growth.md).

## Costs and Difficulty

The shared economics calculator serves forecasts, weekly estimates and actual
settlements. Coefficients in src/config/operatingCosts.ts are gameplay GBP
calibration, not physical fuel consumption or live airport tariffs. The legacy
model fuelCostPerKm field remains a relative aircraft fuel rating.

| Component | Narrowbody | Widebody |
| --- | ---: | ---: |
| Cruise fuel: rating x distance x scale | 0.016 | 0.0105 |
| Departure fuel: rating x scale per leg | 0.65 | 0.85 |
| Crew per flight hour | 520 | 1,150 |
| Minimum billed crew hours | 1 | 1.5 |
| Airport movement factor | 1 | 1.8 |
| Maintenance reserve per hour | 1,100 | 2,400 |
| Maintenance reserve per completed cycle | 500 | 1,000 |

Both airports contribute movement fees: regional 400, large 800, mega 1,200,
multiplied by the aircraft category factor. Cargo handling adds 35 per ton.
Maintenance reserves are operating expenses already charged with each flight;
only the later service shortfall is an additional expense.

The new cost scale makes the old Easy revenue bonus too generous. Easy now
uses 1.5 without an extra long-haul bonus. Simulation retains 3.15 / 1.2 plus
its fivefold sandbox multiplier. Realistic remains 1. Player fares and
historical settlements are not rewritten.

Representative daylight/default-layout/default-price Easy previews:

| Route / aircraft | V1.5.2 profit | V1.5.3 revenue | V1.5.3 cost | V1.5.3 profit |
| --- | ---: | ---: | ---: | ---: |
| LHR-CDG / A220-300 | 31,188 | 25,117 | 13,039 | 12,078 |
| LHR-MAD / A320neo | 20,642 | 46,752 | 41,452 | 5,300 |
| LHR-JFK / A350-900 | 308,771 | 500,872 | 281,554 | 219,318 |
| LHR-HKG / 787-9 | 116,496 | 637,798 | 461,946 | 175,852 |

This corrects cost relationships, not a uniform percentage nerf. Efficient
long-haul aircraft can improve; low-utilization routes can lose money. Realistic
default samples include positive CDG/JFK and negative MAD/HKG contributions.
Company net margin is not modeled or promised.

## Accounting

- One cash owner: game.money. Reports observe actual changes, never set cash.
- Revenue = passenger revenue + cargo revenue.
- Operating cost = fuel + crew + airport/handling + maintenance reserve.
- Operating profit = revenue - operating cost - additional maintenance cash.
- Cash change = operating profit - aircraft/routes/base purchases + subsidies
  + signed console/import adjustments + pre-tracking settlement adjustments.
- Integer cost allocations sum to each rounded settlement exactly.
- Initial base purchase is investment spending, not a loss.
- Cancelled, pending, grounded or already settled legs do not add new revenue.
- Late catch-up events dated before tracking are separate pre-tracking
  settlements, not invented historical sales. Events older than retained
  history adjust its opening balance.

## Retention and Compatibility

Persist only up to 90 company UTC daily summaries and seven UTC daily
aircraft/route summaries including today. Derive weeks (Monday start), charts,
missing zero-activity days and alert lists at display time. No persisted weekly
report, complete event ledger, derived preview or duplicate aircraft record.
First/trimmed weeks and mid-day tracking starts are partial; today's/week's
report remains in progress. A week beginning exactly at the retained boundary
is complete except for its current in-progress status.

The 60-entry flight log and lifetime counters remain unchanged. Old saves start
tracking at upgrade with existing cash; no older revenues are reconstructed.
Optional financialHistory and lastCompletedFlightGameTimeMs fields round-trip
through existing compact format 2, IndexedDB/local fallback and cloud JSON.
No Supabase schema migration or storage-key reset is required. Cloud network
authentication itself is not verified by these local tests.

## Fleet Attention

- Urgent: grounded aircraft or a blocked maintenance reservation.
- Service: existing soon/due threshold, with no active or scheduled maintenance.
- Arranged: active maintenance or a scheduled reservation; not an exception.
- Loss-making: at least five completed legs and negative summed flight
  contribution in the seven UTC calendar days including today. Maintenance
  service cash is reported separately and does not distort this flight metric.
- Idle: flyable, no task/reservation, no completed leg in 24 hours, and no valid
  in-flight or next-24-hour departure from the aircraft's current location.
  Newly acquired aircraft receive a 24-hour grace period.

Dashboard links open that independent aircraft's detail panel. Fleet filters
reuse batch maintenance booking. They never merge records, change pricing or
rewrite weekly schedules. Unknown legacy last-flight history is not fabricated;
available actual records seed the checkpoint on upgrade.

## Deferred

- TODO: sourced model-specific performance, landing weights and verified tariffs.
- TODO: depreciation, leases, overhead, taxes and loans as separate accounting.
- TODO: shared weekly route demand across all aircraft.
- TODO: long-term server-side reporting beyond the bounded client save.
- TODO: globally chronological cross-aircraft catch-up for cash-constrained
  maintenance. Existing independent timeline behavior is preserved.
