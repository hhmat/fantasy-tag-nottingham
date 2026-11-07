# Fantasy Tag Nottingham — Deployment Guide

Target: production Supabase backend + iOS/Android apps built with EAS.

---

## 1. Supabase project setup

1. Create a project at [supabase.com](https://supabase.com) (region: `eu-west-2`
   London is closest to Nottingham). Note the **project URL** and **anon key**
   (Settings → API). Keep the **service-role key** secret.
2. Install the CLI and link:
   ```bash
   npm i -g supabase
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   ```
3. Apply the database:
   ```bash
   # from the repo root, with supabase/migrations/ copied into your
   # Supabase project folder (or run each file in the dashboard SQL editor, in order)
   supabase db push
   ```
   Order matters: `0001_schema.sql` → `0002_rls.sql` → `0003_functions.sql`
   → `0004_sync.sql` → `0005_sync_log.sql`.
4. Seed the league: paste `supabase/seed.sql` into the SQL editor and run it.
   This loads the **real Nottingham (Beeston) Autumn 2026 season**: the 12
   teams (Cup and Plate divisions), all 9 completed gameweeks with real
   scores, the scheduled Finals Night fixtures for Mon 09 Nov 2026, and
   **39 real players from the Spawtz POTM statistics** with their award
   counts applied to real fixtures (so leaderboards start with meaningful
   points). Remaining roster spots are filled with generated names —
   replace them via Admin → Players as real rosters are confirmed.

## 2. Authentication

### Email
Enabled by default. For production set up a custom SMTP sender
(Authentication → Providers → Email) so confirmation mails don't land in spam.

### Google
1. Google Cloud Console → create an OAuth 2.0 **Web** client.
   - Authorised redirect URI: `https://YOUR_PROJECT.supabase.co/auth/v1/callback`
2. Supabase dashboard → Authentication → Providers → Google → paste client
   ID/secret and enable.
3. Authentication → URL Configuration → add redirect URL:
   ```
   fantasytag://auth/callback
   ```
4. For standalone builds, also create **iOS** and **Android** OAuth clients in
   Google Cloud (bundle IDs `com.fantasytag.nottingham`) — Supabase uses the web
   client for the exchange, but Google requires the native clients to exist.

## 3. Make yourself admin

After registering in the app:

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'you@example.com');
```

The 🛠 Admin entry appears on the Home screen after re-login.

## 4. Mobile app configuration

```bash
cd mobile
cp .env.example .env
# fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
npm install
npx expo start          # dev: scan QR with Expo Go
```

TypeScript check: `npm run typecheck`.

## 5. Spawtz auto-sync (results, fixtures, POTM)

The `spawtz-sync` edge function scrapes the Try Tag Rugby Spawtz pages and
keeps the database current — new results, newly scheduled fixtures and
Player-of-the-Match awards. It is idempotent (Spawtz IDs are stored in
`external_id`) and skips exhibition opponents such as "Beeston TTR Friendly".

1. Deploy:
   ```bash
   supabase functions deploy spawtz-sync
   ```
2. Schedule with pg_cron — Monday night after the final whistle and again
   Tuesday morning for late-entered results:
   ```sql
   select cron.schedule('spawtz-sync-mon', '41 22 * * 1',
     $$select net.http_post(
       url := 'https://YOUR_PROJECT.supabase.co/functions/v1/spawtz-sync',
       headers := jsonb_build_object(
         'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
         'Content-Type', 'application/json'),
       body := '{}'::jsonb);$$);

   select cron.schedule('spawtz-sync-tue', '13 9 * * 2',
     $$select net.http_post(
       url := 'https://YOUR_PROJECT.supabase.co/functions/v1/spawtz-sync',
       headers := jsonb_build_object(
         'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
         'Content-Type', 'application/json'),
       body := '{}'::jsonb);$$);
   ```
3. Test manually from the app (Admin → Data sync → **Sync now**) or from the
   dashboard (Functions → spawtz-sync → Invoke) with body `{"dryRun": true}`
   first — it reports what it scraped without writing. Then invoke with `{}`
   and check the returned summary counts.
   The in-app button authenticates with the admin's own session JWT; the
   function only accepts the service-role key (cron) or a JWT belonging to a
   profile with `is_admin = true`. Runs that report errors push an alert to
   all admin devices automatically.
4. Next season: set the function env vars `SPAWTZ_LEAGUE_ID`,
   `SPAWTZ_SEASON_ID` and `SPAWTZ_DIVISIONS` (comma-separated division IDs
   from the Spawtz URLs) — no code changes needed.

The parser logic is regression-tested against saved page samples:
`python3 scraper/test_parser.py`.

## 6. Push notifications & scheduled jobs

1. Deploy the edge functions:
   ```bash
   supabase functions deploy weekly-reminders
   supabase functions deploy price-updates
   supabase functions deploy spawtz-sync   # see §5
   ```
2. Enable `pg_cron` (Database → Extensions) and schedule:
   ```sql
   select cron.schedule('gw-preview',  '17 9 * * 1',   -- Mon 09:17
     $$select net.http_post(
       url := 'https://YOUR_PROJECT.supabase.co/functions/v1/weekly-reminders',
       headers := jsonb_build_object(
         'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
         'Content-Type', 'application/json'),
       body := '{"kind":"gameweek_preview","gameweek":2}'::jsonb);$$);

   select cron.schedule('gw-deadline', '47 16 * * 1',  -- Mon 16:47, ~2h before 18:30 lock
     $$select net.http_post(
       url := 'https://YOUR_PROJECT.supabase.co/functions/v1/weekly-reminders',
       headers := jsonb_build_object(
         'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
         'Content-Type', 'application/json'),
       body := '{"kind":"deadline","gameweek":2}'::jsonb);$$);

   select cron.schedule('price-updates', '23 22 * * 1', -- Mon 22:23, after the final whistle
     $$select net.http_post(
       url := 'https://YOUR_PROJECT.supabase.co/functions/v1/price-updates',
       headers := jsonb_build_object(
         'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
         'Content-Type', 'application/json'),
       body := '{"gameweek":2}'::jsonb);$$);
   ```
   Store the key once: `alter database postgres set app.service_role_key = 'YOUR_SERVICE_ROLE_KEY';`
   Update the `gameweek` values each round (or wrap in a small SQL function
   that reads the current gameweek — left as an exercise, the API is stable).

3. Register an Expo push project: `eas credentials` + set
   `extra.eas.projectId` in `mobile/app.json`.

## 7. Build & ship with EAS

```bash
npm i -g eas-cli
eas login
cd mobile
eas build:configure

