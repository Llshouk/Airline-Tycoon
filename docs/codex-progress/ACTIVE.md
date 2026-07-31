# Codex Development Progress

## Repository State

- Repository: `Llshouk/Airline-Tycoon` (`https://github.com/Llshouk/Airline-Tycoon.git`)
- Branch: `main`
- Current version: `1.3.9`
- V1.3.9 baseline HEAD: `e1a2225b9cce5870be4bee647f823d8f86e69e17`
- Current release checkpoint: the V1.3.9 release commit containing this document
- Audit-start HEAD: `490559e558544438dbc397a6b83e3cf4e08873bf`
- Working-tree status: green V1.3.9 release checkpoint
- Audit date: 2026-07-31
- Latest successful production build: `pnpm run build` passed on 2026-07-31 with Next.js 15.5.21
- Package manager: pnpm; `pnpm-lock.yaml` is authoritative and no npm/Yarn lockfile is present
- No earlier `ACTIVE.md` or WIP patch existed at audit start

## Roadmap Position

- Current major version: V1
- Current minor version: V1.3.9
- Current release objective: V1.3 map stabilization complete; proceed to V1.4.0 Operating Economics
- Completed roadmap systems: airline setup, fleet and aircraft market, routes, schedules, cabin configuration, finance basics, local/cloud saves, bilingual UI, Leaflet 2D map, and optional MapLibre globe
- Partially implemented systems: V1 operating economics beyond the existing basic estimates
- Next planned release: V1.4.0 Operating Economics
- Release-gate status: V1.3.8 stabilization accepted with no reproducible P0 or core P1 map defect; V1.3.9 final lifecycle, cleanup, automated, browser, build, and security gates pass

## Current Objective

Release V1.3.9, then audit and centralize the existing revenue, cost, frequency, and completed-flight cash paths for V1.4.0.

## Resolved V1.3 Problems

### Leaflet base-layer teardown retained callbacks after 3D-to-2D restore

- Severity: P1 map interaction runtime error
- Reproduction: on a fresh harness, switch 2D to 3D to 2D once, wait for visible Leaflet tiles, then use the zoom-in control; keyboard panning triggers the same stale callback path
- Observed behavior: a removed `GridLayer` still received `zoomanim` or `viewreset`, then threw while reading `project` or `getCenter` from its null internal map
- Expected behavior: replacing a TileLayer must let Leaflet detach its map callbacks before application-specific listeners are cleared
- Relevant files: `src/components/GameMap.tsx`, `src/lib/leafletLayerLifecycle.ts`
- Evidence: `Layer._layerAdd` registers map cleanup through `once("remove", ...)`; calling `off()` before `remove()` erased that cleanup hook and left the map subscribed to a layer whose `_map` was subsequently nulled

### Production dependency audit reports patched security advisories

- Severity: P1 security maintenance
- Reproduction: run `pnpm audit --prod` against the resolved V1.3.8 dependency tree
- Observed behavior: the audit reports six high and six moderate advisories across `next@15.5.19` and its resolved `sharp@0.34.5` and PostCSS dependencies
- Expected behavior: update within the compatible Next.js 15 release line and resolve transitive packages to verified patched versions without changing gameplay
- Relevant files: `package.json`, `pnpm-lock.yaml`
- Evidence: the registry audit identified `next@15.5.21`, Sharp `0.35.0+`, and PostCSS `8.5.18` as patched; the resolved checkpoint uses Next `15.5.21`, Sharp `0.35.3`, and PostCSS `8.5.18` and reports no known vulnerabilities

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

## V1.3.8 Exit Decision

- Classification: Case B; no reproducible P0 or core P1 map defect remains
- Evidence: the focused baseline passed frozen installation, dependency audit, 12/12 tests, typecheck, zero-warning lint, and production build before V1.3.9 changes
- Compatibility: the existing V1.2.2 compact-save and IndexedDB adapter regressions preserve canonical cash, difficulty, bases, fleet, registrations, cabin layout, routes, schedules, flight log, and timestamps
- Decision: V1.3.8 stabilization is accepted; unavailable optional external checks are recorded separately and do not block V1.3.9 or V1.4.0

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

