# Airline Tycoon V1

A browser-based airline management simulation game where players build and manage their own airline network.

## Features

- Start an airline from a selected base airport
- Buy and manage aircraft
- Open routes between real airports
- Adjust ticket prices by cabin class
- Estimate demand, revenue, cost and profit
- Create weekly flight schedules
- View aircraft movement on a map
- Manage owned fleet and aircraft registrations
- Control game speed
- Save progress locally in the browser
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

This is a first playable prototype. Some data, economy calculations, route demand, and scheduling systems are simplified for gameplay balance.

## Cloud Save

Supabase is used for optional account login and cloud save. LocalStorage still works without login, so the game can be played offline or without a cloud account.

Required environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Do not commit `.env.local` or any Supabase keys.

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