# Internal testing builds
eas build --profile development --platform ios
eas build --profile development --platform android

# Production
eas build --profile production --platform ios
eas build --profile production --platform android

# Submit
eas submit --platform ios      # App Store Connect
eas submit --platform android  # Google Play
```

Required accounts: Apple Developer ($99/yr), Google Play ($25 one-off).

### Over-the-air updates (JS-only changes)
```bash
eas update --branch production --message "Fix fixture ordering"
```

## 8. Production checklist

- [ ] Gameweek deadlines in `seed.sql` match the real fixture calendar
- [ ] Google OAuth redirect URLs registered (Supabase + app scheme)
- [ ] Custom SMTP configured
- [ ] Admin flag granted to league organisers only
- [ ] `extra.eas.projectId` set (push tokens)
- [ ] pg_cron jobs live (check `select * from cron.job;`)
- [ ] Service-role key never shipped in the app bundle (RLS protects all tables)
- [ ] Test full loop: register → create team → pick 10 → admin enters result →
      leaderboard updates → push reminder received

## 9. Web version on GitHub Pages

The Expo app doubles as a web app (react-native-web). The repo ships a
GitHub Actions workflow (`.github/workflows/deploy-web.yml`) that builds the
static site and publishes it to GitHub Pages on every push to `main`.

One-time setup:

```bash
# 1. Create the GitHub repo and push
brew install gh && gh auth login
git init && git add -A && git commit -m "Fantasy Tag Nottingham"
gh repo create fantasy-tag-nottingham --public --source . --push

# 2. Add the Supabase secrets used at build time
gh secret set EXPO_PUBLIC_SUPABASE_URL   --body "https://YOUR_PROJECT.supabase.co"
gh secret set EXPO_PUBLIC_SUPABASE_ANON_KEY --body "YOUR_ANON_KEY"

# 3. GitHub → repo Settings → Pages → Source: "GitHub Actions"
```

Every push to `main` redeploys to
`https://YOUR_USERNAME.github.io/fantasy-tag-nottingham/`.

Notes:
- The workflow sets `EXPO_BASE_URL` to the repo name automatically
  (`mobile/app.config.ts` reads it), so asset paths work under the Pages
  subpath. `dist/404.html` makes deep links (e.g. `/leagues`) survive refresh.
- The anon key is safe to ship — all tables are protected by RLS.
- For Google sign-in on the web build, add
  `https://YOUR_USERNAME.github.io/fantasy-tag-nottingham/auth/callback`
  to Supabase → Authentication → Redirect URLs.
- Push notifications are unavailable on the web build (no Expo push token on
  web) — everything else works.
- Local preview of the web build: `npx expo start --web` (in `mobile/`).

## 10. Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Squad is full" on the 8th player | Check stale rows: `fantasy_team_players` with `is_active` left true after a failed transfer |
| Leaderboard shows 0 for everyone | Points come from `player_match_stats`; ensure fixtures are `finished` so win flags apply |
| Google sign-in loops back to browser | Redirect URL mismatch — must be exactly `fantasytag://auth/callback` |
| Push notifications not arriving | Token must start with `ExponentPushToken`; check `eas credentials` and the function logs |
| RLS "permission denied" for admin actions | `profiles.is_admin` is false, or the user changed their own row (policy blocks self-promotion) |
