# Phase 5 — Player and match experience

Phase 5 extends the existing Expo/Supabase application. It does not change squad rules, captaincy, transfer logic, or the fantasy scoring engine.

## Experience map

```text
Fixtures → Match Centre ⇄ Real team page → Player profile → Match Centre
                                      ↘ Player profile ↗
Admin → Results & Stats → Match event timeline composer
```

### Player profile

```text
┌──────────────────────────────────┐
│          [ Photo / initials ]    │
│         Jordan Smith             │
│             Back                 │
│       Taggingham Forest ›        │
│          £8.5m   ▲ £0.2m         │
│                                  │
│ SEASON OVERVIEW                  │
│ [86 pts] [7 tries] [4 assists]   │
│ [2 conv] [1 POTM] [4W] [6 games] │
│                                  │
│ FORM TREND       9.2 average pts │
│ [ GW6  8 ] [ GW7 14 ] [ GW8 6 ]  │
│                                  │
│ PRICE HISTORY                    │
│ Chronological price bars         │
│ £8.3m → £8.5m          28 Oct    │
│                                  │
│ MATCH HISTORY                    │
│ GW8 · 2 Nov           14 pts     │
│ H · Opponent            W 7–4    │
│ 2T · 1A · 0C · Attended          │
└──────────────────────────────────┘
```

Photos use `players.photo_url`; a team-initial fallback remains available when the URL is absent or fails to load. The charts are built with React Native primitives and work on iOS, Android and web without an additional native chart dependency. Match rows expose opponent, venue, result and computed fantasy points, and open the relevant Match Centre.

### Team page

The header uses `teams.crest_url` or a colour/initial fallback. A finished-match record and last-five form strip precede the points-sorted active squad. Upcoming/live fixtures and finished results are separate sections. Every fixture opens Match Centre and every player opens the enhanced profile.

### Match Centre

```text
┌──────────────────────────────────┐
│ GAMEWEEK 8                 ● LIVE│
│  [HOM]      7 – 4         [AWY]  │
│ Home FC                  Away FC │
│ Saturday, 7 November · 19:00     │
│ Venue                            │
│                                  │
│ MATCH STATISTICS                 │
│ Tries / assists / conversions    │
│ and aggregate fantasy points     │
│                                  │
│ MATCH EVENTS                     │
│ 12′  Try · Home                  │
│      Jordan Smith              › │
│ 18′  Conversion · Away           │
│      Alex Taylor               › │
│                                  │
│ PLAYER PERFORMANCES              │
│ HOME FC                          │
│ PLAYER             T   A   C PTS │
│ Jordan Smith       2   1   0  24 │
│ AWAY FC                          │
│ ...                              │
└──────────────────────────────────┘
```

- Fixture scores/status, statistics, events and player performances are independently loaded with empty and retry states.
- One match-scoped realtime channel invalidates fixture, statistics and event queries after changes.
- Team names open team pages; timeline and performance players open player profiles.
- Team comparison totals are derived from `player_match_stats`, not timeline events.
- Player points use the shared client scoring table: try 5, assist 3, conversion 2, POTM 10, win 5, attendance 1.

## Event persistence and scoring boundary

`supabase/migrations/0015_match_events.sql` adds:

- `match_events` with fixture, player, team, event type, optional minute and timestamps.
- Event types `try`, `assist`, `conversion`, and `player_of_match`.
- A validation trigger ensuring the event team matches the player's real team and participated in the fixture.
- Fixture/time and player indexes.
- Public/anonymous read RLS and authenticated admin-only insert/update/delete policies using `public.is_admin()`.
- Realtime publication through `supabase_realtime`, guarded so the publication statement only runs when needed.

**Match events are informational only.** `player_match_stats` remains the sole authoritative source for fantasy points, and fixture scores remain authoritative for the match scoreline. Adding or deleting a timeline event does not recalculate either one. The admin UI states this beside the event controls.

The event composer is part of the existing **Admin → Enter Results & Stats** flow. Admins select a player, choose an event type and optionally enter a whole minute from 0–120. Deletion requires a second confirmation tap. Database trigger validation still applies if a client bypasses the UI.

## Data and component architecture

```text
app/player/[id].tsx
├── getPlayer()              season view + players.photo_url
├── getPlayerMatchLog()      fixture, opponent and score joins
├── getPlayerPriceHistory()  chronological graph + latest changes
└── PerformanceCharts        native form and price bars

app/team/[id].tsx
├── getTeam() / getPlayers()
├── getTeamFixtures()        record, form, upcoming and results
├── ProfileImage.TeamBadge
└── FixtureList

app/match/[id].tsx
├── getFixture()
├── getMatchPerformances()
├── getMatchEvents()
└── subscribeToMatch()       fixtures/stats/events realtime

app/admin/results.tsx
└── MatchEventsAdmin
    ├── adminAddMatchEvent()
    └── adminDeleteMatchEvent()
```

`src/api/matches.ts` owns match-specific queries, realtime and event mutations. `FixtureList.tsx` supplies accessible fixture/result navigation shared by team pages.

## Apply the database migration

Existing projects:

1. Apply `0014_squad_formations.sql` first if it is not already installed.
2. Open **Supabase → SQL Editor → New query**.
3. Paste and run all of `supabase/migrations/0015_match_events.sql`.
4. Confirm **Run** succeeds before opening the timeline editor.

New projects can use regenerated `supabase/SETUP.sql`, containing migrations `0001`–`0015` and seed data. Rebuild it after migration changes with `python3 scripts/build_supabase_setup.py`. Never run the all-in-one setup over an existing populated project.

Applying SQL and testing native-device gestures were not part of the client compilation process; they remain separate deployment checks.

## Verification plan

| Check | Expected result |
| --- | --- |
| Open player from team or match | Photo/fallback, season stats, form, prices and match history render |
| Broken/missing player photo | Accessible team-initial fallback appears |
| Open historical match row | Correct fixture Match Centre opens |
| Open team page | Record and last-five form agree with finished scores |
| Scheduled fixture | Score area shows `vs`; empty stats/events remain readable |
| Live fixture | LIVE treatment and realtime query invalidation are active |
| Finished fixture | Score, team totals, player stats and points appear |
| Add admin event | Timeline refreshes; scores/stats do not change |
| Delete admin event | First tap asks for confirmation; second removes timeline entry |
| Event wrong team/player | Database trigger rejects the mutation |
| 375 px and wide layouts | No horizontal page overflow; long names wrap/truncate safely |
| Keyboard/screen reader | Fixture, team, player, event and admin controls have explicit roles/labels |
| Failed query | Section-level retry or migration guidance appears without hiding the score |

Production database RLS/trigger behaviour and physical iOS/Android interactions require a separate post-migration test pass.
