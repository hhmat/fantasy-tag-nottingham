-- ============================================================================
-- Fantasy Tag Nottingham — 0014_squad_formations.sql
-- Phase 4: per-gameweek starting 7, substitutes and interactive pitch layout.
-- Formation selection is visual only; it does not alter existing scoring.
-- Run AFTER migration 0013.
-- ============================================================================

create table public.squad_formations (
  fantasy_team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  gameweek_id integer not null references public.gameweeks(id) on delete cascade,
  squad_row_id uuid not null references public.fantasy_team_players(id) on delete cascade,
  is_starter boolean not null,
  position_x numeric(5,4) not null check (position_x between 0 and 1),
  position_y numeric(5,4) not null check (position_y between 0 and 1),
  bench_order integer not null default 0 check (bench_order >= 0),
  updated_at timestamptz not null default now(),
  primary key (fantasy_team_id, gameweek_id, squad_row_id)
);

create index squad_formations_team_gw_idx
  on public.squad_formations(fantasy_team_id, gameweek_id);
create unique index squad_formations_bench_order_uniq
  on public.squad_formations(fantasy_team_id, gameweek_id, bench_order)
  where not is_starter;

alter table public.squad_formations enable row level security;

-- Formations are private before and after the deadline. There are deliberately
-- no client write policies: all mutations pass through the validated RPC below.
create policy "owners read squad formations" on public.squad_formations
  for select using (
    exists (
      select 1 from public.fantasy_teams ft
       where ft.id = fantasy_team_id and ft.user_id = auth.uid()
    )
  );

create or replace function public.save_squad_formation(
  p_fantasy_team_id uuid,
  p_gameweek_id integer,
  p_entries jsonb
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_active_count integer;
  v_entry_count integer;
  v_distinct_count integer;
  v_starter_count integer;
begin
  if not exists (
    select 1 from public.fantasy_teams
     where id = p_fantasy_team_id and user_id = auth.uid()
  ) then
    raise exception 'You can only save a formation for your own squad.';
  end if;

  perform public.assert_squad_unlocked();
  if now() > (select deadline from public.gameweeks where id = p_gameweek_id) then
    raise exception 'Formation locked: the deadline for this gameweek has passed.';
  end if;

  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'Formation must be a JSON array.';
  end if;

  select count(*) into v_active_count
    from public.fantasy_team_players
   where fantasy_team_id = p_fantasy_team_id and is_active;

  with entries as (
    select (value->>'squad_row_id')::uuid as squad_row_id,
           (value->>'is_starter')::boolean as is_starter
      from jsonb_array_elements(p_entries)
  )
  select count(*),
         count(distinct squad_row_id),
         count(*) filter (where is_starter)
    into v_entry_count, v_distinct_count, v_starter_count
    from entries;

  if v_entry_count <> v_active_count or v_distinct_count <> v_active_count then
    raise exception 'Formation must contain every active squad player exactly once.';
  end if;

  if v_starter_count <> least(7, v_active_count) then
    raise exception 'Formation must have % starters.', least(7, v_active_count);
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_entries) e
      left join public.fantasy_team_players ftp
        on ftp.id = (e.value->>'squad_row_id')::uuid
       and ftp.fantasy_team_id = p_fantasy_team_id
       and ftp.is_active
     where ftp.id is null
  ) then
    raise exception 'Formation contains a player outside your active squad.';
  end if;

  delete from public.squad_formations
   where fantasy_team_id = p_fantasy_team_id
     and gameweek_id = p_gameweek_id;

  insert into public.squad_formations (
    fantasy_team_id, gameweek_id, squad_row_id, is_starter,
    position_x, position_y, bench_order, updated_at
  )
  select p_fantasy_team_id,
         p_gameweek_id,
         (value->>'squad_row_id')::uuid,
         (value->>'is_starter')::boolean,
         (value->>'position_x')::numeric,
         (value->>'position_y')::numeric,
         coalesce((value->>'bench_order')::integer, 0),
         now()
    from jsonb_array_elements(p_entries);
end;
$$;

revoke execute on function public.save_squad_formation(uuid, integer, jsonb) from public;
grant execute on function public.save_squad_formation(uuid, integer, jsonb) to authenticated;

select pg_notify('pgrst', 'reload schema');
