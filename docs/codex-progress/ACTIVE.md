# Codex Development Progress

## Repository State

- Repository: `Llshouk/Airline-Tycoon` (`https://github.com/Llshouk/Airline-Tycoon.git`)
- Branch: `main`
- Current version: `1.3.8`
- Current HEAD: `38de9e33a19eb7dcaac2eb9dce51529b14702202`
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

Checkpoint explicit canonical-cash alias stripping and its regression test, then continue stabilization without speculative runtime changes.

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
- Commit SHA: `4dd8ef69bee82446a097c49fcc9acc60a05a5abd`
- Test results: the same AMS tooltip changed from `Unopened Airport` to `未开通机场` while provider, canvas count, and MapLibre creation count remained unchanged; a subsequent 3D to 2D to 3D round trip restored 18 tiles in 14ms

### Bilingual 2D airport popups

- Issue: Leaflet and Google airport popup HTML embedded English size, base-role, and network-status labels even when the active game language was Chinese
- Root cause/design: both providers shared a hard-coded popup builder that sat outside React's translation context; current translated labels now travel through the existing latest-render ref used by persistent map listeners
- Files changed: `src/components/GameMap.tsx`, `src/i18n/en.ts`, `src/i18n/zh.ts`
- Commit SHA: `ca5e6338c44638584367545c6dc4ec4d19bd3eed`
- Test results: the same LGW marker rendered `Airport size: Large`, `Not base airport`, and `Not connected yet` in English, then `机场规模: 大型`, `非基地机场`, and `尚未接入航线网络` in Chinese; provider remained `leaflet2d` with one map and 18 visible tiles

### Weekly route-statistics dependency audit

- Finding: the narrowed memo signature intentionally includes aircraft ID plus every schedule ID, route ID, and `updatedAt` value read by route statistics
- Evidence: supported schedule add/edit paths create or replace `updatedAt`, deletion changes the schedule-ID set, and save normalization supplies a fallback timestamp
- Result: no missed supported update was reproduced, so the warning remains documented and production behavior was not changed merely to silence lint

### Explicit globe memo dependency contracts

- Issue: airport, route, and aircraft memos passed the complete component props object into narrow data builders, so lint could not prove that their dependency lists covered every input
- Root cause/design: each builder now accepts a typed `Pick` containing only the fields it reads, and each memo constructs that input from the exact values in its dependency list
- Files changed: `src/components/GameMap.tsx`
- Commit SHA: `6432faa40b4c66788c225c434f10222ee9b42113`
- Test results: all three broad-props memo warnings are removed; lint falls from 20 to 17 warnings, the populated globe renders with one canvas and no runtime errors, and a 3D to 2D to 3D cycle restores 18 tiles in 13ms

### Effect-owned Leaflet recovery cancellation

- Issue: unmount cleanup could cancel an active tile wait, but the async restore still saw its map-switch generation as current and could start another retry against a removed Leaflet map
- Root cause/design: map generations protect engine reversals, while component unmount has no successor generation; the restore now also checks an effect-owned cancellation predicate at every async boundary and the cleanup invokes the latest wait handle through a stable callback
- Files changed: `src/components/GameMap.tsx`
- Commit SHA: `74a360c5a5b9f788f78ff4973cef7ba6a9c46070`
- Test results: the resource-cleanup warning is removed; 12 rapid 2D/3D reversals retained one map, TileLayer, and globe canvas; unmounting during return emitted no runtime error; a fresh 3D to 2D recovery restored 18 tiles in 17ms

### Explicit globe-fallback callback dependency

- Issue: `handleGlobeError` read the fallback callback through the complete props object, so lint could not verify the otherwise correct property-level dependency
- Root cause/design: the parent callback can change with the active translation function; `GameMap` now captures that exact callback value and depends on it directly
- Files changed: `src/components/GameMap.tsx`
- Commit SHA: `792714fcbc38aaa8ac2b1f9bdfd61d1e9c59fa7f`
- Test results: the broad-props callback warning is removed, leaving only the intentionally audited weekly-signature warning in `GameMap`; a real 2D/3D cycle completed with one canvas, 18 tiles restored in 12ms, and no runtime errors

### Unreachable legacy MapLibre airport popup

- Issue: `createAirportPopup` remained after V1.3.7 replaced its hover caller with the translated `createAirportTooltip` and replaced click popups with the React information card
- Root cause/design: source history and a repository-wide reference search prove the helper has no caller or unique current behavior, so only the dead function is removed
- Files changed: `src/components/map/providers/MapLibreGlobeProvider.tsx`
- Commit SHA: `6f7e73da4a29e7282ed84868ec590e71f29add25`
- Test results: lint falls from 15 to 14 warnings; EDI hover still renders through the active tooltip path with Chinese airport status, one globe canvas remains, and no runtime error is introduced

