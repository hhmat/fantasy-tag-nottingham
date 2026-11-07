-- ============================================================================
-- Fantasy Tag Nottingham — 0003_functions.sql
-- Scoring, squad validation, result application, price engine, leaderboards.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Points from raw stats (single source of truth for the scoring table)
-- ---------------------------------------------------------------------------
create or replace function public.player_points(
  p_tries int, p_assists int, p_conversions int,
  p_pom boolean, p_win boolean, p_attended boolean
) returns int
language sql immutable as $$
  select p_tries * 5
       + p_assists * 3
       + p_conversions * 2
       + (case when p_pom      then 10 else 0 end)
       + (case when p_win      then 5  else 0 end)
       + (case when p_attended then 1  else 0 end);
$$;

-- ---------------------------------------------------------------------------
-- 2. Squad validation trigger
--    Enforced on every INSERT/UPDATE of fantasy_team_players:
--      • ≤ 10 active players
--      • exactly 0–1 captain (1 required once squad is full)
--      • ≤ 2 active players from the same real team
--      • Σ purchase_price of active players ≤ fantasy_teams.budget
-- ---------------------------------------------------------------------------
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

create trigger trg_validate_squad
  after insert or update on public.fantasy_team_players
  for each row execute function public.validate_squad();

-- ---------------------------------------------------------------------------
-- 3. Transfer accounting
--    First transfer per gameweek is free; each additional one costs 4 points.
--    Initial squad building (player_out_id is null) is always free.
-- ---------------------------------------------------------------------------
create or replace function public.price_transfer()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_used int;
begin
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

create trigger trg_price_transfer
  before insert on public.transfers
  for each row execute function public.price_transfer();

-- ---------------------------------------------------------------------------
-- 4. Apply match result → set win flags on that fixture's stat rows
-- ---------------------------------------------------------------------------
create or replace function public.apply_match_result()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'finished' and old.status is distinct from 'finished' then
    update public.player_match_stats s
       set win = case
           when new.home_score = new.away_score then false
           when (p.team_id = new.home_team_id and new.home_score > new.away_score) then true
           when (p.team_id = new.away_team_id and new.away_score > new.home_score) then true
           else false
         end,
         updated_at = now()
      from public.players p
     where p.id = s.player_id
       and s.fixture_id = new.id;
  end if;
  return new;
end;
$$;

create trigger trg_apply_match_result
  after update of status, home_score, away_score on public.fixtures
  for each row execute function public.apply_match_result();

-- keep updated_at fresh on manual stat edits
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger trg_pms_touch
  before update on public.player_match_stats
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Price-change engine
--    Net transfers in/out during a gameweek move a player's price:
--      net ≥ +50 → +0.2 | net ≥ +20 → +0.1 | net ≤ −50 → −0.2 | net ≤ −20 → −0.1
--    Prices clamp to [3.0, 15.0]. Callable from the price-updates edge fn.
-- ---------------------------------------------------------------------------
create or replace function public.apply_price_changes(p_gameweek int)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  v_new numeric(4,1);
  v_count int := 0;
begin
  for r in
    with ins as (
      select player_in_id as player_id, count(*) as n
        from public.transfers
       where gameweek_id = p_gameweek and player_out_id is not null
       group by 1
    ),
    outs as (
      select player_out_id as player_id, count(*) as n
        from public.transfers
       where gameweek_id = p_gameweek and player_out_id is not null
       group by 1
    )
    select p.id, p.price,
           coalesce(i.n, 0) - coalesce(o.n, 0) as net
      from public.players p
      left join ins  i on i.player_id = p.id
      left join outs o on o.player_id = p.id
     where p.active
  loop
    v_new := r.price + case
      when r.net >= 50 then 0.2
      when r.net >= 20 then 0.1
      when r.net <= -50 then -0.2
      when r.net <= -20 then -0.1
      else 0 end;
    v_new := greatest(3.0, least(15.0, v_new));

    if v_new <> r.price then
      update public.players set price = v_new where id = r.id;
      insert into public.price_history (player_id, gameweek_id, old_price, new_price)
      values (r.id, p_gameweek, r.price, v_new);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Leaderboard & stats views
-- ---------------------------------------------------------------------------

-- Per-player season totals
create or replace view public.v_player_season_stats as
select p.id            as player_id,
       p.first_name,
       p.last_name,
       p.position,
       p.price,
       p.active,
       p.team_id,
       t.name          as team_name,
       t.short_name    as team_short,
       coalesce(sum(s.tries), 0)        as tries,
       coalesce(sum(s.assists), 0)      as assists,
       coalesce(sum(s.conversions), 0)  as conversions,
       coalesce(sum(s.player_of_match::int), 0) as pom_awards,
       coalesce(sum(s.win::int), 0)     as wins,
       coalesce(sum(s.attended::int), 0) as appearances,
       coalesce(sum(public.player_points(s.tries, s.assists, s.conversions,
                                         s.player_of_match, s.win, s.attended)), 0) as total_points
  from public.players p
  join public.teams t on t.id = p.team_id
  left join public.player_match_stats s on s.player_id = p.id
 group by p.id, t.name, t.short_name;

-- Per-fantasy-team points for one gameweek (captain ×2, minus transfer hits)
create or replace view public.v_gameweek_points as
with squad_pts as (
  select ftp.fantasy_team_id,
         f.gameweek_id,
         sum(public.player_points(s.tries, s.assists, s.conversions,
                                  s.player_of_match, s.win, s.attended)
             * case when ftp.is_captain then 2 else 1 end) as pts
    from public.fantasy_team_players ftp
    join public.player_match_stats s on s.player_id = ftp.player_id
    join public.fixtures f           on f.id = s.fixture_id
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

-- Global leaderboard
create or replace view public.v_global_leaderboard as
select ft.id          as fantasy_team_id,
       ft.name        as team_name,
       pr.display_name as manager,
       coalesce(sum(gp.points), 0)::int as total_points,
       rank() over (order by coalesce(sum(gp.points), 0) desc) as rank
  from public.fantasy_teams ft
  join public.profiles pr on pr.id = ft.user_id
  left join public.v_gameweek_points gp on gp.fantasy_team_id = ft.id
 group by ft.id, ft.name, pr.display_name;

-- Weekly leaderboard (filter by gameweek in the query)
create or replace view public.v_weekly_leaderboard as
select gp.gameweek_id,
       ft.id   as fantasy_team_id,
       ft.name as team_name,
       pr.display_name as manager,
       gp.points,
       rank() over (partition by gp.gameweek_id order by gp.points desc) as rank
  from public.v_gameweek_points gp
  join public.fantasy_teams ft on ft.id = gp.fantasy_team_id
  join public.profiles pr      on pr.id = ft.user_id;

-- Fixture detail with team names (convenience for the app)
create or replace view public.v_fixtures as
select f.id, f.gameweek_id, f.kickoff, f.venue, f.status,
       f.home_score, f.away_score,
       ht.id as home_team_id, ht.name as home_team_name, ht.short_name as home_short,
       at.id as away_team_id, at.name as away_team_name, at.short_name as away_short
  from public.fixtures f
  join public.teams ht on ht.id = f.home_team_id
  join public.teams at on at.id = f.away_team_id;
