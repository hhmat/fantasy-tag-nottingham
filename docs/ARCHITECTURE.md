# Fantasy Tag Nottingham — System Architecture

## 1. Overview

```
┌──────────────────────┐         ┌───────────────────────────────────────┐
│  React Native (Expo) │  HTTPS  │              Supabase                 │
│  iOS + Android       ├────────►│  Postgres + RLS + Auth + Edge Fns     │
│  expo-router app     │         │  Realtime (live scores)               │
└─────────┬────────────┘         └───────┬───────────────────────────────┘
          │                              │
          │ Expo Push API                │ pg_cron
          ▼                              ▼
┌──────────────────────┐         ┌───────────────────────────────────────┐
│  APNs / FCM          │◄────────│  Edge Fn: weekly-reminders            │
│  (push notifications)│         │  Edge Fn: price-updates               │
└──────────────────────┘         └───────────────────────────────────────┘
```

**Principle:** all business rules that affect data integrity (budget, squad size,
2-per-team cap, scoring maths, transfer limits) live in Postgres as constraints,
triggers and functions. The mobile app validates early for UX, but the database
is the source of truth — this makes the admin dashboard, the app and any future
web client behave identically.

## 2. Technology choices

| Layer            | Choice                                  | Why |
| ---------------- | --------------------------------------- | --- |
| Mobile           | Expo SDK 52+, expo-router, TypeScript   | One codebase for iOS/Android, file-based navigation, OTA updates |
| State            | TanStack Query (server) + React Context (auth) | Cache, retries, realtime invalidation without Redux boilerplate |
| Backend          | Supabase (Postgres 15)                  | Auth, RLS, realtime, cron, edge functions in one platform |
| Auth             | Supabase Auth (email + Google OAuth)    | Native Google sign-in via expo-auth-session deep-link flow |
| Push             | expo-notifications → Expo Push API      | Single token format for APNs + FCM |
| Live scores      | Supabase Realtime on `fixtures`         | Score updates pushed to open app screens |

## 3. Data model (summary)

```
auth.users ──1:1── profiles ──1:N── fantasy_teams ──N:M── players (via fantasy_team_players)
                        │                                      │
                        └──N:M── private_leagues (league_members, keyed by fantasy_team)
teams ──1:N── players ──1:N── player_match_stats ──N:1── fixtures ──N:1── gameweeks
players ──1:N── price_history / transfers
```

Full DDL in `supabase/migrations/0001_schema.sql`.

### Key invariants enforced in the database

- `fantasy_team_players` trigger `validate_squad()`:
  - ≤ 10 active players, exactly 1 captain, ≤ 2 players per real team,
  - Σ(purchase price) ≤ £100m.
- `transfers` trigger enforces 1 free transfer per gameweek; extras are logged
  with `point_cost = 4` and deducted in the leaderboard view.
- `player_match_stats` unique `(fixture_id, player_id)` — no double entry.
- Points are **derived**, never stored by hand: `player_points()` computes from
  raw stats so a corrected stat automatically corrects every leaderboard.

## 4. Scoring pipeline

1. Admin enters a result + per-player stats (Admin → Results screen).
2. `UPDATE fixtures SET status='finished'` fires `fn_apply_match_result()` which
   sets each stat row's `win` flag from the scoreline.
3. Leaderboards are SQL **views** (`v_global_leaderboard`, `v_weekly_leaderboard`)
   computed from `player_match_stats` — always current, nothing to backfill.
4. Price changes: nightly edge function `price-updates` (or pg_cron job) reads
   net transfer volume per player and applies ±0.1/±0.2 steps, logging to
   `price_history`.

## 4a. Spawtz sync (external data)

The `spawtz-sync` edge function scrapes the official Try Tag Rugby Spawtz
pages (Fixtures, Standings → Results, Statistics → POTM) after each match
night and upserts fixtures, scores, teams and Player-of-the-Match awards.
It can also be triggered on demand from the app's Admin dashboard — the
function accepts either the service-role key (pg_cron) or a session JWT
belonging to an `is_admin` profile.
Idempotent via Spawtz `external_id`s; win flags are recomputed with
`sync_win_flags()` after every run. Season/division targeting is env-driven
(`SPAWTZ_LEAGUE_ID`, `SPAWTZ_SEASON_ID`, `SPAWTZ_DIVISIONS`). The DOM-parsing
selectors are regression-tested by `scraper/test_parser.py` against saved
page samples in `scraper/samples/`.

## 5. Authentication flow
```
Email:   App → supabase.auth.signUp/signInWithPassword → session in SecureStore
Google:  App → expo-web-browser → Supabase OAuth → redirect
         fantasytag://auth/callback → exchangeCodeForSession → session
Profile: AFTER INSERT trigger on auth.users creates profiles row (display_name
         from metadata), app upserts expo push token on launch.
```

Row Level Security: every table has policies (see `0002_rls.sql`). Admins are
`profiles.is_admin = true`; all write paths for league data check this claim.

## 6. Screens (expo-router)

```
app/
├── _layout.tsx            # Providers (Auth, QueryClient, theme)
├── index.tsx              # Redirect by auth state
├── (auth)/login.tsx, register.tsx
├── (tabs)/
│   ├── index.tsx          # Home dashboard
│   ├── squad.tsx          # My fantasy team
│   ├── players.tsx        # Player market (search/sort/filter)
│   ├── fixtures.tsx       # Fixtures by gameweek, live scores
│   └── leagues.tsx        # Global / weekly / private leaderboards
├── player/[id].tsx        # Player profile + form + price history
├── team/[id].tsx          # Real team profile + roster
├── league/[id].tsx        # Private league table
├── transfers.tsx          # Squad builder / transfer screen
└── admin/                 # is_admin guard
    ├── index.tsx          # Admin dashboard
    ├── players.tsx        # CRUD players/teams
    ├── fixtures.tsx       # Create fixtures
    └── results.tsx        # Enter results + stats
```

## 7. Notifications

- `weekly-reminders` edge function, triggered by pg_cron twice per gameweek:
  - **Gameweek preview** (e.g. Monday 09:17): "Gameweek N starts this week…"
  - **Deadline reminder** (2 h before `gameweeks.deadline`): "Set your squad…"
- Targets every `profiles.expo_push_token`, batches through Expo Push API.
- `spawtz-sync` additionally pushes an alert to **admin devices only** when a
  run reports errors, so scrape failures (markup changes, unreachable pages)
  are noticed the same night rather than at the next deadline.
- Every payload carries a `screen` field; the app's root layout listens for
  notification taps (warm and cold start) and deep-links to that route
  (preview → Fixtures, deadline → My Squad, sync alert → Admin). Routes are
  validated against an allow-list before navigation.

## 8. Environments & secrets

| Secret | Location |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `mobile/.env` (public, safe to ship) |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge function env only — **never** in the app |
| Google OAuth client IDs | Google Cloud Console + Supabase dashboard |

## 9. Scaling notes

- 150 players / 12 teams is small; the schema comfortably handles 10⁴ users.
  Leaderboard views use indexes on `(gameweek_id)`, `(player_id)` and partial
  indexes on active squad rows. If usage grows, materialize
  `v_global_leaderboard` per gameweek and refresh on stats writes.
- Realtime is subscribed per-fixture screen only, so channel count stays low.