### Current-value AuthGate airline switching

- Issue: the memoized auth context could retain a switch handler created with an old online state or translation function
- Root cause/design: save-before-switch, cloud-slot refresh, and airline switching were ordinary render-time functions while the context memo omitted the switch handler; each operation is now a callback with exact dependencies and the context tracks the current switch callback
- Files changed: `src/components/AuthGate.tsx`
- Commit SHA: `1d2e224bd886436d861cd97ae7025376f70b9c28`
- Test results: the stale-handler warning is removed and lint falls from 14 to 13 warnings; the real unauthenticated gate renders the expected local Supabase configuration state without runtime errors; authenticated switching remains blocked on test credentials

### Current weekly-service flight-number defaults

- Issue: after creating or deleting a weekly service, the Schedule form could retain the just-used default flight number because airline name and selected aircraft ID had not changed
- Root cause/design: the default-number effect read total fleet schedules but did not depend on a schedule mutation; it now derives the total weekly-service count and depends only on that count plus exact airline/aircraft identifiers
- Files changed: `src/components/ScheduleScreen.tsx`
- Commit SHA: `fee702a674da9ac21e3ee1b280643a95c039dd75`
- Test results: the stale Schedule effect warning is removed and lint falls from 13 to 12 warnings; typecheck, focused tests, and production build pass; authenticated create/delete UI verification remains credential-gated

### Exact Schedule preview memo dependencies

- Issue: changing UI language rebuilt schedule blocks, conflict geometry, and demand validation even though the preview memo produces only canonical validation data
- Root cause/design: localization occurs when `showScheduleFailure` passes canonical errors through `localizeScheduleError`; the preview itself never reads `t`, so the unnecessary dependency is removed
- Files changed: `src/components/ScheduleScreen.tsx`
- Commit SHA: `75a8fb6a39cb0101e3d36ec58bc171472ef8d3b9`
- Test results: lint falls from 12 to 11 warnings; typecheck, focused tests, and production build pass with no validation behavior change

### Bilingual Schedule conflict-preview error

- Issue: the canonical overlap message reached `localizeScheduleError` without a matching branch, so Chinese users received the raw English fallback on save
- Root cause/design: the existing canonical-error localization boundary now maps that exact message to compiler-checked English and Chinese dictionary entries
- Files changed: `src/components/ScheduleScreen.tsx`, `src/i18n/en.ts`, `src/i18n/zh.ts`
- Commit SHA: `5a81aebd0d5fabdcd22f81a9e9197a7c93440903`
- Test results: dictionary parity typechecks and all focused tests, lint, and production build pass; triggering the conflict through the authenticated Schedule UI remains credential-gated

### Dead route-evaluation aircraft type import

- Issue: `routeEvaluation` imported `AircraftInstance` without any value- or type-level consumer
- Root cause/design: the evaluation system infers aircraft instances from game-state collections; repository history confirms the import has been unused since that system landed
- Files changed: `src/lib/routeEvaluation.ts`
- Commit SHA: `972e159a1d60a7febba143e282a94f610c934933`
- Test results: lint falls from 11 to 10 warnings; route evaluation typechecks and all focused tests and production build pass without scoring changes

### Dead schedule time imports

- Issue: `schedule.ts` imported `DAY_MS` and `turnaroundWaitMs` without any consumer
- Root cause/design: weekly wrapping uses minute-based `DAY_MINUTES`, while current block timing reads `model.turnaroundMinutes` directly; source history confirms neither import was ever used
- Files changed: `src/lib/schedule.ts`
- Commit SHA: `63e6d3ee8bd6439a5486ba58d8565810bdee26b1`
- Test results: lint falls from 10 to 8 warnings; schedule logic typechecks and all focused tests and production build pass without timing or conflict changes

### Dead game-store registration import

- Issue: `gameStore` imported the registration generator without using it
- Root cause/design: new games start with an empty fleet, the Aircraft Market owns proposed registration generation, and `buyAircraft` validates the explicit registration before creating each distinct aircraft record
- Files changed: `src/store/gameStore.ts`
- Commit SHA: `38de9e33a19eb7dcaac2eb9dce51529b14702202`
- Test results: lint falls from 8 to 7 warnings; the store typechecks and V1.2.2 compatibility tests and production build pass without purchase or registration changes

### Explicit canonical-cash alias stripping

