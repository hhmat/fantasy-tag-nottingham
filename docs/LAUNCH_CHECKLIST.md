# Finals Night Launch Checklist — Mon 09 Nov 2026

Cup and Plate finals at Beeston, first whistle 19:30. This is the
go-live runbook: weekend setup → match-night operation → season wrap.

Pre-flight status (automated, 07 Nov):
- ✅ `npm install` — 971 packages, clean
- ✅ `npx tsc --noEmit` — clean
- ✅ `npx expo config` — icons, splash, plugins resolve
- ✅ Spawtz parser regression test — passing against live page samples

---

## A. Weekend (Sat 07 – Sun 08 Nov): backend + builds

### Supabase (30 min)
- [ ] Create project (region `eu-west-2`), note URL + anon + service-role keys
- [ ] Apply migrations in order: `0001` → `0002` → `0003` → `0004` → `0005`
- [ ] Run `supabase/seed.sql` in the SQL editor
- [ ] Verify: `select count(*) from teams;` → 12 · `players` → 156 ·
      `fixtures` → 62 · `player_match_stats` → ~380
- [ ] Verify Finals Night: `select * from v_fixtures where gameweek_id = 10;`
      → 6 scheduled fixtures, kickoffs 19:30/20:10/20:50
- [ ] Google OAuth configured (web client + redirect URL `fantasytag://auth/callback`)
- [ ] Store service key: `alter database postgres set app.service_role_key = '…';`

### Edge functions + cron (15 min)
- [ ] `supabase functions deploy weekly-reminders`
- [ ] `supabase functions deploy price-updates`
- [ ] `supabase functions deploy spawtz-sync`
- [ ] Create the 4 cron jobs (DEPLOYMENT.md §5–6): Monday 09:17 preview,
      Monday 16:47 deadline reminder (gameweek **10**), Monday 22:23 price
      updates, Monday 22:41 + Tuesday 09:13 spawtz-sync
- [ ] Invoke `spawtz-sync` with `{"dryRun": true}` → expect
      `fixtures_scraped: 41+`, no errors
- [ ] Invoke for real `{}` → check `sync_log` has one clean row

### Mobile builds (1–2 h, mostly waiting)
- [ ] `cd mobile && cp .env.example .env` + fill Supabase URL/anon key
- [ ] `eas build:configure`, set real `extra.eas.projectId` in `app.json`
- [ ] `eas build --profile production --platform ios` and `--platform android`
- [ ] Submit to TestFlight / Play internal track; install on ≥2 devices
- [ ] Register two test accounts; grant one `is_admin = true` (DEPLOYMENT.md §3)
- [ ] Smoke test on device: sign in (email + Google) → create team →
      pick 10 players (budget and 2-per-team blocks work) → set captain →
      leaderboards show real season points → player profile shows POTM ⭐ →
      fixtures GW10 shows the 6 finals

---

## B. Monday 09 Nov — match day

### Morning
- [ ] 09:17 — gameweek-preview push arrives on both test devices;
      tap it → opens Fixtures tab
- [ ] Check Spawtz for any late fixture changes; if needed press
      **Admin → Sync now** (or edit via Admin → Fixtures)

### Afternoon
- [ ] 16:47 — deadline reminder push arrives; tap → opens My Squad
- [ ] 18:30 — GW10 deadline passes; confirm no squad edits go through after
      (attempt a transfer on a test account → expect rejection)

### Evening (at the venue or following along)
- [ ] 19:30 — first games (Cup 5th/6th, Plate 3rd/4th): set fixtures **LIVE**
      in Admin → Fixtures, enter live scores as they happen
- [ ] As each game ends → Admin → Results: final score + per-player
      tries/assists/conversions/⭐/✓
- [ ] 20:10 — Plate Final + Plate 5th/6th; 20:50 — **Cup Final** (Mull of
      Kintag vs The Expletive Counters) + Cup 3rd/4th
- [ ] Watch the global + weekly leaderboards move in real time
- [ ] 22:23 — automatic price updates run
- [ ] 22:41 — automatic spawtz-sync runs; check it appears in
      Admin → Data sync → Recent runs with 0 errors
      (if Spawtz is slow to publish, it retries Tuesday 09:13)

---

## C. Tuesday 10 Nov — season wrap

- [ ] Mark the season done: `update gameweeks set is_finished = true where id = 10;`
- [ ] Screenshot the final global + weekly leaderboards for the league group
- [ ] Award announcement (top manager, top scorer, most POTM) — data is in
      `v_global_leaderboard` and `v_player_season_stats`
- [ ] Retro note: any Spawtz markup drift → update parser + rerun
      `python3 scraper/test_parser.py`
- [ ] Winter season prep: new Spawtz SeasonId/DivisionIds → set the
      `SPAWTZ_*` env vars on the edge function, add new gameweeks, done

## Rollback / incident quick reference

| Incident | Action |
| --- | --- |
| Wrong score entered | Admin → Results: re-open fixture, correct, re-save — points are derived, leaderboards fix themselves |
| spawtz-sync errors | Read `sync_log.errors`; page markup change → fix selectors in `spawtz-sync/index.ts`, update `scraper/samples/`, re-test |
| Push not arriving | Check `eas credentials`, device token in `profiles.expo_push_token`, function logs |
| Need to pause signups | `update profiles set is_admin = false …` is NOT it — disable Email provider in Supabase Auth temporarily |
