-- ============================================================================
-- Fantasy Tag Nottingham — 0006_deadline_and_captain_history.sql
-- Fixes audit findings C1 (no deadline enforcement) and C2 (captain changes
-- rewriting historical points).
--
--   C1  All squad mutations (picks, transfers in/out, captain changes) are
--       rejected once the current open gameweek's deadline has passed.
--   C2  Captaincy is now recorded per gameweek in public.captain_picks, so
--       changing your captain only affects the gameweek the change is for.
--       Historical gameweeks without a pick fall back to the legacy
--       is_captain flag, preserving pre-migration points.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Gameweek-scoped captaincy
-- ---------------------------------------------------------------------------
create table public.captain_picks (
  fantasy_team_id uuid    not null references public.fantasy_teams(id) on delete cascade,
  gameweek_id     integer not null references public.gameweeks(id),
  squad_row_id    uuid    not null references public.fantasy_team_players(id) on delete cascade,
  set_at          timestamptz not null default now(),
  primary key (fantasy_team_id, gameweek_id)
);
create index captain_picks_team_idx on public.captain_picks(fantasy_team_id);

alter table public.captain_picks enable row level security;

create policy "captain picks readable by all" on public.captain_picks
  for select using (true);
create policy "owners manage captain picks" on public.captain_picks
  for all
  using (exists (select 1 from public.fantasy_teams ft
                 where ft.id = fantasy_team_id and ft.user_id = auth.uid()))
  with check (exists (select 1 from public.fantasy_teams ft
                      where ft.id = fantasy_team_id and ft.user_id = auth.uid()));

-- Backfill BEFORE the trigger exists (it would reject the insert once the
-- deadline has passed): keep everyone's current captain for the earliest
-- OPEN gameweek, so nothing changes for picks already made.
insert into public.captain_picks (fantasy_team_id, gameweek_id, squad_row_id)
select ftp.fantasy_team_id, g.id, ftp.id
  from public.fantasy_team_players ftp
  cross join lateral (
    select id from public.gameweeks
     where not is_finished order by id limit 1
  ) g
 where ftp.is_captain and ftp.is_active
on conflict do nothing;

-- A pick must reference an ACTIVE squad row owned by the same fantasy team,
-- and the gameweek's deadline must not have passed.
create or replace function public.validate_captain_pick()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.fantasy_team_players
     where id = new.squad_row_id
       and fantasy_team_id = new.fantasy_team_id
       and is_active
  ) then
    raise exception 'Captain must be an active member of your squad.';
  end if;

  if now() > (select deadline from public.gameweeks where id = new.gameweek_id) then
    raise exception 'Captain locked: the deadline for this gameweek has passed.';
  end if;

  return new;
end;
$$;

create trigger trg_validate_captain_pick
  before insert or update on public.captain_picks
  for each row execute function public.validate_captain_pick();

-- ---------------------------------------------------------------------------
-- 2. C1 — deadline enforcement on squads
--    The "open" gameweek is the earliest unfinished one. Once its deadline
--    passes, all squad mutations are rejected until an admin marks the
--    gameweek finished (which opens the next one).
-- ---------------------------------------------------------------------------
create or replace function public.assert_squad_unlocked()
returns void
language plpgsql stable security definer set search_path = public
as $$
declare
  v_name     text;
  v_deadline timestamptz;
begin
  select name, deadline into v_name, v_deadline
    from public.gameweeks
   where not is_finished
   order by id
   limit 1;

  -- No open gameweek → season over → editing is harmless.
  if v_deadline is not null and now() > v_deadline then
    raise exception 'Squad locked: the % deadline (%) has passed. Changes reopen once results are finalised.',
      v_name, to_char(v_deadline at time zone 'Europe/London', 'Dy DD Mon HH24:MI');
  end if;
end;
$$;

-- Enforce inside the existing squad validator (fires on insert AND update,
-- covering picks, transfers out and legacy captain toggles).
create or replace function public.validate_squad()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_team_id uuid := coalesce(new.fantasy_team_id, old.fantasy_team_id);
  v_count   int;
  v_captains int;
  v_spend   numeric(5,1);
  v_budget  numeric(5,1);
  v_dupes   int;
