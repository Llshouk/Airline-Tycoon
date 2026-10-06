# V1.7.0: Shared Route Market

This extends V1.6.0 with shared markets and operating tools. The model is
gameplay calibration, not measured passenger traffic, airport tariffs or an
airline-wide net-margin simulation. Airline positioning, competitors, alliances
and market events are not added in this update.

## Demand Units and Distance

`estimateDemand` returns a combined, two-direction weekly reference-fare market
for each cabin and cargo tons. Airport seed scores and size tiers use geometric
means, so a small destination limits a large-hub pairing. Existing hub bonuses
and difficulty rules remain. Distance and cabin composition are applied once;
the old second distance adjustment in previews has been removed.

The continuous distance coefficient is:

```
D / (D + 250) * exp(-max(0, D - 3500) / 14000)
```

Short flights lose potential to surface-transport competition, and very long
journeys receive a demand penalty. Cabin mix and the existing long-haul bonus
transition smoothly rather than jumping at displayed route-band boundaries.
These modifiers do not guarantee that every longer route has less total demand:
airport size and cabin mix also matter.

## Local Time and Fares

The weekly market is divided into two equal directions and seven days, then
distributed across six four-hour local-departure windows. Passenger windows use
normalized local-hour preference weights. Red-eye windows have less passenger
potential, including long-haul, whose profile blends toward a flatter shape.
Cargo remains uniformly distributed; it has no passenger red-eye penalty.

Existing timetable inputs remain UTC. Airport timezone conversion determines
the demand window, including DST. Repeated clock-change hours reuse the same
local-date/window key rather than creating another passenger pool. Airport
curfew rules remain the existing optional system.

For actual fare P, reference fare R, ratio r = P/R, maximum discount boost M,
and cabin/distance-adjusted elasticity e, the demand multiplier is:

```
M / (1 + (M - 1) * r^e) * exp(-max(0, r - 2) * 0.7)
```

At the reference fare demand is 100%. Higher fares reduce demand; absurd fares
approach zero. Discounts increase potential but cannot create unlimited demand:
passengers cap at 160%, cargo at 135%. Negative and non-finite prices are rejected.
Economy is more price-sensitive than business. The shared coefficients and
local-hour weights live in `src/config/routeMarket.ts`.

## Finite Pools and Locked Bookings

- A pool key combines the unordered airport pair, departure direction, local
  date and four-hour window. Reversing the route record cannot duplicate it.
- Not-yet-booked departures share remaining potential by cabin capacity.
  Booking consumes actual sold seats/tons expressed in reference-price units;
  changing fares later cannot reset customers already used in that window.
- Capacity, fares, passenger/cargo sales, revenue and costs lock at departure.
  Arrival settles that booking once. Later fare/cabin changes do not rewrite
  an airborne flight's accounting. Cancelled flights consume no customers and
  earn no revenue. Unused allocations can remain available to later departures.
- Fleet departures, arrivals and maintenance boundaries advance chronologically
  through the existing aircraft operating engine. Same-time operations have
  stable aircraft-ID ordering. The new wrapper is not a second cash owner.
- Each aircraft retains its own identity, registration, schedule, position,
  lifecycle and cumulative accounting.

The optional `routeMarket` ledger retains only the recent two-day window range.
Operational bookings stay with the already bounded schedule history. Compact
save format 2, IndexedDB, LocalStorage fallback and Supabase JSON carry both;
no database migration or new environment variable is required. Historical
settlements are not recalculated. Legacy airborne flights without a booking
lock one on first advancement after upgrade.

## Business and Fleet Tools

- Routes show actual recent seven-day operating profit, observed passenger load,
  passenger/cargo revenue and volumes. Unknown legacy volume metrics display
  unavailable rather than fabricated history. Profit is flight contribution,
  not profit after fixed airline overhead.
- Weekly combined market/capacity, excess-capacity, high-fare, loss and cargo
  opportunity signals accompany editable cabin fares and a price-demand chart.
- Explicit next-seven-day forecasts reuse settlement on an isolated copy and
  account for shared customers, existing schedules and maintenance. Draft
  timetable forecasts include the proposed service. Forecasts are timestamped
  snapshots; recalculate after changing assumptions. Older per-service estimates
  are labelled standalone and are not combined-network profit forecasts.
- Batch pricing previews selected routes relative to reference fares, then
  updates them together. It never changes historical results or cash.
- Batch timetable copy previews selected aircraft at the same base, generates
  unique flight numbers, applies per-aircraft spacing, shifts operating days
  when crossing midnight and rechecks conflicts/range/position/curfew on apply.
  Invalid aircraft are skipped, not overwritten; previously excluded rows cannot
  become silently included between preview and confirmation.

## Growth Opportunities

International level (2,500 DP) unlocks passenger charters: actual arrivals at the
target destination count passengers toward a five-day quota. Global level
(6,000 DP) unlocks long-term cargo: each of three acceptance-relative weeks has
its own delivery quota across a 21-day contract. Early bulk deliveries cannot
complete later weeks. Rewards still follow quoted operating costs and never
multiply ordinary flight income. Accepted contract timetable checks use the
same isolated forecast and actual progress rules; acceptance does not auto-plan.

## Verification and Limits

Regression coverage includes fare extremes, direction/window conservation,
online/offline funded operation, maintenance cancellations/recovery, repeated
DST hours, compact reload, departure locks, atomic pricing and timetable copies.
A 100-aircraft seven-day recurring forecast checks bounded save growth and no
live-state mutation. Desktop/mobile English/Chinese browser checks exercise
the real app with isolated local saves.

- TODO: calibrate coefficients against broader gameplay sessions and imported
  static traffic data as airports grow.
- TODO: add directional asymmetry, connection passengers and competition when
  multi-airline/alliance gameplay is introduced.
- TODO: introduce finer time-choice substitution without duplicating customers
  across adjacent windows; four-hour boundaries are deliberately simplified.
- TODO: forecast airline insolvency/subsidies at the same boundaries as live
  policy. Existing bankruptcy checks still happen at tick end; forecasts are
  operating scenarios, not insolvency guarantees. Simultaneous cash-dependent
  maintenance remains stable-ID ordered, not an optimization of scarce cash.
- Authenticated Supabase and live Vercel deployment need separate verification;
  local tests do not prove a production redeploy or cloud round trip.
