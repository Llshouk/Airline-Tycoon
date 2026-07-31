# Codex Development Progress

## Repository State

- Repository: `Llshouk/Airline-Tycoon` (`https://github.com/Llshouk/Airline-Tycoon.git`)
- Branch: `main`
- Current version: `1.3.8`
- Audit-start HEAD: `490559e558544438dbc397a6b83e3cf4e08873bf`
- Working-tree status: green V1.3.8 checkpoint pending commit
- Audit date: 2026-07-31
- Latest successful production build: `pnpm run build` passed on 2026-07-31 with Next.js 15.5.19
- Package manager: pnpm; `pnpm-lock.yaml` is authoritative and no npm/Yarn lockfile is present
- No earlier `ACTIVE.md` or WIP patch existed at audit start

## Roadmap Position

- Current major version: V1
- Current minor version: V1.3.8
- Current release objective: complete deterministic 2D/3D map stabilization and the V1.3.8 acceptance matrix
- Completed roadmap systems: airline setup, fleet and aircraft market, routes, schedules, cabin configuration, finance basics, local/cloud saves, bilingual UI, Leaflet 2D map, and optional MapLibre globe
- Partially implemented systems: V1.3 map acceptance coverage and automated regression infrastructure
- Next planned release: V1.3.9 final map stability, only after every V1.3.8 release gate is verified
- Release-gate status: P0 blank-map defect fixed locally; V1.3.8 remains active because save compatibility, real touch/pinch input, and several optional-resource failure cases remain unverified

## Current Objective

Checkpoint the deterministic Leaflet restore repair, then verify a sanitized pre-V1.3 save through the current compatibility/load path without changing the save schema.

## Confirmed Problems

### React removed Leaflet's imperative container classes during engine switches

- Severity: P0 blank/white map
- Reproduction: load the real map in 2D, switch 2D to 3D to 2D repeatedly; the third measured cycle remained covered and the underlying loaded tile images rendered at zero width
- Observed behavior: React and Leaflet owned the same DOM node; a transition-class rerender replaced Leaflet's `leaflet-container` classes. Tailwind's image `max-width: 100%` then collapsed 256px tiles to zero rendered width
- Expected behavior: React owns pane transitions while Leaflet exclusively owns its map container classes and resources
- Relevant files: `src/components/map/MapView.tsx`, `src/components/GameMap.tsx`
- Evidence: tile images were complete with `naturalWidth=256`; after the switch the DOM node lacked Leaflet classes and tile rectangles had width zero. A nested Leaflet-owned node preserves the full class list and 256px tile rectangles through repeated switches

### Cached/faded tiles could miss the readiness event window

- Severity: P1 transition race
- Reproduction: return from a fully loaded globe to cached 2D tiles repeatedly
- Observed behavior: the tile layer was added before readiness listeners attached, readiness required a newly observed `tileload`, and a single post-event opacity check could occur during Leaflet's fade animation
- Expected behavior: current, complete, positive-size tiles intersecting the viewport satisfy readiness whether or not their load event occurred before subscription
- Relevant files: `src/components/GameMap.tsx`, `src/lib/leafletTileReadiness.ts`
- Evidence: pre-fix generations logged loaded base tiles but timed out at approximately 3.4s, 3.0s, and 3.0s; post-fix returns complete in at most 14ms in the final 20-cycle desktop run

### A terminal tile failure left the globe cover permanently active

- Severity: P0 unexplained covered map
- Reproduction: force all OSM tile requests to fail during a 3D-to-2D transition
- Observed behavior: a `false` readiness result and the exception path did not clear `mapTransitionState` or `globeWasActiveRef`
- Expected behavior: bounded recovery reveals the connected 2D map with an understandable warning; it must never leave an infinite transition cover
- Relevant files: `src/components/GameMap.tsx`
- Evidence: fault injection to an unreachable local tile endpoint now ends with provider `leaflet2d`, no preparing status, Leaflet opacity 1, globe cover removed, one map/layer, and `Base map tiles are temporarily unavailable.`

### The project lint command was interactive and deprecated

- Severity: P2 release tooling
- Reproduction: run the original `pnpm run lint`
- Observed behavior: `next lint` requested interactive setup and exited before linting
- Expected behavior: a deterministic, noninteractive lint command
- Relevant files: `package.json`, `eslint.config.mjs`, `pnpm-lock.yaml`, `src/components/AircraftMarketScreen.tsx`
- Evidence: `eslint .` now exits successfully with zero errors. It also found and prompted the narrow repair of conditionally called Aircraft Market effects

