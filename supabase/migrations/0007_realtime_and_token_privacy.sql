-- ============================================================================
-- Fantasy Tag Nottingham — 0007_realtime_and_token_privacy.sql
-- Fixes audit findings H1 (live scores never pushed) and H2 (push tokens
-- world-readable through the profiles table).
--
--   H1  Add fixtures + player_match_stats to the supabase_realtime
--       publication. The app's subscribeToLiveScores() channel was already
--       wired up — it just never received events.
--
--   H2  expo_push_token is a capability (anyone holding it can push to that
--       device). Postgres column privileges are additive, so a column-level
--       REVOKE alone cannot override the table-level grant — instead revoke
--       the table grant and re-grant every column EXCEPT the token.
--       Edge functions use the service role and are unaffected.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- H1 — Realtime publication
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fixtures'
  ) then
    alter publication supabase_realtime add table public.fixtures;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'player_match_stats'
  ) then
    alter publication supabase_realtime add table public.player_match_stats;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- H2 — Hide push tokens from anon/authenticated reads
-- ---------------------------------------------------------------------------
revoke select on public.profiles from anon, authenticated;
grant select (id, display_name, is_admin, avatar_url, created_at)
  on public.profiles to anon, authenticated;

-- PostgREST caches the schema; tell it to reload so the column disappears
-- from select=* responses immediately.
select pg_notify('pgrst', 'reload schema');
