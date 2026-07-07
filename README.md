# Airline Tycoon V1.1.1

A browser-based airline management simulation game where players build and manage their own airline network.

Release: V1.1.1 - Airport Board and Offline Mode

## Features

- Start an airline from a selected base airport
- Buy and manage aircraft
- Open routes between real airports
- Adjust ticket prices by cabin class
- Estimate demand, revenue, cost and profit
- Create weekly flight schedules
- View aircraft movement on a map
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
- LocalStorage for save data
- Supabase for optional cloud save
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

Airline Tycoon V1.1.1 fixes airport board visibility and adds first-pass offline play support. Some data, economy calculations, route demand, and scheduling systems remain simplified for gameplay balance.

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
