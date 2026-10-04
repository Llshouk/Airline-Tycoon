# Code Health Review

Date: 2026-10-02. Baseline: V1.4.0, `8b696cd` on `main`.

The project has some dead scaffolding and duplicated work, but the working game does not warrant a rewrite. Size alone is not evidence of redundancy.

## V1.5.2 Follow-Up (2026-10-04)

- Company age reuses the existing game clocks instead of storing another timer.
- Finance sorting is a small pure helper and local UI state; it adds no persisted
  sort fields and never clones or merges aircraft records.
- The shared economics owner handles the earnings change for previews and
  settlements; no duplicate calculator or new dependency was introduced.
- Cost-unit calibration, fixed overhead and shared route-market allocation
  remain explicit TODOs in `docs/economy-balance.md`, not partial new engines.

## Removed or Reduced

- Removed the unused Windows-only `scripts/run-node-bin.ps1`; package scripts remain cross-platform.
- Removed unreferenced Google/Apple null providers and the unused future-globe alias. Active Google integration in `GameMap` and the working Leaflet/MapLibre providers remain intact.
- Removed the unused `aircraftEconomics.ts` projection wrapper and its sole unused result type. Shared route economics remains authoritative.
- Cloud load previously normalized the same payload repeatedly for restoration and metadata. It now normalizes once and reuses the result.
- Completed flights no longer copy the entire derived economics/demand preview into operational schedule records. Only actual accounting values are persisted for new settlements.
- Per-aircraft flight advancement now has one chronological owner, `aircraftOperations.ts`, which integrates maintenance without adding another independent settlement loop to the store.
- Dashboard lifetime accounting no longer re-sums a truncated recent-flight log; it uses canonical profit and aircraft cumulative revenue.
- The temporary maintenance browser fixture was removed after verification. Build output, test output, environment files, logs, and caches remain ignored.

## Deliberately Retained

- `GameMap`, the globe provider, and Schedule are large, but their wrapping, lifecycle, optional-resource fallback, selection, timetable, and preview logic is active. Future extraction should follow ownership and regression tests, not arbitrary line-count targets.
- Legacy cash/save migrations are compatibility code, not dead code. Removing them would risk old saves.
- Development-only `map-harness` is an existing regression fixture and returns 404 in production.
- Aircraft image fallbacks, individual registrations, and independent aircraft records are unchanged.

## Follow-Up Risks

- Parts of the existing Chinese dictionary contain mojibake and some older screens still have English strings. All new maintenance strings render correctly; a focused localization repair is needed separately.
- Resolved in the 2026-10-03 follow-up: owned-aircraft detail profit now uses an additive cumulative field. Legacy aircraft with missing history are marked partial rather than assigned invented historical profit.
- Game normalization still rebuilds several derived objects frequently. Profile a large fleet before changing memoization or state ownership.
- Grounded flights are retained rather than silently deleted. A later cancellation/rebooking workflow should make long grounding backlogs manageable.

## Maintenance Follow-Up (2026-10-03)

- Reservations and cancellation recovery extend the existing per-aircraft timeline; no second settlement loop, extra cash field, new dependency, or independent fleet-group state was introduced.
- One planner serves both individual and batch booking; one quote function supplies cost/duration to actions, previews, and timetable blocks.
- Future cancellations are bounded by the existing two-week generation horizon and retained as tombstones until their dates pass. Historical events still use the existing age/count limits.
- New instant and reserved maintenance cancel conflicting dated flights while preserving weekly templates. Old active maintenance tasks retain their original delay behavior for compatibility.
- Whole-GBP shortfalls remove cash drift after normalization. Persistent processed-time watermarks prevent pruned dated events from resurrecting.
- Cross-aircraft affordability during large catch-up still follows the existing stable fleet-processing order, not a new globally sorted event engine. A global event queue and profiling very large offline catch-up remain future work.
- No broad map, auth, translation or gameplay rewrite was made. A missing favicon remains an unrelated baseline 404; new maintenance UI did not produce JavaScript runtime errors.

## Dependency Safety

The current production audit found new advisories after the July baseline: Next.js Windows/image optimization issues, MapLibre attribution sanitization, Sharp/libheif, and PostCSS/nanoid. Patched versions are Next.js/ESLint config 15.5.24, Sharp 0.35.4, PostCSS 8.5.23, and MapLibre 6.4.1. The production audit now reports no known vulnerabilities. MapLibre's migration is limited to module/worker/type compatibility; 5 desktop and 3 mobile engine cycles, gameplay overlays, 2D zoom, and production worker/shared HTTP responses pass. Generated library files and their license are rebuilt by Next configuration and ignored by Git.

Sources: [Next.js advisory](https://github.com/advisories/GHSA-p293-qw3h-jr36), [image optimization advisory](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4), [MapLibre advisory](https://github.com/advisories/GHSA-jrc7-96c5-q579), [official migration guide](https://github.com/maplibre/maplibre-gl-js/blob/v6.0.0/docs/guides/v5-to-v6-migration-guide.md).
