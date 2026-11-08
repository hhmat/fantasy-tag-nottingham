-- ============================================================================
-- Fantasy Tag Nottingham — 0015_match_events.sql
-- Phase 5: informational Match Centre event timeline.
-- Run AFTER migration 0014. player_match_stats remains authoritative for
-- fantasy scoring: adding/removing an event does NOT change points or score.
-- ============================================================================

create table public.match_events (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  event_type text not null check (event_type in ('try', 'assist', 'conversion', 'player_of_match')),
  minute integer check (minute between 0 and 120),
  occurred_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index match_events_fixture_time_idx
  on public.match_events(fixture_id, occurred_at, created_at);
create index match_events_player_idx on public.match_events(player_id);

-- Keep denormalised team_id consistent with both the player and fixture. This
-- also prevents an admin/client bug attributing an event to the wrong team.
create or replace function public.validate_match_event()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_player_team uuid;
  v_home_team uuid;
  v_away_team uuid;
begin
  select team_id into v_player_team from public.players where id = new.player_id;
  select home_team_id, away_team_id into v_home_team, v_away_team
    from public.fixtures where id = new.fixture_id;

  if v_player_team is null or v_home_team is null then
    raise exception 'The selected player or fixture does not exist.';
  end if;
  if new.team_id <> v_player_team then
    raise exception 'The event team must match the player''s real team.';
  end if;
  if new.team_id not in (v_home_team, v_away_team) then
    raise exception 'The selected player did not belong to a team in this fixture.';
  end if;
  return new;
end;
$$;

create trigger match_events_validate
  before insert or update of fixture_id, player_id, team_id
  on public.match_events
  for each row execute function public.validate_match_event();

alter table public.match_events enable row level security;

create policy "match events readable by all" on public.match_events
  for select to anon, authenticated using (true);
create policy "admins manage match events" on public.match_events
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.match_events to anon, authenticated;
grant insert, update, delete on public.match_events to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'match_events'
  ) then
    alter publication supabase_realtime add table public.match_events;
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');
