# Map Route Opening

Local development after V1.7.0; no release number or save schema changes.

- Airport selection in either map engine enters one route-opening dialog,
  preserving the selected destination. Players can change origin base or
  destination and explicitly open the route. Selecting the origin itself
  leaves destination unset, rather than proposing a same-airport route.
- No revenue sorting, profitable-route ranking, evaluation grade, demand
  forecast or profit prediction appears in the opening flow. Established
  routes and Finance retain their existing operational analysis.
- Rows show each owned aircraft independently. Range, home base, position,
  grounding and active maintenance failures are distinct from a full timetable.
- Availability means at least one additional weekly round trip fits during
  the next seven simulation days. The search requires contiguous flight and
  turnaround time, checks recurring weekly occupancy including week wrapping,
  one-off flights and reserved maintenance, and uses the real timetable
  validator for candidate slots, including optional airport curfews.
- Dated recurring cancellations do not free permanent weekly capacity.
  Cancelled one-off flights do not occupy time. A displayed slot is a preview,
  not a reservation or automatic timetable change; scheduling still uses the
  existing validator when saved.
- Opening costs, canonical cash, range requirements and duplicate-route checks
  remain owned by the existing store action. A full fleet does not prevent
  opening a route for future aircraft; it cannot be advertised as schedulable.
- Airport flight boards and base management remain secondary dialog actions.
  The old opportunity list and empty launch-video placeholder were removed.

## Verification

149 automated tests, typecheck, zero-warning lint and production build pass.
Actual development/production browser checks at 1440px and 390x844 cover
destination preservation, direct pointer activation, availability/full labels,
absence of financial hints, exact opening-cost deduction, duplicate protection,
unchanged aircraft/timetables, English/Chinese, reload and horizontal overflow.
The cabin-product browser regression also passes in production at both widths.
No new runtime errors; the existing favicon 404 is excluded. Live Supabase and
physical-device touch remain unverified. The user authorized main-branch
commit/push without a version bump; see docs/codex-progress/ACTIVE.md.
