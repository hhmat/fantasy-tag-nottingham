# Fantasy Tag Nottingham — Phase 1 Codebase Audit

**Date:** 2026-11-08 · **Scope:** full repository (`mobile/`, `supabase/`, `.github/`, `scraper/`, `docs/`) · **Status:** production system, season in progress (GW 10 "Finals Night" remaining)

---

## 1. Existing architecture

```
┌────────────────────────────── CLIENTS ──────────────────────────────┐
│  iOS / Android (Expo SDK 52, RN 0.76)   Web SPA (GitHub Pages)      │
│  expo-router v4 · TypeScript · React Query · supabase-js 2.45       │
└──────────────┬───────────────────────────────────┬──────────────────┘
               │ HTTPS (REST/RPC, anon key + RLS)    │ static hosting
┌──────────────▼───────────────────────────────────▼──────────────────┐
│                           SUPABASE                                   │
│  Postgres 14 tables · 28 RLS policies · 6 SQL functions · 5 views    │
│  Auth (email + Google OAuth)                                         │
│  Edge Functions: weekly-reminders · price-updates · spawtz-sync      │
│  pg_cron + pg_net: 4 scheduled jobs (Mon 09:17 / 16:47 / 22:23 / 22:41 UTC) │
└──────────────▲───────────────────────────────────────────────────────┘
               │ scraping (idempotent via external_id)
        Try Tag Rugby Spawtz site (fixtures, results, POTM)
```

**Deployment:** push to `main` → GitHub Actions → `expo export` (subpath-aware via `EXPO_BASE_URL`) → Pages. No mobile CI yet (EAS pending).

## 2. Folder structure analysis

```
mobile/
  app/            21 routes — (auth), (tabs)×5, player/team/league [id], transfers, admin×5
  src/api/        5 modules (auth, fantasy, fixtures, leagues, players) — thin supabase-js wrappers
  src/components/ ui.tsx (design system) + PlayerRow.tsx
  src/lib/        supabase client, scoring constants, notifications
  src/store/      AuthContext (single global provider)
supabase/
  migrations/     0001 schema → 0005 sync_log (clean, linear, replayable)
  functions/      3 edge functions (Deno)
  seed.sql + SETUP.sql
scraper/          parser + regression test (passing)
docs/             ARCHITECTURE, WIREFRAMES, DEPLOYMENT, LAUNCH_CHECKLIST
```

**Healthy:** clear layering (routes → api → lib), SQL is the single source of truth for rules, migrations linear.
**Debt:** `docs/` describes 150 players but seed ships 39 real + generated fillers; `seed.sql` and `SETUP.sql` are two copies of the same data (drift risk); no `__tests__` anywhere in `mobile/`.

## 3. Database analysis

**Strengths**
- Points are *derived* via `player_points()` — scoring table exists once, in SQL. No duplicated arithmetic in clients.
- `validate_squad()` trigger enforces squad size, one captain, ≤2 per real team, budget — server-side, bypass-proof.
- Transfer accounting (`price_transfer`), win-flag triggers, price engine with clamping + history, idempotent sync via `external_id`.
- Views cover season stats, gameweek points (captain ×2, transfer hits), global/weekly leaderboards.
- Indexes on the hot paths (players.team, fixtures.gameweek, pms.player/fixture, ftp partials, transfers, price_history).

**Issues** (see §9 for ranks)
- `validate_squad()` never checks `gameweeks.deadline` — **squads editable after lock**.
- `fantasy_team_players.is_captain` is a single current flag; `v_gameweek_points` applies it to *all historical* gameweeks — **changing captain rewrites history**.
- No realtime publication on `fixtures`/`player_match_stats` — live scores never push.
- POTM sync upserts `attended: true` — attendance points inflated for players who didn't play.
- No uniqueness on `players(team_id, first_name, last_name)` — sync race could create duplicates.

## 4. Security analysis

**Good:** RLS enabled on all 12 tables; admin gate via `is_admin()` SECURITY DEFINER; self-admin-grant blocked by the `with check (is_admin = public.is_admin())` trick; owner-only writes on squads/transfers; service-role key never shipped (publishable key + RLS only); edge functions self-authorize (service key or admin JWT); secrets in GitHub Actions, not in repo.

**Weaknesses**
- `profiles for select using (true)` exposes **every user's `expo_push_token`** to anyone holding the publishable key (i.e., the world). Push tokens are capabilities — move to a private table or column-level revoke.
- `fantasy_team_players` and `transfers` world-readable → **opponent squads visible before deadline** (fairness, not strictly security).
- `private_leagues.code` world-readable → invite codes enumerable; anyone can join any private league.
- Edge functions currently deployed *with* gateway JWT verification, which rejects new-format `sb_secret_` keys → cron 401s (fix pending: redeploy `--no-verify-jwt`; functions self-authorize).
- Web session persists in `localStorage` (XSS-exfiltratable). Acceptable for MVP; revisit with CSP when custom domain lands.

## 5. UX analysis

- Clean dark theme, consistent design system (`ui.tsx`), Rugby-pun team identity carried through.
- Squad builder is a **list**, not a pitch — the single biggest gap vs. FPL/Sleeper feel (Phase 4 addresses).
- "Forgot password?" is rendered on the login screen but **no reset route exists** — dead end.
- No onboarding: after register, user lands on an empty squad tab with no guidance (budget/rules unexplained in-app).
- No form indicators, price-change arrows, or availability flags on player rows (data exists in `price_history`).
- Admin result entry is functional but dense on phones; no undo/edit-after-finish flow.