- Issue: normalization intentionally removed four historical cash aliases through unused destructured bindings, obscuring a critical migration invariant and producing four lint warnings
- Root cause/design: `getCurrentCash` still reads legacy aliases in priority order, then `stripLegacyCashFields` explicitly removes `cash`, `capital`, `playerMoney`, and nested `airline` before the canonical `money` field is written
- Files changed: `src/store/gameStore.ts`, `tests/saveCompatibility.test.ts`
- Commit SHA: pending this green checkpoint; inspect repository HEAD after commit
- Test results: a new regression restores string legacy cash to exact canonical `money = 123,456,789` and proves all four duplicate fields are absent; 9/9 tests pass and lint falls from 7 to 3 warnings

## Files Modified

- `.gitignore`: excludes generated `.test-build/` output
- `package.json`: adds focused tests and replaces deprecated interactive lint with `eslint .`
- `pnpm-lock.yaml`: records direct `@eslint/eslintrc` development dependency
- `eslint.config.mjs`: adds Next core-web-vitals/TypeScript flat-compatible lint configuration and ignores generated artifacts
- `src/components/AircraftMarketScreen.tsx`: moves effects above the nullable-game early return to preserve hook ordering; removes one unused type import
- `src/components/AuthGate.tsx`: keeps save-before-switch, cloud-slot refresh, and the context switch action synchronized with current auth, network, and translation state
- `src/components/ScheduleScreen.tsx`: advances default outbound/return flight numbers when the total weekly-service count changes and localizes canonical overlap errors
- `src/components/GameMap.tsx`: accepts existing visible tile coverage, polls through fade completion, validates positive tile rectangles, clears terminal transition states, supplies current translations to 2D airport popups, declares exact globe-builder inputs, and cancels async recovery through the owning effect
- `src/components/map/MapView.tsx`: separates React pane ownership from Leaflet container ownership and moves the noninteractive 2D badge away from zoom controls
- `src/lib/leafletTileReadiness.ts`: pure rendered-tile visibility and coverage helpers
- `tests/leafletTileReadiness.test.ts`: regression tests for collapsed, offscreen, visible, and cached coverage
- `src/store/gameStore.ts`: exports the pure load normalizer, leaves registration generation with the market, and explicitly strips legacy cash aliases after migration
- `tests/saveCompatibility.test.ts`: sanitized V1.2.2 restore, field preservation, and canonical cash-alias migration assertions
- `tests/registerTestAliases.cjs`: resolves compiled `@/` imports for Node's built-in test runner
- `src/lib/mapLibreErrorPolicy.ts`: pure fatal/optional/recoverable MapLibre error classification
- `tests/mapLibreErrorPolicy.test.ts`: optional glyph/vector/label, recoverable satellite, and fatal core-WebGL assertions
- `src/components/map/providers/MapLibreGlobeProvider.tsx`: consumes the shared error policy, uses declared MapLibre style types, reads current language labels from stable listener refs, and no longer carries the superseded V1.3.0 airport-popup helper
- `src/components/map/maplibreGlobeSatelliteStyle.ts`: declares country filters and label text as valid MapLibre expressions
- `src/components/map/maplibreGlobeStyle.ts`: restricts shared style mutations to scalar or valid MapLibre expression values
- `src/i18n/en.ts`: English 2D airport popup labels, airport-size tiers, and Schedule overlap error
- `src/i18n/zh.ts`: Chinese 2D airport popup labels, airport-size tiers, and Schedule overlap error
- `src/lib/routeEvaluation.ts`: removes an unused aircraft-instance type import without changing evaluation logic
- `src/lib/schedule.ts`: removes two never-used time imports while preserving minute-based timetable calculations
- `tsconfig.tests.json`: small CommonJS compile target for focused Node tests
- `src/app/map-harness/page.tsx`: production-404 guard for the real-component map fixture
- `src/app/map-harness/MapHarnessClient.tsx`: development-only real `GameMap` routes, flights, engine and EN/ZH controls, and canonical-selection output
- `docs/codex-progress/ACTIVE.md`: factual audit, evidence, gate status, and recovery handoff

## Tests Completed

