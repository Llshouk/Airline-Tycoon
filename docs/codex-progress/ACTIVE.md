# Codex Development Progress

## Repository State

- Repository: `Llshouk/Airline-Tycoon` (`https://github.com/Llshouk/Airline-Tycoon.git`)
- Branch: `main`
- Current version: `1.3.8`
- Current HEAD: `5cd17f5e056970984bc4c18e317a54cd681b9d16`
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
- Release-gate status: P0 blank-map defect, V1.2.2 fixture, slow/failed OSM, optional globe failures, and typed MapLibre expressions pass; V1.3.8 remains active because authenticated storage round trips, real touch/pinch input, full browser-offline mode, and the map lifecycle ownership audit remain unverified

## Current Objective

Checkpoint the live MapLibre tooltip-language repair, then continue the map effect and resource ownership audit without speculative runtime changes.

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
- Commit SHA: `3c7735dcd35696459afb332bffbefac87f90eb05`
- Test results: 20/20 normal desktop cycles, 20/20 rapid sequences, east/west wrapping, date-line geometry, canonical object selection, network-failure fallback, desktop and mobile viewport checks passed

### Automation-safe validation

- Issue: lint could not run in automation and no test script existed
- Root cause/design: Next 15's deprecated interactive lint command had no config; tile readiness had no pure regression seam
- Files changed: `package.json`, `pnpm-lock.yaml`, `eslint.config.mjs`, `tsconfig.tests.json`, `tests/leafletTileReadiness.test.ts`, `.gitignore`, `src/components/AircraftMarketScreen.tsx`
- Commit SHA: `3c7735dcd35696459afb332bffbefac87f90eb05`
- Test results: 4/4 focused tests pass; typecheck, lint, and production build pass

### V1.2.2 save compatibility proof

- Issue: the V1.3.8 release gate required evidence that a pre-V1.3 save preserves authoritative game data
- Root cause/design: V1.2.2 and current persistence files are byte-for-byte unchanged, but no executable fixture proved the current local/cloud restore and game normalization sequence
- Files changed: `src/store/gameStore.ts`, `tests/saveCompatibility.test.ts`, `tests/registerTestAliases.cjs`, `tsconfig.tests.json`, `package.json`, `eslint.config.mjs`
- Commit SHA: `ea3aaebfda3e3304d589afd2557a8ac76cc5fbab`
- Test results: the sanitized V1.2.2 compact fixture preserves airline, realistic difficulty, exact cash, multiple bases, fleet registration, cabin layout, route pricing, operational and weekly schedules, flight log, and timestamps

### Optional map-resource and slow-network hardening

- Issue: V1.3.8 required evidence that optional MapLibre resources cannot close the globe and that slow raster tiles do not reveal an unpainted 2D pane
- Root cause/design: error severity lived inside the provider and had no pure test seam; browser glyph caches made visual-only testing ambiguous
- Files changed: `src/lib/mapLibreErrorPolicy.ts`, `src/components/map/providers/MapLibreGlobeProvider.tsx`, `tests/mapLibreErrorPolicy.test.ts`, `package.json`, `tsconfig.tests.json`
- Commit SHA: `c0fdb870d27ce97931b3a78917d56a86cb3a1d95`
- Test results: failed NASA imagery retained vector Earth and all gameplay overlays; failed OpenFreeMap retained satellite Earth and all gameplay overlays; glyph/country errors classify optional; delayed OSM tiles kept the globe cover until real tiles arrived after 1.697s

### MapLibre expression type safety

- Issue: map style construction used `as never` to bypass MapLibre's generated style types, preventing compile-time detection of malformed expressions
- Root cause/design: expression arrays widened to generic arrays and shared symbol layout objects were inferred as readonly values instead of their declared MapLibre property types
- Files changed: `src/components/map/providers/MapLibreGlobeProvider.tsx`, `src/components/map/maplibreGlobeSatelliteStyle.ts`, `src/components/map/maplibreGlobeStyle.ts`
- Commit SHA: `5cd17f5e056970984bc4c18e317a54cd681b9d16`
- Test results: no `as never` remains under `src`; typecheck accepts all expressions; the real harness rendered satellite Earth, labels, routes, airports, and aircraft; a 3D to 2D to 3D round trip restored 18 tiles in 12ms and retained one globe canvas

### Live bilingual MapLibre tooltips

- Issue: changing the app language updated country labels but long-lived airport, route, and aircraft hover listeners kept the interaction labels captured during first map creation
- Root cause/design: the single-owner MapLibre mount effect intentionally has no language dependency, but its listener closures read `language` and `labels.interaction` directly instead of current-value refs
- Files changed: `src/components/map/providers/MapLibreGlobeProvider.tsx`, `src/app/map-harness/MapHarnessClient.tsx`
- Commit SHA: pending this green checkpoint; inspect repository HEAD after commit
- Test results: the same AMS tooltip changed from `Unopened Airport` to `未开通机场` while provider, canvas count, and MapLibre creation count remained unchanged; a subsequent 3D to 2D to 3D round trip restored 18 tiles in 14ms

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
- `src/store/gameStore.ts`: exports the existing pure load normalizer as a test seam without changing behavior
- `tests/saveCompatibility.test.ts`: sanitized V1.2.2 compact-save restore and field-preservation assertions
- `tests/registerTestAliases.cjs`: resolves compiled `@/` imports for Node's built-in test runner
- `src/lib/mapLibreErrorPolicy.ts`: pure fatal/optional/recoverable MapLibre error classification
- `tests/mapLibreErrorPolicy.test.ts`: optional glyph/vector/label, recoverable satellite, and fatal core-WebGL assertions
- `src/components/map/providers/MapLibreGlobeProvider.tsx`: consumes the shared error policy, uses declared MapLibre style types, and reads current language labels from stable listener refs
- `src/components/map/maplibreGlobeSatelliteStyle.ts`: declares country filters and label text as valid MapLibre expressions
- `src/components/map/maplibreGlobeStyle.ts`: restricts shared style mutations to scalar or valid MapLibre expression values
- `tsconfig.tests.json`: small CommonJS compile target for focused Node tests
- `src/app/map-harness/page.tsx`: production-404 guard for the real-component map fixture
- `src/app/map-harness/MapHarnessClient.tsx`: development-only real `GameMap` routes, flights, engine and EN/ZH controls, and canonical-selection output
- `docs/codex-progress/ACTIVE.md`: factual audit, evidence, gate status, and recovery handoff

