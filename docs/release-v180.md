# V1.8.0: interface refresh, maintenance fixes, faster simulation

No new gameplay systems, no save migration and no Supabase change. Existing saves load as before.

## Interface

- New visual language based on airport wayfinding: apron navy for the top bar and dock, signal
  yellow for "you are here" and the main action on a screen, chart-paper panels for data, airway
  magenta for the route network. Tokens live in `tailwind.config.ts` and the `:root` block of
  `src/app/globals.css`.
- Type is Barlow and Barlow Semi Condensed, self-hosted through `@fontsource` so the game still
  renders correctly offline. Chinese text falls back to the system CJK face.
- The dock shows a label under every icon. The dashboard opens on a departures board and a single
  strip of figures instead of eight identical cards. Screen titles are no longer repeated inside
  each panel.
- Login and airline creation share a route-map backdrop.
- Map: base airports are yellow, served airports navy, others white; the legend no longer names
  colours. Routes and aircraft now follow the great circle, so long-haul routes bow towards the
  pole as real flights do.
- The Chinese language file contained 87 strings that had been saved with the wrong text encoding
  and displayed as garbage (for example the map legend). They are restored.

Known gaps: several screens still contain English-only strings that were hard-coded before this
release (Leaderboard headings, parts of Schedule, Market and Aircraft detail). The start screen and
dashboard are now fully translated.

## Maintenance and timetable fixes

- Flights missed while an aircraft was grounded stayed "scheduled" forever. After an inspection
  lifted the grounding they were all flown back-to-back, days late, and paid revenue. A grounded
  flight is now cancelled (reason "Aircraft grounded") once its departure time passes, and work
  that starts on the ground cancels anything still pending from before it finishes.
- An inspection that did not lift the grounding cancelled every future return leg for "position"
  while leaving the outbound legs in place. After the later full service the aircraft flew out,
  had no return leg, and the next outbound left from base without it. Held future rotations are
  now kept whole.
- A return leg can no longer depart from an airport the aircraft never reached.
- One-click full maintenance could attach itself to a timetabled flight home that was days away,
  holding the aircraft and cancelling everything in between. It now only waits for a return that
  leaves within 12 hours and otherwise ferries home at once. Saves already waiting are re-planned.
- Timetable conflicts were checked against the delayed times of dated flights. A random delay
  could hide a real overlap (two rotations interleaved) or reject a valid timetable. Conflicts are
  now checked on planned times.

Unchanged by design: a reserved inspection whose anchor flight is cancelled or grounded stays
visible as blocked until the player cancels it or requests full maintenance.

## Performance

Measured in Node with 100 aircraft, three daily rotations each, at 100x speed:

- One simulation tick: about 190 ms before, about 30 ms after. Most of the time went to formatting
  airport local time with `Intl` for every pending flight three times per tick; offsets are now
  cached per zone and UTC day, with clock-change days still measured exactly.
- The compact save was rebuilt and serialised (about 7 MB at this fleet size) on every tick. It is
  now built only when a write is due: within one second of a player action, every five seconds
  for clock-only progress. Nothing is lost on reload, because elapsed time is replayed from the
  last tick time.
- A paused game no longer writes state every second.
- Workspace panels follow the clock every three seconds and still update at once on any player
  action or settled flight (`usePanelGame`). The top bar keeps its one-second clock. The map does
  not redraw while a panel covers it.
- Cabin artwork: four PNG sheets (9.8 MB) became WebP (0.7 MB) at the same dimensions.

## Housekeeping

- Admin emails come from `NEXT_PUBLIC_ADMIN_EMAILS` instead of source code. Set it in the hosting
  environment to keep the testing console; without it nobody is an admin.
- Settings has "Download save file" and "Load save file".
- `.gitattributes` fixes line endings to LF. GitHub Actions runs typecheck, lint, tests and build.