- `pnpm run test`: passed, 9 tests and 0 failures, including V1.2.2 save restoration, canonical cash alias migration, and MapLibre error policy
- `pnpm run typecheck`: passed, `tsc --noEmit`
- `pnpm run lint`: passed with 0 errors and 3 pre-existing warnings; all four intentional legacy-cash binding warnings are resolved
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
- Bilingual 2D popup lifecycle: reproduced a Chinese game with English-only LGW details, then verified complete English and Chinese popup labels after language changes while retaining one Leaflet map and 18 visible tiles
- Globe memo contracts: typed airport, route, and aircraft inputs rendered a populated globe with one canvas and no runtime errors; a 3D to 2D to 3D cycle retained one map and one TileLayer and restored 18 tiles in 13ms
- Leaflet cancellation ownership: 12 rapid reversals, an in-progress map unmount, and a fresh normal recovery completed without runtime errors, duplicate resources, or a stuck transition
- Globe fallback callback: callback identity is tied directly to the translated parent handler; a real engine cycle retained one map/canvas and produced no runtime error
- MapLibre airport hover ownership: source history confirms V1.3.7 replaced the legacy popup; EDI still renders through the translated active tooltip after its removal
- Auth gate callback ownership: unauthenticated local gate and configuration messaging render without runtime errors; authenticated save-before-switch remains an explicit credential-gated check
- Schedule defaults: immutable create/delete paths change total weekly-service count, which now recomputes the next outbound/return pair even when selected aircraft and airline are unchanged
- Schedule preview ownership: canonical conflict calculations no longer rebuild on language-only changes; submission remains the sole localization boundary
- Schedule conflict localization: the canonical preview-overlap sentence now resolves through matching English and Chinese dictionary keys
- Route evaluation type ownership: no evaluation score, recommendation, demand, or finance input changed; only an unreachable type import was removed
- Schedule time ownership: weekly wrapping, flight duration, turnaround blocks, and overlap detection retain their existing minute-based inputs after dead import removal
- Registration ownership: the Aircraft Market generates proposed registrations and the store continues to validate uniqueness while preserving one record per aircraft
- Canonical cash migration: legacy aliases remain readable on load, exact value is written to `money`, and duplicate top-level/nested aliases are removed before persistence
- Mobile portrait (390x844): no horizontal overflow; initial 2D/3D and 10 repeated cycles passed; controls did not overlap
- Mobile landscape (844x390): no horizontal overflow; initial 2D/3D and 10 repeated cycles passed
- Zoom controls: pointer zoom-in loaded zoom-level 3 tiles; zoom-out returned to minimum zoom and disabled correctly
- `git diff --check`: pending final diff review for this checkpoint

## Cross-Version Regression Status

| Area | Status |
| --- | --- |
| Saves | V1.2.2 compact save restore/normalize passed; canonical cash alias migration and duplicate-field stripping are regression-tested |
| Authentication | Deployed V1.3.8 and local configuration gates render; authenticated flow and airline switching not exercised |
| Cloud save | Shared V1.2.2 payload restore passed; authenticated Supabase upsert/load not reverified |
| Local save | V1.2.2 state restore/normalize passed; actual IndexedDB rehydration not reverified |
| Fleet | Harness renders owned aircraft data; gameplay workflow unchanged |
| Schedules | In-flight fixture renders; default numbering now follows weekly-service mutations; authenticated create/delete UI pass pending |
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
| English | MapLibre airport tooltip, map labels, and Leaflet airport popup rendered correctly |
| Chinese | MapLibre and Leaflet airport details render translated status; Schedule preview-overlap errors now have a compiler-checked Chinese mapping |

## Remaining Risks

- The V1.2.2 payload passes the shared restore/normalize path, but authenticated cloud upsert/load and actual IndexedDB browser rehydration have not been exercised in this session.
- Real touch panning, pinch zoom, and information-card scrolling were not available through the current desktop browser input surface.
- Full browser-offline mode could not be toggled because the available browser exposes no network-emulation capability; individual OSM, satellite, vector, and glyph endpoints were faulted instead.
- A complete effect-by-effect map resource ownership audit is still pending; existing hook dependency warnings must be assessed against Strict Mode and stale-closure behavior before any lifecycle cleanup.
- Production map verification is blocked by an unauthenticated Supabase gate in the available browser; local tests use the real map component without bypassing authentication.
- Lint succeeds with 3 existing warnings: the intentionally narrowed GameMap schedule signature and two aircraft `<img>` fallback warnings; no new lint errors remain.

## Next Exact Action

Document the audited `GameMap` weekly-schedule signature at the hook boundary so lint accepts the intentional narrow dependency without broad fleet recomputation.

## Recovery Instructions

1. Read this file, then run `git status --short --branch` and `git log -3 --oneline`.
2. Confirm the checkpoint is on `main` and synchronized with `origin/main`.
3. Run `pnpm run test`, `pnpm run typecheck`, `pnpm run lint`, and `pnpm run build` before changing persistence code.
4. Inspect map effects and resource refs in `src/components/GameMap.tsx`, `src/components/map/MapView.tsx`, and `src/components/map/providers/MapLibreGlobeProvider.tsx`.
5. Verify Strict Mode ownership, cleanup, generations, timers, listeners, and observers, and leave version `1.3.8` until the complete acceptance matrix passes.