- Finding: route statistics consume aircraft identity plus schedule identity, route, operating-day count, and round-trip state
- Root cause/design: the narrowed signature now encodes those exact fields instead of relying on `updatedAt`; a focused hook comment documents why unrelated fleet changes must not invalidate the memo
- Files changed: `src/components/GameMap.tsx`
- Commit SHA: `41119863a7b4c6b75012bb8651b5a82dc76b910f`
- Test results: the final GameMap warning is resolved; one globe canvas and one Leaflet map/TileLayer remain healthy, 18 tiles settle after a 3D to 2D return, 9/9 tests pass, and no runtime error is introduced

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
- Commit SHA: `21910f0f7c0bf775b0867a877fa46febf5e1b80d`
- Test results: a new regression restores string legacy cash to exact canonical `money = 123,456,789` and proves all four duplicate fields are absent; 9/9 tests pass and lint falls from 7 to 3 warnings

### Optimized aircraft images with preserved fallbacks

- Issue: the two shared aircraft image components used raw `<img>` elements, leaving the final two lint warnings and bypassing Next.js image sizing and optimization
- Root cause/design: both components already own stable relative containers and source-specific failure state; `next/image` now fills those containers with `object-contain`, keeps the same `onError` fallback, and preserves side-image scale and offset transforms
- Files changed: `src/components/AircraftImage.tsx`, `src/components/AircraftSideImage.tsx`
- Commit SHA: `40f11fd75875bd33cbbf9a0f8d012d38d68762e0`
- Test results: valid A220 market and side images render uncropped, an intentionally missing image resolves to the existing localized placeholder, lint is clean with zero warnings, 9/9 tests pass, and the production build succeeds

### Map effect and resource ownership audit

- Finding: every currently owned Leaflet and MapLibre listener, observer, timer, animation frame, popup, layer, and map instance has a deterministic cleanup owner; `MapView` owns no imperative resource
- Evidence/design: source review covered every map-related effect and async boundary; a delayed aircraft-icon experiment produced no retained resource or post-unmount exception and was fully reverted because no defect was reproduced
- Files changed: `docs/codex-progress/ACTIVE.md`
- Commit SHA: `f6429833a3fd960a1c703244740f5d8cb1b12e38`
- Test results: three additional settled 2D/3D cycles retained one Leaflet map, one TileLayer, and one globe canvas; route unmount reduced all map roots, Leaflet containers, and MapLibre canvases to zero with no console error

### Production app-shell outage and recovery

- Finding: the production service worker serves a complete hydrated app shell after the same-origin Next server becomes unavailable, then returns cleanly to the network response after reconnection
- Evidence/design: V1.3.8 was loaded once from `next start`, the listening process was stopped, `/` reloaded with the complete auth UI and no console error, and a second reload after server restart remained healthy
- Files changed: `docs/codex-progress/ACTIVE.md`
- Commit SHA: `1192082002b542b26d4b02bf2a1177c42b78d998`
- Test results: production build output on port 3100 survived a real origin outage and reconnection; no service-worker runtime change was made because the tested shell already passed

### Legacy cash preservation through cloud restoration

- Issue: a cloud payload that predated canonical `money` could contain `cash`, `capital`, `playerMoney`, or nested airline cash, but cloud normalization replaced every variant with zero before store migration could inspect it
- Root cause/design: cloud normalization read only `raw.money`; it now calls the same `getCurrentCash` helper used by the store, and that helper explicitly accepts partial legacy payloads
- Files changed: `src/lib/cash.ts`, `src/lib/cloudSave.ts`, `tests/saveCompatibility.test.ts`
- Commit SHA: `ceb4c95557890f9bcf0d2ceccf8f3e1972e63b49`
- Test results: the regression first failed with `0 !== 123456789`; all five aliases now restore to their exact canonical value, duplicate fields remain absent, and 10/10 tests pass

### Pre-V1.3 IndexedDB adapter restoration

- Issue: save compatibility had been proved only against the shared normalization functions, not against the asynchronous IndexedDB adapter used by Zustand in the browser
- Root cause/design: no production defect was found; a development-only standards-compatible IndexedDB test now writes a sanitized V1.2 persistence envelope through `gameSaveStorage`, reads back the exact value without local-save fallback, and runs it through the production restore path
- Files changed: `package.json`, `pnpm-lock.yaml`, `tsconfig.tests.json`, `tests/gameSaveStorage.test.ts`
- Commit SHA: `36f1efcea692a0c0a841e9b43a55bf170df4638b`
- Test results: the real adapter preserved cash, bases, registration, cabin layout, weekly schedule, route, and difficulty; 11/11 tests pass

### Production dependency security remediation

