# V1.7.0: Contracts and Company Growth

Development points (DP) are permanent accumulated company experience. They cannot
be spent, transferred or lost through failing contracts. They do not multiply
fares, revenue or profit. Simulation speed and difficulty do not multiply DP.
Aircraft and airport purchases remain unrestricted by company level.

## Sources and Levels

| Source | DP | Frequency |
| --- | ---: | --- |
| Regional commuter contract | 100 | Once per completed accepted contract |
| Cargo order | 150 | Once per completed accepted contract |
| Network expansion | 200 | Once per completed accepted contract |
| Passenger charter | 250 | Once per completed accepted contract |
| Long-term cargo supply | 350 | Once per completed accepted contract |
| First completed flight | 50 | Once per airline |
| 100 completed flights | 150 | Once per airline |
| 1,000 passengers carried | 100 | Once per airline |
| 100 tons cargo carried | 100 | Once per airline |
| Own five aircraft | 100 | Once per airline |

Ordinary flights earn no repeatable DP outside accepted contracts. A single
actual flight can progress two different contract types and a milestone.
Milestones use their own actual settlement counters, not Console Add Stats.

| Level | Total DP | Contract types | Preferred range |
| --- | ---: | --- | ---: |
| Regional airline | 0 | Commuter | 1,500 km |
| Growing airline | 300 | Commuter, cargo | 2,500 km |
| Domestic airline | 1,000 | Commuter, cargo, network | 4,000 km |
| International airline | 2,500 | Previous types + passenger charter | 8,000 km |
| Global airline | 6,000 | Previous types + long-term cargo | Unrestricted |

The growth screen shows source totals, current/next level, remaining DP,
milestone progress and each level's contract unlocks. Preferred distance is not
a hard lock on existing routes: long-haul startups can receive appropriately
scaled commuter/cargo work. New network targets respect the level range.

## Contracts

Three deterministic offers are shown per three-day simulated cycle; at most two
contracts can be active. Small eligible fleets may have fewer offers. A missing
aircraft, open route, useful payload or adequate range produces an honest empty
state, not an impossible mission. Newly added fleet/routes may fill unused board
slots; accepting/completing/abandoning does not reroll existing offers.

- Commuter: normally 20 actual passenger legs within seven game days, rising by
  five legs per company level. Long block times/low capacity reduce the target.
- Cargo: normally 120 actual tons within ten game days, rising by 30 tons per
  level. Small holds and conservative available capacity reduce the target.
- Network: two passenger arrivals in each of three distinct cities within 14
  game days; two destinations use existing routes and one requires a route not
  open on acceptance. The new route must be affordable and within aircraft range.
- V1.7.0: charters count actual passengers delivered to one destination
  within five days; long-term cargo requires separate quotas in each of three
  acceptance-relative weeks. See [shared route market](route-market.md).

Capability is a conservative envelope using actual aircraft range, home base,
cabin payload, expected demand and currently booked maintenance duration. It is
not an automatic timetable guarantee: accepting creates no routes or schedules.
Existing reservations, future maintenance and curfews still require player choice.
Offers/acceptance recheck eligibility. Quoted cost and rewards freeze on acceptance.
V1.7.0 adds an explicit current-timetable forecast using the actual
shared-market/maintenance engine. It reports each target's projected progress
and shortfalls, with a calculation timestamp, without modifying the live save.

Only actual new settlements count. A flight must depart at/after acceptance and
arrive no later than the deadline. Passenger contracts require passengers; cargo
uses actual tons. Commuter/cargo outbound and return legs each count; network
progress counts only arrivals at the designated destination. Empty/cancelled
legs and pre-accept flights do not progress contracts. Maintenance cancellations
retain the existing recovery rules and produce no reward event.

Deadlines use game time, not wall time. Pause freezes them; speed controls only
the game clock. During offline catch-up, new flight events are sorted by actual
arrival time and processed before final expiry. Arrival exactly at deadline
counts; later flights do not. The original operating engine remains the sole
owner of actual flight settlement.

## Cash and Persistence

Cash equals 8% of quoted completion operating cost, capped at GBP 1,000,000 per
contract. It is not linked to deliberately inflated fares or actual losses.
Milestone cash is respectively GBP 25,000 / 100,000 / 75,000 / 75,000 / 100,000.
All rewards credit `game.money` once, with progress/completion in the same saved
state. Finance records a separate company-rewards cash category at the actual
crossing time. They are not passenger/cargo revenue or flight operating profit.

Abandonment/failure incurs no fine or DP loss. The same type/target key has a
seven-game-day cooldown after completion, expiry or abandonment. The current
board marks accepted offers consumed, preventing immediate reacceptance.
History retains 20 contracts, the board three, active contracts two, and only
unexpired cooldowns (bounded to 32). The settlement checkpoint and finite
milestone flags persist, preventing repeated ticks/reloads from paying again.

The new optional `companyGrowth` object is contained in compact-save format 2,
IndexedDB/LocalStorage and the existing Supabase JSON save. No table migration,
new environment variable, dependency or second cash balance is introduced.

## Old Saves

On the first migration, existing cumulative flights/passengers/cargo and fleet
initialize milestone progress. Already eligible milestones are marked historical
and grant DP only, never cash. Additional legacy credit is:

```
min(6000, floor(flights / 100) * 100
        + floor(passengers / 10000) * 50
        + floor(cargoTons / 1000) * 50)
```

Eligible historical milestone DP is added to that credit. Source totals identify
it as legacy credit. This is a gameplay approximation, not reconstructed audited
history. Contracts never count historical flight logs. Persisted schema-version
and flags make migration one-time; aircraft identities, schedules, prices,
historical finance and cash are preserved.

## TODO

- Playtest target pacing and rewards before expanding mission types.
- Reputation, competitors and alliances remain separate future work.
- Forecasts include current schedules and maintenance, but do not auto-plan new
  routes. Recheck after changing fares, fleet or the timetable.
- Cross-aircraft operations now use chronological boundaries. Simultaneous
  cash-dependent operations still use stable aircraft-ID order; bankruptcy
  policy remains a tick-end check, not an intratick forecast guarantee.
- Local JSON/IndexedDB/fallback behavior is tested. Authenticated Supabase
  save/load needs a configured test account; no production account was used.
