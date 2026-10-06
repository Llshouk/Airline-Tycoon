# Airline Tycoon V1.7.0

A browser-based airline management simulation game where players build and manage their own airline network.

Release: V1.7.0 - Shared Route Markets and Operations Tools

## Features

- Start an airline from a selected base airport
- Buy and manage aircraft
- Open routes between real airports
- Adjust ticket prices by cabin class
- Estimate demand, revenue, cost and profit
- Share finite route demand across aircraft by direction and local departure window
- Model fare elasticity, red-eye demand and very short/long route effects
- Review actual route results, price-demand curves and shared-market forecasts
- Preview batch pricing and independent aircraft timetable copies
- Track company age using the simulation clock and original founding date
- Accept optional commuter, cargo, network-expansion, passenger-charter and three-week cargo contracts
- Forecast contract timetable progress before accepting or changing schedules
- Earn permanent development points, progress through five company levels and complete one-time milestones
- Track contract progress, bounded history and separate company cash rewards
- Sort recent Finance flights by profit, flight number, passengers, cargo, revenue, cost or time
- Review daily/weekly operating reports and 7/30/90-day financial trends
- Separate investment spending, subsidies and cash adjustments from operating profit
- Find grounded, maintenance-due, loss-making or idle aircraft from fleet attention filters
- Review per-flight fuel, crew, airport, handling, and maintenance-reserve costs
- Compare aircraft operating profit, margin, break-even load factor, and route suitability
- Track aircraft age, flight hours, cycles, condition, and reliability
- Inspect and service aircraft, review reserve-funded costs, and recover grounded aircraft
- Reserve maintenance after a chosen flight and preview conflicting cancellations
- Book maintenance for multiple independent aircraft and retain weekly timetable templates
- Create weekly flight schedules
- View aircraft movement on a Leaflet 2D map or MapLibre GL 3D globe
- Evaluate route quality, risk, demand, aircraft fit, and recommended aircraft
- View full-day airport departure and arrival boards
- Manage owned fleet and aircraft registrations
- Choose Simulation, Easy, or Realistic difficulty with adjustable game speed
- Save progress locally in the browser
- Continue a previously loaded local save while offline
- Switch between English and Chinese
- Use a developer console for testing

## Tech Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- IndexedDB for local saves, with a LocalStorage fallback
- Supabase for optional cloud save
- MapLibre GL JS for the optional globe map
- Map-based airline network display

## Getting Started

Install dependencies:

```bash
pnpm install
```

Run the development server:

```bash
pnpm dev
```

Then open:

```text
http://localhost:3000
```

If you prefer npm, you can also use:

```bash
npm install
npm run dev
```

## Current Status

Airline Tycoon V1.7.0 adds finite shared route markets, bounded fare elasticity and local-time red-eye demand. Very short and very long routes receive continuous demand adjustments. Bookings lock at departure, and chronological fleet operations settle them once on arrival. Route analysis separates actual recent results from isolated forward forecasts; batch tools preserve independent aircraft and check timetable conflicts. See [shared route market](docs/route-market.md) for the model and its gameplay assumptions.

Permanent company development points now unlock passenger charters at 2,500 DP and three-week cargo deliveries at 6,000 DP. Contracts count actual new deliveries, with separate weekly cargo quotas and timetable forecasts, not ordinary-flight income multipliers. See [company growth](docs/company-growth.md) for points, migration and reward rules. V1.5.3 fuel, crew, airport and maintenance-reserve calibration is retained. Existing saves remain compatible, with no database migration or new dependency.

The Finance flight log remains capped at 60 records. Reports retain up to 90 simulated UTC days; aircraft/route diagnostics retain seven calendar days including today. Old saves begin reporting when upgraded, without fabricating earlier history; incomplete periods are marked. Flight profit is simplified operating contribution, not audited airline net profit: acquisition is separate investment spending, while depreciation, tax and head-office costs remain deferred. See [financial reports](docs/financial-reports.md) for rules and V1.5.3 balance samples, and [earlier economy balance](docs/economy-balance.md) for V1.5.2 history.

Maintenance can start immediately on the ground or after a selected flight lands and completes turnaround. Night demand is simplified for all passenger routes, with gentler long-haul effects and no cargo red-eye penalty. Airport night planning rules are optional and default off. Workshop capacity, replacement aircraft and more detailed operating rules are deferred. This remains a playable prototype, not an airworthiness simulator. See [maintenance rules](docs/aircraft-maintenance.md) and [code health review](docs/code-health-review.md) for assumptions and follow-up work.

## Map Configuration

The optional MapLibre globe uses NASA GIBS Blue Marble imagery by default with a local starfield backdrop. Country labels and ocean polygons are optional OpenFreeMap vector enhancements, so the satellite globe remains playable if those tiles or glyphs cannot load. The verified OpenFreeMap TileJSON supplies the `water` and `place` layers with Noto Sans glyphs, and includes OpenFreeMap, OpenMapTiles, and OpenStreetMap attribution. OpenFreeMap is MIT-licensed; its map data is sourced from OpenStreetMap. Set the public style URL below only to replace the globe's satellite basemap.

```text
NEXT_PUBLIC_MAPLIBRE_GLOBE_SATELLITE_STYLE_URL
```

Do not put private map provider keys in source control. Remote map styles and tiles are not stored in game saves or precached by the service worker.

The optional globe uses MapLibre 6 and requires WebGL2; the existing 2D fallback remains available. Development and production builds automatically copy the installed module worker, shared module, and license into `public/maplibre-workers/`. These generated assets are ignored by Git and are recreated from the locked dependency; do not remove this build preparation when deploying.

## Cloud Save

Supabase is used for optional account login and cloud save. LocalStorage still works without login, so the game can be played offline or without a cloud account.

Required environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Do not commit `.env.local` or any Supabase keys.

## Offline Mode

The app includes a basic PWA service worker for cached app shell files and aircraft assets. If the player has already loaded a local save on the device, they can use **Continue Offline** when the browser is offline.

Offline mode keeps saving to LocalStorage. Cloud auto-save is paused while offline and marks cloud sync as pending. When the browser comes back online, the app prompts the player to sync the local save back to Supabase.

Map tiles may be unavailable offline, depending on what the browser has cached. The game shows an offline map notice instead of crashing, and the simulation continues to run.

Difficulty-based cloud saves use one row per user and difficulty. If your Supabase `game_saves` table was created before this feature, run:

```sql
alter table public.game_saves
add column if not exists difficulty text not null default 'easy';

create unique index if not exists game_saves_user_difficulty_unique
on public.game_saves(user_id, difficulty);
```

If row level security is enabled on `game_saves`, authenticated users also need policies for their own rows:

```sql
alter table public.game_saves enable row level security;

drop policy if exists "Users can read their own saves" on public.game_saves;
drop policy if exists "Users can insert their own saves" on public.game_saves;
drop policy if exists "Users can update their own saves" on public.game_saves;
drop policy if exists "Users can delete their own saves" on public.game_saves;

create policy "Users can read their own saves"
on public.game_saves
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own saves"
on public.game_saves
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own saves"
on public.game_saves
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own saves"
on public.game_saves
for delete
to authenticated
using (auth.uid() = user_id);
```

## Future Improvements

- More aircraft models
- More airports
- Better route demand model
- Improved airline finance system
- Online leaderboard
- User accounts
- More realistic scheduling and airport slot system

## Important

Do not commit environment variables, API keys, or local build output.