- Issue: the production tree resolved framework, image-processing, and CSS-processing versions covered by 12 registry advisories
- Root cause/design: Next remained on `15.5.19`, while its exact optional/transitive ranges retained vulnerable Sharp and PostCSS copies; compatible root pins plus parent-scoped pnpm overrides now converge each package to one patched version without a major framework upgrade
- Files changed: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`
- Commit SHA: `1733976d2cbfa3df63dd3b1c7a34c7f39a6d291d`
- Test results: frozen install, 11/11 tests, typecheck, lint, and Next `15.5.21` production build pass; `pnpm audit --prod` reports no known vulnerabilities; the production image optimizer returns the A220 JPEG with HTTP 200 using Sharp `0.35.3` and libvips `8.18.3`

### Guarded live cloud-save acceptance command

- Issue: authenticated Supabase upsert/load/uniqueness acceptance remained a manual, credential-gated release step with no repeatable command or protection against overwriting a real save
- Root cause/design: the application correctly owns user-facing cloud persistence, but acceptance needs a disposable-account harness that uses the same `user_id,difficulty` conflict target and proves insert, update, canonical cash, one-row uniqueness, delete, and cleanup without printing credentials
- Files changed: `package.json`, `scripts/verify-cloud-save.mjs`
- Commit SHA: `b6f750ca6bcad809ef5816738624c8a5087c6eeb`
- Test results: script syntax and help pass; missing credentials and a non-root Supabase URL fail before network access; frozen install, 11/11 tests, typecheck, zero-warning lint, production build, and production dependency audit pass. The authenticated write test remains unrun because no disposable Supabase credentials are available locally

### Leaflet base-layer listener cleanup ordering

- Issue: every 3D-to-2D restore replaced the base TileLayer after clearing all layer listeners, including Leaflet's own one-time removal hook
- Root cause/design: Leaflet's removal hook is what unregisters `viewreset`, `zoomanim`, and other GridLayer callbacks from the map; all base-layer teardown paths now use one tested helper that calls `remove()` before `off()`
- Files changed: `src/components/GameMap.tsx`, `src/lib/leafletLayerLifecycle.ts`, `tests/leafletLayerLifecycle.test.ts`, `tsconfig.tests.json`, `package.json`
- Commit SHA: `e1a2225b9cce5870be4bee647f823d8f86e69e17`
- Test results: the exact fresh-page round trip plus zoom/pan no longer throws; 20 settled mobile-width cycles with zoom and keyboard pan after every return and 10 rapid reversal sequences retained one map/TileLayer/canvas, at least 20 visible tiles, and zero runtime errors

### V1.3.9 map final stability release

- Scope: reviewed final Leaflet and MapLibre ownership, removed metrics-only logging/counters, replaced unowned zero-delay Leaflet popup timers with one cancellable animation-frame owner, bumped the service-worker cache generation, and documented the lifecycle contract
- Preserved behavior: continuous world wrapping, date-line geometry, canonical wrapped selections, quality settings, optional-resource degradation, and all save/accounting behavior
- Files changed: `src/components/GameMap.tsx`, `src/components/map/providers/MapLibreGlobeProvider.tsx`, `docs/map-lifecycle.md`, version metadata, README, manifest, and service-worker cache generation
- Test results: initial 2D and 3D pass; 10/10 settled cycles and 5/5 rapid reversal sequences retain one Leaflet map, one base TileLayer, one MapLibre canvas, and 18 visible tiles; post-return zoom/pan loads 24 tiles; wrapped overlays remain present; canvas pixel variation is nonblank; console errors and temporary debug logs are zero

## Files Modified

- `.gitignore`: excludes generated `.test-build/` output
- `package.json`: adds focused map lifecycle and save tests plus the guarded live cloud acceptance command, keeps deterministic lint, pins patched Next/PostCSS/Sharp versions, and declares the compatible Node runtime floor
- `pnpm-lock.yaml`: records the focused test dependencies and converged patched production graph
- `pnpm-workspace.yaml`: permits the existing native builds and overrides Next's vulnerable exact PostCSS/Sharp edges with tested patched versions
- `eslint.config.mjs`: adds Next core-web-vitals/TypeScript flat-compatible lint configuration and ignores generated artifacts
- `src/components/AircraftMarketScreen.tsx`: moves effects above the nullable-game early return to preserve hook ordering; removes one unused type import
- `src/components/AuthGate.tsx`: keeps save-before-switch, cloud-slot refresh, and the context switch action synchronized with current auth, network, and translation state
- `src/components/ScheduleScreen.tsx`: advances default outbound/return flight numbers when the total weekly-service count changes and localizes canonical overlap errors
- `src/components/GameMap.tsx`: owns deterministic map recovery, removes Leaflet base layers before clearing their internal cleanup listeners, translates 2D popups, and retains exact globe and route-statistics inputs
- `src/components/AircraftImage.tsx`: uses a fill-sized optimized image while preserving the model silhouette fallback
- `src/components/AircraftSideImage.tsx`: uses a fill-sized optimized image while preserving localized failure fallback and per-model transforms
- `src/components/map/MapView.tsx`: separates React pane ownership from Leaflet container ownership and moves the noninteractive 2D badge away from zoom controls
- `src/lib/leafletTileReadiness.ts`: pure rendered-tile visibility and coverage helpers
- `tests/leafletTileReadiness.test.ts`: regression tests for collapsed, offscreen, visible, and cached coverage
- `src/store/gameStore.ts`: exports the pure load normalizer, leaves registration generation with the market, and explicitly strips legacy cash aliases after migration
- `src/lib/cash.ts`: defines the canonical reader for both current game state and partial historical payloads
- `src/lib/cloudSave.ts`: preserves historical cash aliases before producing a canonical cloud-restored game
- `tests/saveCompatibility.test.ts`: sanitized V1.2.2 restore plus local and cloud-boundary canonical cash migration assertions
- `package.json` and `pnpm-lock.yaml`: include the development-only `fake-indexeddb` test dependency and execute the storage regression
- `tsconfig.tests.json`: compiles the storage and Leaflet lifecycle regressions with the existing Node test suite
- `tests/gameSaveStorage.test.ts`: exercises the actual async IndexedDB adapter with a sanitized pre-V1.3 persistence envelope
- `tests/registerTestAliases.cjs`: resolves compiled `@/` imports for Node's built-in test runner
- `scripts/verify-cloud-save.mjs`: credential-gated disposable-account acceptance for Supabase auth, conflict-target upsert, uniqueness, canonical cash, deletion, and cleanup
- `src/lib/leafletLayerLifecycle.ts`: centralizes Leaflet's required remove-before-off ordering
- `tests/leafletLayerLifecycle.test.ts`: regression proving the internal removal hook runs before listener clearing
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
- `docs/map-lifecycle.md`: final Leaflet, MapLibre, engine-switch, and failure-degradation ownership contract

## Tests Completed

- V1.3.9 focused baseline: `pnpm install --frozen-lockfile`, `pnpm audit --prod`, 12/12 tests, typecheck, zero-warning lint, and the production build passed at baseline HEAD `e1a2225`
- V1.3.9 practical browser gate: initial 2D produced one Leaflet map, one base layer, 18 visible tiles, 10 route paths, 150 airport copies, and 10 aircraft copies; initial 3D produced one visible nonblank canvas
- V1.3.9 switching gate: 10/10 settled 2D to 3D to 2D cycles and 5/5 rapid reversal sequences ended with one map, one base layer, one globe canvas, 18 visible tiles, and no stuck transition
- V1.3.9 interaction gate: zoom and keyboard pan changed the Leaflet transform, loaded 24 tiles, retained wrapped route/airport/aircraft copies, and emitted no console error
- V1.3.9 logging gate: no temporary map `console.debug` output remains; guarded optional-resource warnings remain available
- `pnpm run test`: passed, 12 tests and 0 failures, including Leaflet layer cleanup ordering, pre-V1.3 IndexedDB adapter restoration, local/cloud canonical cash alias migration, and MapLibre error policy
- `pnpm run typecheck`: passed, `tsc --noEmit`
- `pnpm run lint`: passed with 0 errors and 0 warnings
- `pnpm run build`: passed, optimized Next.js 15.5.21 production build generated successfully
- `pnpm install --frozen-lockfile`: passed with the committed pnpm resolution model
- `pnpm audit --prod`: passed with `No known vulnerabilities found`
- `pnpm run test:cloud -- --help`: passed and documents the required disposable-account environment contract
- Cloud acceptance guard checks: missing credentials and a Supabase URL containing `/auth/v1` both exit before client creation or network access; no secret values are printed
- Production aircraft image optimization: `/aircraft/a220-300.jpg` and its `/_next/image` 640px optimized response both returned HTTP 200; the optimized JPEG was 8,158 bytes and the production server logged no runtime error
- Production harness containment: `GET /map-harness` returned HTTP 404 from `next start`
- Initial desktop 2D: passed with 18 visible 256px OSM tiles, 10 route paths, 150 wrapped airport markers, 10 wrapped aircraft markers, one attribution, one map, and one TileLayer
- Initial desktop 3D: passed with satellite globe, route/airport/aircraft layers, one MapLibre canvas, and non-fatal optional resource errors
- Normal switching: 20/20 final desktop cycles passed; maximum measured 2D return was 14ms
- Rapid switching: 20/20 sequences of 2D to 3D to 2D to 3D to 2D passed with one Leaflet map, one TileLayer, one MapLibre canvas, and no stuck transition
- Leaflet listener reproduction: one fresh 2D to 3D to 2D cycle followed by zoom-in failed before the patch in `GridLayer._updateLevels`; after the patch, zoom and keyboard pan completed with 24 visible tiles and no error
- Leaflet listener stress: 20 settled cycles with zoom-in, zoom-out, ArrowRight, and ArrowLeft after every 2D return plus 10 rapid reversal sequences passed with zero errors, singleton resources, and 20 or more visible tiles
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
- Canonical cash migration: legacy aliases remain readable through both store and cloud restoration, exact value is written to `money`, and duplicate top-level/nested aliases are removed
- IndexedDB restore contract: the actual asynchronous adapter round-trips a V1.2 persistence envelope without invoking the legacy local-save fallback, then restores every acceptance-critical fixture field
- Weekly route statistics: the memo signature directly tracks every consumed schedule field and ignores unrelated fleet updates; both map engines remain healthy
- Aircraft images: A220 market and side-view assets render with preserved aspect ratio; a missing optimized source transitions to the existing fallback without a broken-image remnant
- Resource ownership: all map effects have a single acquisition/cleanup owner; settled switching retains one instance per engine and route unmount leaves no map root or canvas
- Production app shell: a first-session production load rehydrated from the service worker while the origin server was stopped, then recovered online without warnings or errors
- Mobile portrait (390x844): no horizontal overflow; initial 2D/3D and 10 repeated cycles passed; controls did not overlap
- Mobile landscape (844x390): no horizontal overflow; initial 2D/3D and 10 repeated cycles passed
- Zoom controls: pointer zoom-in loaded zoom-level 3 tiles; zoom-out returned to minimum zoom and disabled correctly
- `git diff --check`: passed for the Leaflet listener cleanup checkpoint

## Cross-Version Regression Status

| Area | Status |
| --- | --- |
| Saves | V1.2.2 compact restore and actual IndexedDB-adapter round trip passed; all five historical cash aliases normalize into canonical `money` |
| Authentication | Deployed V1.3.8 and local configuration gates render; authenticated flow and airline switching not exercised |
| Cloud save | Shared V1.2.2 payload and legacy-cash restore passed; a guarded disposable-account acceptance command now covers auth, upsert, uniqueness, canonical cash, and cleanup, but it has not yet run against Supabase |
| Local save | Sanitized V1.2 persistence envelope passed through the actual async IndexedDB adapter and production restore path; browser UI rehydration remains unverified |
| Fleet | Harness renders owned aircraft data; optimized aircraft images, native Sharp 0.35.3 production response, and missing-file fallback passed; gameplay workflow unchanged |
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
| Maps | P0 restore fix plus switching, wrapping, geometry, interactions, degradation policy, resource ownership, and removed-GridLayer listener regression checks passed |
| Mobile | Portrait/landscape layout and repeated switching passed; real touch/pinch pending |
| Offline/PWA | OSM failure and production app-shell origin-outage/reconnection passed; all-network offline and saved-game interaction remain pending |
| English | MapLibre airport tooltip, map labels, and Leaflet airport popup rendered correctly |
| Chinese | MapLibre and Leaflet airport details render translated status; Schedule preview-overlap errors now have a compiler-checked Chinese mapping |

## Deferred External Verification

- Authenticated live Supabase signup, upsert/load, uniqueness, deletion, and cleanup with an empty disposable project; the guarded `pnpm run test:cloud` verifier is ready
- Physical-device touch panning, pinch zoom, and information-card scrolling
- Complete browser-wide network isolation with authenticated/local saved-game interaction; production app-shell origin outage/reconnection and failed map-resource behavior already pass

These checks remain useful external acceptance coverage. There is no current evidence that they represent a reproducible code defect, so they do not block V1.3.9 or V1.4.0.

## Next Exact Action

Audit existing revenue, operating-cost, schedule-frequency, route-evaluation, and completed-flight cash calculations before creating the centralized V1.4 economics layer.

## Recovery Instructions

1. Read this file, then run `git status --short --branch` and `git log -3 --oneline`.
2. Confirm the checkpoint is on `main` and synchronized with `origin/main`.
3. Confirm V1.3.9 is synchronized with `origin/main`, then inspect only the existing economics, route-evaluation, scheduling, demand, and completed-flight accounting paths.
4. Keep preview calculations pure and derived; do not alter save schema or cash until the current authoritative settlement path is understood.
5. Treat authenticated Supabase, physical touch/pinch, and complete browser-wide isolation as deferred external verification unless a reproducible defect appears.
