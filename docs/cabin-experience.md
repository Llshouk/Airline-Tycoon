# Cabin Products and Passenger Experience

Cabin products and reviews shipped after V1.7.0. V1.7.1 adds the visual designer
and corrected narrowbody Premium Economy products. No new dependency, save key,
Supabase table column or outer save-format version is needed.

## V1.7.1 Visual Designer

- Full aircraft top view includes cockpit, wings, windows and actual whole seat
  rows. Cabin tabs and seat-product images select the settings shown below.
- Pointer/touch/keyboard dividers transfer space between adjacent supported
  cabins only. All other sections remain unchanged. Endpoints clamp safely;
  a percentage control can also restore zero-space cabins.
- Basic/Premium/Luxury image tiles show product appearance; the separate row
  diagram shows the actual selected abreast arrangement, not a stock cabin photo.
- New A320/A321/737 economy and Premium Economy retain 3-3 for every grade.
  A220 retains 2-3 because of its narrower five-abreast cross section.
  Widebody Premium Economy offers model-specific 2-4-2/2-3-2/2-2-2 profiles.
  These are game profiles, not a certified interior design or aisle-width model.
- New configurations use internal cabin version 2. Version 1 aircraft continue
  resolving the old products so capacity, comfort, purchase prices and reviews
  are not silently recalculated. Old templates upgrade only when loaded into a
  new purchase draft; owned aircraft remain unchanged.
- Pitch stays bounded and changes whole rows; row positions/counts and comfort
  animate. Reduced-motion preferences disable these transitions. Image failures
  show an Armchair fallback. Apply remains separate from buying an aircraft.
- PWA branding/cache advances to V1.7.1 and precaches the local seat catalog.

Physical-layout reference: [Airbus A220 cabin](https://www.aircraft.airbus.com/en/newsroom/stories/2025-09-the-passenger-favourite-a220-gets-an-airspace-cabin)
describes five-abreast economy versus larger six-abreast single aisles.
Widebody layouts remain conservative gameplay presets, not exhaustive airline options.

## Configuration

- Each new aircraft owns an independent `cabinConfiguration` and its derived
  `cabinLayout` snapshot. Purchase checks that they match, charges `game.money`,
  and clones the configuration. UI grouping never combines aircraft records.
- Basic/Premium/Luxury are products within each cabin, not new passenger classes.
  Model/family profiles choose allowable row arrangements and fixed widths.
  First is unavailable on narrowbodies; A330 supports 1-2-1 and Luxury 1-1-1.
- Players allocate section percentages and adjust integer pitch within product
  bounds. Percentage changes redistribute other sections proportionally; boundary
  drags change only neighbors. Pitch
  changes retain section boundaries and remove/add whole rows.
- Row capacity is `floor(section length / pitch) * seats per row`, also capped by
  the existing model/cabin maximum. The length budget is calibrated from the
  model's maximum economy capacity at Basic minimum pitch. New configurations
  allow zero seats in any class; old minimum-count rules remain legacy-only.
- Cargo remains separately bounded by model capacity and occupied row length.
  Reducing seats by widening/pitch does not simply turn each removed seat into
  extra tonnes of cargo. This is a gameplay approximation, not a payload model.
- Twelve named, model-specific templates can be saved/overwritten/deleted and
  survive local/cloud JSON round trips. Loading a template never alters owned planes.
- Modal changes are drafts until Apply. Escape/Close discards them. Saving a
  template is a separate explicit action and does not buy/configure an aircraft.

## Economy

- Comfort combines cabin-relative product quality, width and capped pitch gains.
  Flight duration strengthens cramped/roomy pitch effects. Scores stay 20-98.
- Comfort changes willingness to pay, not actual route prices or revenue bonuses.
  Effective reference fare is bounded to 82-128% of the existing class reference.
  The V1.7.0 strictly falling price curve and finite directional/time-window pool
  still apply. Absurd fares sell no passenger seats, including Luxury.
- Capacity, comfort and recent aircraft/cabin reputation weight shares within the
  same finite market. Sold passengers consume reference-demand equivalents using
  their actual effective fare multiplier. Reputation cannot create another pool.
- Additional cleaning is reported with airport/ground-handling costs. Seat upkeep
  accrues in maintenance reserve and is not charged again when reserve funds service.
- Purchase, schedule, aircraft details, map, route comparisons and contract estimates
  pass the same aircraft configuration to the existing economics engine.

## Reviews and Compatibility

- Seat/price-value experience scores freeze with departure bookings. Actual delay
  reduces them on arrival. Zero-passenger/cancelled flights earn no reviews.
- Only newly completed flights record samples; repeated ticks/reloads do not replay
  history. Offline catch-up uses the same chronological fleet engine.
- Store seven UTC game-day aggregates per aircraft and cabin, not individual
  passenger objects. Company satisfaction is derived and passenger-weighted.
  Empty history displays no reviews, not a fictional company rating.
- Reputation uses sample confidence `passengers / (passengers + 300)` and changes
  competitive attractiveness by at most +/-8%; it is not an income multiplier.
- Old aircraft retain original seat counts, purchase prices, registration, cash,
  schedules and historical financials. No geometry is invented for old cabins.
  New flights can begin generating real reviews; existing completed flights are
  never backfilled. Old in-flight bookings lacking scores keep their locked money
  but do not invent retrospective reviews.
- Compact saves omit redundant completed-flight booking snapshots, preserving
  final accounting and review aggregates. In-flight bookings remain intact.
- Invalid optional configurations are discarded without changing authoritative
  old seat counts; malformed review days/templates are bounded/filtered.

## Verification and Future Scope

Automated checks cover profiles, pitch/rows, limits, configured purchase cash,
quality/price curves, costs, departure locks, arrival-only reviews, cancellations,
offline/reload parity, finite markets, weighted samples, seven-day retention,
templates, legacy saves, IndexedDB/LocalStorage fallback and 100 upgraded aircraft.

V1.7.1 automated tests: 152 pass, including neighbor-boundary allocation, every
narrowbody grade, version-1 preservation and save reloads. Typecheck, zero-warning
lint and optimized production build pass on 2026-10-06.
Development and production browser acceptance covers EN/ZH at 1440px, 390x844 and 320x844: real pointer and
keyboard dragging, emulated touch, images/fallback, reduced motion, 737/A220/A330/A350
layouts, pitch bounds, cancellation, templates, reload and canonical purchase cash.
The cabin dialog has no horizontal overflow. The pre-existing market background
is 370px wide at a 320px viewport; V1.7.1 does not expand it or refactor that page.
Production service-worker checks confirm V1.7.1 precaching and seat images served
from the cache with the browser network disabled. Missing-image UI tests disable
the service worker to test true absence separately from a cached image.
Physical touch, authenticated Supabase and Vercel completion remain unverified.

TODO: verified cabin/aisle/exit constraints, paid ground-only refits with downtime,
mixed seat products inside a cabin, catering/service staff and loyalty programs.
Real authenticated Supabase round trips and physical-device touch remain unverified.
