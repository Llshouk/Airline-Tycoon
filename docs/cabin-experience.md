# Cabin Products and Passenger Experience

Local development after V1.7.0; this feature does not change the release number.
No new dependency, save key, Supabase table column or save-format version is needed.

## Configuration

- Each new aircraft owns an independent `cabinConfiguration` and its derived
  `cabinLayout` snapshot. Purchase checks that they match, charges `game.money`,
  and clones the configuration. UI grouping never combines aircraft records.
- Basic/Premium/Luxury are products within each cabin, not new passenger classes.
  Model/family profiles choose allowable row arrangements and fixed widths.
  First is unavailable on narrowbodies; A330 supports 1-2-1 and Luxury 1-1-1.
- Players allocate section percentages and adjust integer pitch within product
  bounds. Allocation changes redistribute other sections proportionally; pitch
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

Browser acceptance uses the actual app in English/Chinese at 1440px and 390px.
It checks purchase and persisted cash, template reuse/reload, pitch bounds,
737/A330 eligibility, detail metrics, actual reviews and horizontal overflow.
Development and production checks pass, including a 390x844 mobile viewport
and the live configured profit preview. All 139 automated tests, typecheck,
lint and the optimized production build pass on 2026-10-06.

TODO: verified cabin/aisle/exit constraints, paid ground-only refits with downtime,
mixed seat products inside a cabin, catering/service staff and loyalty programs.
Real authenticated Supabase round trips and physical-device touch remain unverified.
