-- ============================================================================
-- Fantasy Tag Nottingham — 0005_sync_log.sql
-- History of spawtz-sync runs, visible to admins in the app.
-- ============================================================================

create table public.sync_log (
  id                  bigint generated always as identity primary key,
  ran_at              timestamptz not null default now(),
  triggered_by        uuid references auth.users(id),  -- null for pg_cron runs
  fixtures_scraped    integer not null default 0,
  fixtures_upserted   integer not null default 0,
  teams_created       integer not null default 0,
  pom_players         integer not null default 0,
  pom_awards_applied  integer not null default 0,
  error_count         integer not null default 0,
  errors              jsonb not null default '[]'::jsonb
);

alter table public.sync_log enable row level security;

-- Admins can read the log; rows are written by the edge function (service role).
create policy "admins read sync log" on public.sync_log
  for select using (public.is_admin());

create index sync_log_ran_at_idx on public.sync_log(ran_at desc);