## 6. Performance analysis

- App queries are narrow and indexed; React Query caching (30 s stale, retry 2) is sane.
- Leaderboard views recompute the entire season per read — trivial at 12 teams / ~40 managers; will need a materialized `leaderboard_snapshots` table past ~1 k managers.
- Web bundle 1.6 MB uncompressed (Expo RN-web); fine on broadband, heavy on 3G — code-splitting admin routes would help later.
- `getSquadTotalPoints` sums client-side over N rows — fine now; use `v_global_leaderboard` when squad count grows.

## 7. Scalability analysis

- Multi-league expansion (roadmap Phase 4) is **not** supported by the schema: `teams`, `players`, `gameweeks`, `fixtures` have no `league_id`. Adding it later is a painful migration — decide before season 2.
- Single-`gameweeks`-sequence assumption is baked into sync (`gameweek_for_date`) and cron helpers.
- Price engine thresholds (±20/±50 net transfers) tuned for FPL scale — with ~40 managers, prices will **never move**. Re-tune to ±3/±8 or make thresholds configurable.

## 8. Technical debt

1. No tests in `mobile/` (only the scraper parser test).
2. Deploy workflow has **no quality gate** — a broken bundle shipped to production this week (the query-string incident). Add `tsc --noEmit` + export smoke check before deploy.
3. Admin screens use `any` liberally.
4. `addPlayerToSquad` performs out→in→log as three separate calls with a partial client-side rollback — one RPC transaction would remove the race.
5. `seed.sql` / `SETUP.sql` duplication.
6. `app.config.ts` cast hides a real typing gap (fixed, but watch upgrades).
7. EAS project ID still a placeholder — push tokens can't register on native until set.

## 9. Ranked findings

### Critical
| # | Finding | Evidence | Fix |
|---|---------|----------|-----|
| C1 | **No transfer/squad deadline enforcement** — squads, captain, transfers editable after the 18:30 lock | `validate_squad()` (0003) never reads `gameweeks.deadline`; transfers RLS has no deadline check | Migration 0006: deadline checks in `validate_squad()` + `price_transfer()` + RLS `with check` |
| C2 | **Captain change rewrites history** — `is_captain` is one flag applied to all past gameweeks in `v_gameweek_points` | 0003 view joins on current flag only | Add `captain_history` (or per-gameweek captain column); recompute view |
| C3 | **Cron jobs all 401** — gateway JWT verification rejects `sb_secret_` key | Function logs 2026-11-07 23:50 | Redeploy 3 functions `--no-verify-jwt` (functions self-authorize) — **user action pending** |

### High
| # | Finding | Fix |
|---|---------|-----|
| H1 | Live scores don't push — no realtime publication | `alter publication supabase_realtime add table fixtures, player_match_stats;` + client subscribe |
| H2 | `expo_push_token` world-readable via profiles RLS | New `profile_private` table or revoke column |
| H3 | Google login on web unverified/broken: `detectSessionInUrl:false`, no `/auth/callback` route, redirect URLs not allowlisted | Add callback route + code exchange; configure Supabase redirect URLs |
| H4 | Deploy pipeline has no gate (blank page shipped 11-07) | CI: `tsc` + export + HTTP smoke test before Pages deploy |
| H5 | "Forgot password?" dead link | Add `(auth)/reset.tsx` + `resetPasswordForEmail` |
| H6 | Price engine thresholds unreachable at league scale (±20/±50) | Re-tune to ±3/±8 net transfers or configurable per league |

### Medium
| # | Finding | Fix |
|---|---------|-----|
| M1 | Opponent squads/transfers visible pre-deadline | RLS: hide others' squads until `now() > deadline` |
| M2 | League invite codes enumerable | Restrict `private_leagues` select to members/commissioner; join-by-code RPC |
| M3 | POTM sync sets `attended:true` on upserts → phantom attendance points | Sync should leave `attended` to manual entry, or derive from team sheets |
| M4 | Transfer write is 3 non-atomic client calls | Single `transfer_player()` RPC (security definer, transactional) |
| M5 | No undo/audit for admin result edits | `results_audit` table or soft-fixture versioning |
| M6 | Possible duplicate players from sync race | `unique(team_id, lower(first_name), lower(last_name))` |
| M7 | No PWA manifest/service worker despite "PWA capable" goal | Expo web PWA plugin + manifest icons |

### Low
| # | Finding | Fix |
|---|---------|-----|
| L1 | Zero mobile tests | Jest + RNTL smoke suite for scoring/squad rules |
| L2 | `any` in admin screens | Type the API returns |
| L3 | seed/SETUP duplication | Generate SETUP.sql in CI from migrations+seed |
| L4 | EAS projectId placeholder | `eas init` once Apple/Google accounts exist |
| L5 | No multi-league `league_id` dimension | Decide pre-season-2; cheap now, costly later |

## 10. Recommended fix order

1. **C3** (user dashboard toggle, 5 min) → cron works tonight.
2. **C1 + C2** (one migration, biggest integrity win before Finals Night).
3. **H1–H3** (realtime, token privacy, OAuth callback) — matchday experience.
4. **H4** (CI gate) before any further deploys.
5. H5/H6, then Medium batch — then Phase 2 (UX) builds on a trustworthy base.