## Current Hypotheses

### Pre-V1.3 save compatibility should be unchanged by this iteration

- Suspected result: existing saves continue to load because no game-state type, persistence key, migration, Supabase query, or IndexedDB schema changed
- Supporting evidence: all source changes are map UI lifecycle, test/tooling, and hook ordering
- Evidence against it: no sanitized pre-V1.3 fixture has yet been exercised through the current load normalizer
- Smallest testable change: locate or construct a non-private pre-V1.3 fixture and run it through the existing compatibility helper with field-preservation assertions
- Rollback plan: remove only the fixture/test if it cannot represent the historical schema accurately; do not alter production migration logic without a reproduced failure

## Completed Work

### Deterministic Leaflet restoration checkpoint

- Issue: repeated 3D-to-2D switches could expose a blank map or permanent globe cover
- Root cause: shared React/Leaflet DOM ownership removed imperative classes; readiness missed cached events and fade completion; terminal failure did not reveal the fallback map
- Files changed: `src/components/GameMap.tsx`, `src/components/map/MapView.tsx`, `src/lib/leafletTileReadiness.ts`, focused tests and development-only map harness
- Commit SHA: this green checkpoint; inspect the current repository HEAD after commit
- Test results: 20/20 normal desktop cycles, 20/20 rapid sequences, east/west wrapping, date-line geometry, canonical object selection, network-failure fallback, desktop and mobile viewport checks passed

### Automation-safe validation

- Issue: lint could not run in automation and no test script existed
- Root cause/design: Next 15's deprecated interactive lint command had no config; tile readiness had no pure regression seam
- Files changed: `package.json`, `pnpm-lock.yaml`, `eslint.config.mjs`, `tsconfig.tests.json`, `tests/leafletTileReadiness.test.ts`, `.gitignore`, `src/components/AircraftMarketScreen.tsx`
- Commit SHA: this green checkpoint; inspect the current repository HEAD after commit
- Test results: 4/4 focused tests pass; typecheck, lint, and production build pass

## Files Modified

- `.gitignore`: excludes generated `.test-build/` output
- `package.json`: adds focused tests and replaces deprecated interactive lint with `eslint .`
- `pnpm-lock.yaml`: records direct `@eslint/eslintrc` development dependency
- `eslint.config.mjs`: adds Next core-web-vitals/TypeScript flat-compatible lint configuration and ignores generated artifacts
- `src/components/AircraftMarketScreen.tsx`: moves effects above the nullable-game early return to preserve hook ordering; removes one unused type import
- `src/components/GameMap.tsx`: accepts existing visible tile coverage, polls through fade completion, validates positive tile rectangles, and clears all terminal transition states
- `src/components/map/MapView.tsx`: separates React pane ownership from Leaflet container ownership and moves the noninteractive 2D badge away from zoom controls
- `src/lib/leafletTileReadiness.ts`: pure rendered-tile visibility and coverage helpers
- `tests/leafletTileReadiness.test.ts`: regression tests for collapsed, offscreen, visible, and cached coverage
- `tsconfig.tests.json`: small CommonJS compile target for Node's built-in test runner
- `src/app/map-harness/page.tsx`: production-404 guard for the real-component map fixture
- `src/app/map-harness/MapHarnessClient.tsx`: development-only real `GameMap` routes, flights, engine controls, and canonical-selection output
- `docs/codex-progress/ACTIVE.md`: factual audit, evidence, gate status, and recovery handoff

## Tests Completed