## Tests Completed

- `pnpm run test`: passed, 8 tests and 0 failures, including V1.2.2 save restoration and MapLibre error policy
- `pnpm run typecheck`: passed, `tsc --noEmit`
- `pnpm run lint`: passed with 0 errors and 20 pre-existing warnings; the stale MapLibre language dependency warning is resolved
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
- Slow network: a local no-cache proxy delayed every OSM tile by 1.5s; at 500ms the globe cover remained over zero tiles, then 2D revealed six visible tiles after 1.697s without warning
- Optional MapLibre failures: failed NASA imagery, OpenFreeMap TileJSON, and uncached glyph URLs each retained one globe canvas and all eight core gameplay layers with 30 airport, three route-segment, and two aircraft features; canonical URLs were restored
- Error policy: OpenFreeMap/glyph/country-label failures classify optional, NASA/post-core failures recoverable, and pre-core WebGL context failure fatal
- Typed style initialization: no unsafe `as never` remains under `src`; the real development harness rendered a complete globe after hot reload, and a 3D to 2D to 3D round trip retained one active canvas and restored 18 visible raster tiles in 12ms
- Bilingual listener lifecycle: reproduced `language=zh` with an English AMS hover tooltip, then verified English and Chinese status text on one persistent MapLibre instance with no additional map creation
- Mobile portrait (390x844): no horizontal overflow; initial 2D/3D and 10 repeated cycles passed; controls did not overlap
- Mobile landscape (844x390): no horizontal overflow; initial 2D/3D and 10 repeated cycles passed
- Zoom controls: pointer zoom-in loaded zoom-level 3 tiles; zoom-out returned to minimum zoom and disabled correctly
- `git diff --check`: pending final diff review for this checkpoint

## Cross-Version Regression Status

| Area | Status |
| --- | --- |
| Saves | V1.2.2 compact save restore/normalize passed with all release-gate fields preserved |
| Authentication | Deployed V1.3.8 login gate renders; authenticated flow not exercised |
| Cloud save | Shared V1.2.2 payload restore passed; authenticated Supabase upsert/load not reverified |
| Local save | V1.2.2 state restore/normalize passed; actual IndexedDB rehydration not reverified |
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
| Maps | P0 fix plus switching, wrapping, geometry, interactions, slow/failed OSM, satellite, vector, glyph, and label policy checks passed |
| Mobile | Portrait/landscape layout and repeated switching passed; real touch/pinch pending |
| Offline/PWA | OSM failure path passed; full temporary-offline app-shell/save check pending |
| English | Same-instance MapLibre airport tooltip and map labels rendered correctly |
| Chinese | Same-instance MapLibre airport tooltip updated immediately without rebuilding the globe |

## Remaining Risks

- The V1.2.2 payload passes the shared restore/normalize path, but authenticated cloud upsert/load and actual IndexedDB browser rehydration have not been exercised in this session.
- Real touch panning, pinch zoom, and information-card scrolling were not available through the current desktop browser input surface.
- Full browser-offline mode could not be toggled because the available browser exposes no network-emulation capability; individual OSM, satellite, vector, and glyph endpoints were faulted instead.
- A complete effect-by-effect map resource ownership audit is still pending; existing hook dependency warnings must be assessed against Strict Mode and stale-closure behavior before any lifecycle cleanup.
- Production map verification is blocked by an unauthenticated Supabase gate in the available browser; local tests use the real map component without bypassing authentication.
- Lint succeeds with 20 existing warnings, primarily remaining hook dependency debt and intentional aircraft `<img>` fallback behavior; no new lint errors remain.

## Next Exact Action

Audit the remaining `GameMap` memo/effect dependency warnings, beginning with the weekly-schedule route-statistics signature, and prove whether any real update can be missed before changing it.

## Recovery Instructions

1. Read this file, then run `git status --short --branch` and `git log -3 --oneline`.
2. Confirm the checkpoint is on `main` and synchronized with `origin/main`.
3. Run `pnpm run test`, `pnpm run typecheck`, `pnpm run lint`, and `pnpm run build` before changing persistence code.
4. Inspect map effects and resource refs in `src/components/GameMap.tsx`, `src/components/map/MapView.tsx`, and `src/components/map/providers/MapLibreGlobeProvider.tsx`.
5. Verify Strict Mode ownership, cleanup, generations, timers, listeners, and observers, and leave version `1.3.8` until the complete acceptance matrix passes.