begin
  perform public.assert_squad_unlocked();

  select count(*),
         count(*) filter (where is_captain),
         coalesce(sum(purchase_price), 0)
    into v_count, v_captains, v_spend
    from public.fantasy_team_players
   where fantasy_team_id = v_team_id and is_active;

  if v_count > 10 then
    raise exception 'Squad is full (maximum 10 players).';
  end if;

  if v_captains > 1 then
    raise exception 'A squad can only have one captain.';
  end if;

  select budget into v_budget from public.fantasy_teams where id = v_team_id;
  if v_spend > v_budget then
    raise exception 'Budget exceeded: £%m spent of £%m.', v_spend, v_budget;
  end if;

  select max(cnt) into v_dupes from (
    select count(*) as cnt
      from public.fantasy_team_players ftp
      join public.players p on p.id = ftp.player_id
     where ftp.fantasy_team_id = v_team_id and ftp.is_active
     group by p.team_id
  ) s;
  if coalesce(v_dupes, 0) > 2 then
    raise exception 'Maximum 2 players from the same real team.';
  end if;

  return coalesce(new, old);
end;
$$;

-- Transfers are logged for a specific gameweek — reject logs for gameweeks
-- whose deadline has passed.
create or replace function public.price_transfer()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_used int;
begin
  if now() > (select deadline from public.gameweeks where id = new.gameweek_id) then
    raise exception 'Transfer window closed: the deadline for this gameweek has passed.';
  end if;

  if new.player_out_id is null then
    new.point_cost := 0;
    return new;
  end if;

  select count(*) into v_used
    from public.transfers
   where fantasy_team_id = new.fantasy_team_id
     and gameweek_id     = new.gameweek_id
     and player_out_id is not null
     and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  new.point_cost := case when v_used = 0 then 0 else 4 end;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. C2 — points view uses gameweek-scoped captaincy
--    For gameweeks that have a captain_picks row: only that player doubles.
--    For gameweeks without one (all pre-0006 history): legacy is_captain
--    flag applies, so existing totals are preserved exactly.
-- ---------------------------------------------------------------------------
create or replace view public.v_gameweek_points as
with squad_pts as (
  select ftp.fantasy_team_id,
         f.gameweek_id,
         sum(public.player_points(s.tries, s.assists, s.conversions,
                                  s.player_of_match, s.win, s.attended)
             * case
                 when cp.squad_row_id is not null then 2          -- picked for this gw
                 when cp_any.fantasy_team_id is null
                      and ftp.is_captain then 2                     -- legacy fallback
                 else 1
               end) as pts
    from public.fantasy_team_players ftp
    join public.player_match_stats s on s.player_id = ftp.player_id
    join public.fixtures f           on f.id = s.fixture_id
    left join public.captain_picks cp
           on cp.fantasy_team_id = ftp.fantasy_team_id
          and cp.gameweek_id     = f.gameweek_id
          and cp.squad_row_id    = ftp.id
    left join (select distinct fantasy_team_id, gameweek_id
                 from public.captain_picks) cp_any
           on cp_any.fantasy_team_id = ftp.fantasy_team_id
          and cp_any.gameweek_id     = f.gameweek_id
   where ftp.is_active
     and f.gameweek_id >= ftp.added_gameweek
     and (ftp.removed_gameweek is null or f.gameweek_id < ftp.removed_gameweek)
   group by ftp.fantasy_team_id, f.gameweek_id
),
hits as (
  select fantasy_team_id, gameweek_id, sum(point_cost) as hit
    from public.transfers
   group by 1, 2
)
select sp.fantasy_team_id,
       sp.gameweek_id,
       (sp.pts - coalesce(h.hit, 0))::int as points
  from squad_pts sp
  left join hits h
    on h.fantasy_team_id = sp.fantasy_team_id
   and h.gameweek_id     = sp.gameweek_id;