- `pnpm run test`: passed, 4 tests and 0 failures
- `pnpm run typecheck`: passed, `tsc --noEmit`
- `pnpm run lint`: passed with 0 errors and 21 pre-existing warnings
- `pnpm run build`: passed, optimized Next.js production build generated successfully
- Production harness containment: `GET /map-harness` returned HTTP 404 from `next start`
- Initial desktop 2D: passed with 18 visible 256px OSM tiles, 10 route paths, 150 wrapped airport markers, 10 wrapped aircraft markers, one attribution, one map, and one TileLayer
- Initial desktop 3D: passed with satellite globe, route/airport/aircraft layers, one MapLibre canvas, and non-fatal optional resource errors
- Normal switching: 20/20 final desktop cycles passed; maximum measured 2D return was 14ms
- Rapid switching: 20/20 sequences of 2D to 3D to 2D to 3D to 2D passed with one Leaflet map, one TileLayer, one MapLibre canvas, and no stuck transition
- Horizontal wrapping: keyboard-panned east beyond three worlds and west beyond three worlds; tiles and bounded overlay copies repeated, attribution remained single, and copies did not accumulate
- Canonical selection: wrapped LAX airport, LHR-HKG route, LAX-HND date-line route, and N-HARN aircraft returned canonical fixture IDs
- Date line: LAX-HND rendered as edge-split shortest segments with visible aircraft copies and destination-facing heading
- Network failure: unreachable OSM endpoint produced bounded recovery, understandable warning, and a revealed 2D pane without infinite loading; the canonical URL was restored before build
- Mobile portrait (390x844): no horizontal overflow; initial 2D/3D and 10 repeated cycles passed; controls did not overlap
- Mobile landscape (844x390): no horizontal overflow; initial 2D/3D and 10 repeated cycles passed
- Zoom controls: pointer zoom-in loaded zoom-level 3 tiles; zoom-out returned to minimum zoom and disabled correctly
- `git diff --check`: pending final diff review for this checkpoint

## Cross-Version Regression Status

| Area | Status |
| --- | --- |
| Saves | Pending sanitized pre-V1.3 fixture test; no schema or persistence code changed |
| Authentication | Deployed V1.3.8 login gate renders; authenticated flow not exercised |
| Cloud save | Not reverified; Supabase code unchanged |
| Local save | Not reverified; local/IndexedDB code unchanged |
| Fleet | Harness renders owned aircraft data; gameplay workflow unchanged |
| Schedules | In-flight fixture renders; scheduling workflow unchanged |
| Routes | Wrapped and date-line route rendering/clicks passed |
| Cabin configuration | Not reverified; no related code changed |
| Airport board | Not reverified; no related code changed |
| Delay system | Not reverified; no related code changed |
| Route evaluation | Not reverified; no related code changed |
| Operating economics | Existing V1 basics only; V1.4 not started |
| Maintenance | Not implemented; V1.5 roadmap |
| Reputation | Not implemented; V1.6 roadmap |
| Competition | Not implemented; V2 roadmap |
| Events | Not implemented; V3 roadmap |
| Maps | P0 fix and desktop/mobile switch, wrap, geometry, interaction, and OSM failure checks passed |
| Mobile | Portrait/landscape layout and repeated switching passed; real touch/pinch pending |
| Offline/PWA | OSM failure path passed; full temporary-offline app-shell/save check pending |
| English | Existing map strings rendered correctly; no new production strings added |
| Chinese | Translation files unchanged; Chinese map workflow not manually reverified |

## Remaining Risks

- A pre-V1.3 save has not yet been exercised through local, IndexedDB, or cloud compatibility paths.
- Real touch panning, pinch zoom, and information-card scrolling were not available through the current desktop browser input surface.
- Slow network, failed satellite/OpenFreeMap/glyph/country-label requests, and full temporary-offline behavior have not each been isolated, although observed optional MapLibre resource errors remained non-fatal.
- Production map verification is blocked by an unauthenticated Supabase gate in the available browser; local tests use the real map component without bypassing authentication.
- Lint succeeds with 21 existing warnings, primarily hook dependency debt and intentional aircraft `<img>` fallback behavior; no new lint errors remain.

## Next Exact Action

Locate the historical save compatibility/defaulting helper and add a sanitized pre-V1.3 fixture test that verifies cash, bases, fleet registrations, cabin layouts, routes, schedules, and difficulty survive normalization.

## Recovery Instructions

1. Read this file, then run `git status --short --branch` and `git log -3 --oneline`.
2. Confirm the checkpoint is on `main` and synchronized with `origin/main`.
3. Run `pnpm run test`, `pnpm run typecheck`, `pnpm run lint`, and `pnpm run build` before changing persistence code.
4. Inspect save/defaulting code in `src/store`, IndexedDB helpers, and Supabase save/load modules; do not inspect browser storage or use private account data.
5. Build a sanitized historical fixture from repository schema/history, assert compatibility through existing helpers, and leave version `1.3.8` until the complete acceptance matrix passes.
