# Code Health Review

Date: 2026-10-02. Baseline: V1.4.0, `8b696cd` on `main`.

The project has some dead scaffolding and duplicated work, but the working game does not warrant a rewrite. Size alone is not evidence of redundancy.

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
- Owned-aircraft detail profit still derives from the bounded recent log, so its existing lifetime label can undercount old operations. Adding a cumulative per-aircraft profit field needs an explicit compatibility policy; this release does not invent historical values.
- Game normalization still rebuilds several derived objects frequently. Profile a large fleet before changing memoization or state ownership.
- Grounded flights are retained rather than silently deleted. A later cancellation/rebooking workflow should make long grounding backlogs manageable.

## Dependency Safety

The current production audit found new advisories after the July baseline: Next.js Windows/image optimization issues, MapLibre attribution sanitization, Sharp/libheif, and PostCSS/nanoid. Patched versions are Next.js/ESLint config 15.5.24, Sharp 0.35.4, PostCSS 8.5.23, and MapLibre 6.4.1. The production audit now reports no known vulnerabilities. MapLibre's migration is limited to module/worker/type compatibility; 5 desktop and 3 mobile engine cycles, gameplay overlays, 2D zoom, and production worker/shared HTTP responses pass. Generated library files and their license are rebuilt by Next configuration and ignored by Git.

Sources: [Next.js advisory](https://github.com/advisories/GHSA-p293-qw3h-jr36), [image optimization advisory](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4), [MapLibre advisory](https://github.com/advisories/GHSA-jrc7-96c5-q579), [official migration guide](https://github.com/maplibre/maplibre-gl-js/blob/v6.0.0/docs/guides/v5-to-v6-migration-guide.md).
