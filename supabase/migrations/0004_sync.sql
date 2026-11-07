-- ============================================================================
-- Fantasy Tag Nottingham — 0004_sync.sql
-- Support columns + helpers for the spawtz-sync edge function.
-- ============================================================================

-- Spawtz IDs make sync idempotent (fixtures/teams matched even after renames)
alter table public.teams    add column if not exists external_id bigint unique;
alter table public.fixtures add column if not exists external_id bigint unique;

-- Recompute win flags on every stat row belonging to a finished fixture.
-- Needed because sync may insert fixtures directly as 'finished' (the
-- apply_match_result trigger only fires on UPDATE of status).
create or replace function public.sync_win_flags()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.player_match_stats s
     set win = case
         when f.home_score = f.away_score then false
         when (p.team_id = f.home_team_id and f.home_score > f.away_score) then true
         when (p.team_id = f.away_team_id and f.away_score > f.home_score) then true
         else false
       end,
       updated_at = now()
    from public.fixtures f
    join public.players p on p.id = s.player_id
   where f.id = s.fixture_id
     and f.status = 'finished';
end;
$$;

-- Find the gameweek whose deadline falls on a given London-local date,
-- creating one (id = max + 1, deadline 18:30 local) when it doesn't exist.
create or replace function public.gameweek_for_date(p_date date)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_id integer;
begin
  select g.id into v_id
    from public.gameweeks g
   where (g.deadline at time zone 'Europe/London')::date = p_date
   limit 1;

  if v_id is null then
    insert into public.gameweeks (id, name, deadline)
    select coalesce(max(id), 0) + 1,
           'Gameweek ' || (coalesce(max(id), 0) + 1),
           (p_date::text || ' 18:30:00')::timestamp
             at time zone 'Europe/London'  -- stored as timestamptz
      from public.gameweeks
    returning id into v_id;
  end if;

  return v_id;
end;
$$;
