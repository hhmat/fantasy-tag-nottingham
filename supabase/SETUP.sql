-- ============================================================================
-- Fantasy Tag Nottingham — ALL-IN-ONE SETUP
-- Paste this entire file into the Supabase SQL Editor and click Run.
-- (Combines migrations 0001-0006 + real-season seed data)
-- ============================================================================

-- ============================================================================
-- Fantasy Tag Nottingham — 0001_schema.sql
-- Tables, enums, constraints, indexes.
-- Apply with: supabase db push  (or paste into the SQL editor in order)
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type player_position as enum ('Forward', 'Back', 'Utility');
create type fixture_status   as enum ('scheduled', 'live', 'finished', 'postponed');

-- ---------------------------------------------------------------------------
-- Real-world league
-- ---------------------------------------------------------------------------
create table public.teams (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,
  short_name      text not null,              -- e.g. 'TTN'
  primary_color   text not null default '#1E88E5',
  secondary_color text not null default '#FFFFFF',
  crest_url       text,
  created_at      timestamptz not null default now()
);

create table public.players (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams(id) on delete cascade,
  first_name text not null,
  last_name  text not null,
  position   player_position not null default 'Utility',
  price      numeric(4,1) not null default 6.0
             check (price >= 3.0 and price <= 15.0),
  active     boolean not null default true,
  photo_url  text,
  created_at timestamptz not null default now()
);
create index players_team_idx on public.players(team_id);
create index players_price_idx on public.players(price);

-- ---------------------------------------------------------------------------
-- Gameweeks & fixtures
-- ---------------------------------------------------------------------------
create table public.gameweeks (
  id          integer primary key,            -- 1, 2, 3, …
  name        text not null,                  -- 'Gameweek 1'
  deadline    timestamptz not null,           -- squad lock time
  is_finished boolean not null default false
);

create table public.fixtures (
  id           uuid primary key default gen_random_uuid(),
  gameweek_id  integer not null references public.gameweeks(id),
  home_team_id uuid not null references public.teams(id),
  away_team_id uuid not null references public.teams(id),
  kickoff      timestamptz not null,
  venue        text,
  home_score   integer check (home_score >= 0),
  away_score   integer check (away_score >= 0),
  status       fixture_status not null default 'scheduled',
  check (home_team_id <> away_team_id)
);
create index fixtures_gameweek_idx on public.fixtures(gameweek_id);
create index fixtures_status_idx   on public.fixtures(status) where status = 'live';

-- ---------------------------------------------------------------------------
-- Raw per-player match statistics (points are DERIVED, see 0003)
-- ---------------------------------------------------------------------------
create table public.player_match_stats (
  id              uuid primary key default gen_random_uuid(),
  fixture_id      uuid not null references public.fixtures(id) on delete cascade,
  player_id       uuid not null references public.players(id) on delete cascade,
  tries           integer not null default 0 check (tries >= 0),
  assists         integer not null default 0 check (assists >= 0),
  conversions     integer not null default 0 check (conversions >= 0),
  player_of_match boolean not null default false,
  win             boolean not null default false,   -- set by trigger on result
  attended        boolean not null default true,
  entered_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (fixture_id, player_id)
);
create index pms_player_idx  on public.player_match_stats(player_id);
create index pms_fixture_idx on public.player_match_stats(fixture_id);

-- ---------------------------------------------------------------------------
-- Users / fantasy teams
-- ---------------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text not null,
  is_admin        boolean not null default false,
  expo_push_token text,
  avatar_url      text,
  created_at      timestamptz not null default now()
);

create table public.fantasy_teams (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  name       text not null check (char_length(name) between 2 and 40),
  budget     numeric(5,1) not null default 100.0,
  created_at timestamptz not null default now(),
  unique (user_id)                            -- one squad per user (MVP)
);

create table public.fantasy_team_players (
  id              uuid primary key default gen_random_uuid(),
  fantasy_team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  player_id       uuid not null references public.players(id),
  is_captain      boolean not null default false,
  is_active       boolean not null default true,   -- false once transferred out
  purchase_price  numeric(4,1) not null,
  added_gameweek  integer not null references public.gameweeks(id),
  removed_gameweek integer references public.gameweeks(id),
  created_at      timestamptz not null default now()
);
create index ftp_team_idx   on public.fantasy_team_players(fantasy_team_id) where is_active;
create index ftp_player_idx on public.fantasy_team_players(player_id)       where is_active;

create table public.transfers (
  id              uuid primary key default gen_random_uuid(),
  fantasy_team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  gameweek_id     integer not null references public.gameweeks(id),
  player_in_id    uuid not null references public.players(id),
  player_out_id   uuid references public.players(id),  -- null for initial picks
  point_cost      integer not null default 0 check (point_cost >= 0),
  created_at      timestamptz not null default now()
);
create index transfers_gw_idx    on public.transfers(gameweek_id);
create index transfers_team_idx  on public.transfers(fantasy_team_id);
create index transfers_in_idx    on public.transfers(player_in_id);

create table public.price_history (
  id          bigint generated always as identity primary key,
  player_id   uuid not null references public.players(id) on delete cascade,
  gameweek_id integer references public.gameweeks(id),
  old_price   numeric(4,1) not null,
  new_price   numeric(4,1) not null,
  changed_at  timestamptz not null default now()
);
create index price_history_player_idx on public.price_history(player_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- Private leagues
-- ---------------------------------------------------------------------------
create table public.private_leagues (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(name) between 2 and 60),
  code            text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),
  commissioner_id uuid not null references public.profiles(id),
  created_at      timestamptz not null default now()
);

create table public.league_members (
  league_id       uuid not null references public.private_leagues(id) on delete cascade,
  fantasy_team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  joined_at       timestamptz not null default now(),
  primary key (league_id, fantasy_team_id)
);

-- ---------------------------------------------------------------------------
-- Auto-create profile on signup
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name',
             split_part(new.email, '@', 1), 'Player')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Fantasy Tag Nottingham — 0002_rls.sql
-- Row Level Security policies.
-- ============================================================================

alter table public.teams                 enable row level security;
alter table public.players               enable row level security;
alter table public.gameweeks             enable row level security;
alter table public.fixtures              enable row level security;
alter table public.player_match_stats    enable row level security;
alter table public.profiles              enable row level security;
alter table public.fantasy_teams         enable row level security;
alter table public.fantasy_team_players  enable row level security;
alter table public.transfers             enable row level security;
alter table public.price_history         enable row level security;
alter table public.private_leagues       enable row level security;
alter table public.league_members        enable row level security;

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- Public read-only league data; admin-only writes
-- ---------------------------------------------------------------------------
create policy "teams readable by all"        on public.teams      for select using (true);
create policy "admins manage teams"          on public.teams      for all    using (public.is_admin()) with check (public.is_admin());

create policy "players readable by all"      on public.players    for select using (true);
create policy "admins manage players"        on public.players    for all    using (public.is_admin()) with check (public.is_admin());

create policy "gameweeks readable by all"    on public.gameweeks  for select using (true);
create policy "admins manage gameweeks"      on public.gameweeks  for all    using (public.is_admin()) with check (public.is_admin());

create policy "fixtures readable by all"     on public.fixtures   for select using (true);
create policy "admins manage fixtures"       on public.fixtures   for all    using (public.is_admin()) with check (public.is_admin());

create policy "stats readable by all"        on public.player_match_stats for select using (true);
create policy "admins manage stats"          on public.player_match_stats for all using (public.is_admin()) with check (public.is_admin());

create policy "price history readable by all" on public.price_history for select using (true);
-- price_history is written by the price engine (service role) only.

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create policy "profiles readable by all"     on public.profiles for select using (true);
-- Users may update their own row but cannot grant themselves admin.
-- is_admin() is SECURITY DEFINER, so it reads the stored value without
-- recursing into this table's RLS policies.
create policy "users update own profile"     on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id and is_admin = public.is_admin());

-- ---------------------------------------------------------------------------
-- Fantasy teams & squads — owner only
-- ---------------------------------------------------------------------------
create policy "fantasy teams readable by all" on public.fantasy_teams for select using (true); -- needed for leaderboards
create policy "users create own team"         on public.fantasy_teams for insert with check (auth.uid() = user_id);
create policy "users update own team"         on public.fantasy_teams for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users delete own team"         on public.fantasy_teams for delete using (auth.uid() = user_id);

create policy "squads readable by all"        on public.fantasy_team_players for select using (true); -- leaderboards
create policy "owners manage squad"           on public.fantasy_team_players for all
  using (exists (select 1 from public.fantasy_teams ft
                 where ft.id = fantasy_team_id and ft.user_id = auth.uid()))
  with check (exists (select 1 from public.fantasy_teams ft
                      where ft.id = fantasy_team_id and ft.user_id = auth.uid()));

create policy "transfers readable by all"     on public.transfers for select using (true);
create policy "owners log transfers"          on public.transfers for insert
  with check (exists (select 1 from public.fantasy_teams ft
                      where ft.id = fantasy_team_id and ft.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Private leagues
-- ---------------------------------------------------------------------------
create policy "leagues readable by all"       on public.private_leagues for select using (true);
create policy "users create leagues"          on public.private_leagues for insert with check (auth.uid() = commissioner_id);
create policy "commissioner updates league"   on public.private_leagues for update using (auth.uid() = commissioner_id);
create policy "commissioner deletes league"   on public.private_leagues for delete using (auth.uid() = commissioner_id);

create policy "memberships readable by all"   on public.league_members for select using (true);
create policy "owners join leagues"           on public.league_members for insert
  with check (exists (select 1 from public.fantasy_teams ft
                      where ft.id = fantasy_team_id and ft.user_id = auth.uid()));
create policy "owners leave leagues"          on public.league_members for delete
  using (exists (select 1 from public.fantasy_teams ft
                 where ft.id = fantasy_team_id and ft.user_id = auth.uid())
         or exists (select 1 from public.private_leagues pl
                    where pl.id = league_id and pl.commissioner_id = auth.uid()));

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

-- ============================================================================
-- Fantasy Tag Nottingham — seed.sql
-- REAL DATA: Nottingham (Beeston) Try Tag Rugby — Autumn 2026 season
-- Source: trytagrugby.spawtz.com league 2246, season 100 (divisions 8811/8812)
--
--   Cup division:   Mull of Kintag, The Expletive Counters, County Tagpies,
--                   Taggingham Forest, Ay'up Me Tag!, Rock Tag City
--   Plate division: The Sherry Maggers, Tag Goose Chase, Tag Upon Trent,
--                   Tagville and Dean, Tags in Tights, Castle Ruck
--
-- Gameweeks 1–9 (07 Sep – 02 Nov 2026) include REAL results.
-- Gameweek 10 (09 Nov 2026) is the upcoming Cup/Plate finals night.
--
-- Players: 39 REAL named players from the Spawtz Player-of-the-Match
-- statistics (with their real POTM award counts applied to real fixtures);
-- the remaining roster spots are filled with generated names (13/team = 156).
--
-- Run AFTER the three migrations.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Gameweeks — deadlines 18:30 on each match night.
-- (Sep 7 – Oct 19 are BST +01; Oct 26 onwards are GMT +00.)
-- ---------------------------------------------------------------------------
insert into public.gameweeks (id, name, deadline, is_finished) values
  (1,  'Gameweek 1',   '2026-09-07 18:30:00+01', true),
  (2,  'Gameweek 2',   '2026-09-14 18:30:00+01', true),
  (3,  'Gameweek 3',   '2026-09-21 18:30:00+01', true),
  (4,  'Gameweek 4',   '2026-09-28 18:30:00+01', true),
  (5,  'Gameweek 5',   '2026-10-05 18:30:00+01', true),
  (6,  'Gameweek 6',   '2026-10-12 18:30:00+01', true),
  (7,  'Gameweek 7',   '2026-10-19 18:30:00+01', true),
  (8,  'Gameweek 8',   '2026-10-26 18:30:00+00', true),
  (9,  'Gameweek 9',   '2026-11-02 18:30:00+00', true),
  (10, 'Finals Night', '2026-11-09 18:30:00+00', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Teams (12)
-- ---------------------------------------------------------------------------
insert into public.teams (name, short_name, primary_color, secondary_color) values
  ('Ay''up Me Tag!',         'AMT', '#0B3D91', '#FFFFFF'),
  ('Castle Ruck',            'CRK', '#4A148C', '#FFFFFF'),
  ('County Tagpies',         'CTP', '#212121', '#FFFFFF'),
  ('Mull of Kintag',         'MOK', '#1B5E20', '#FFD54F'),
  ('Rock Tag City',          'RTC', '#B71C1C', '#FFFFFF'),
  ('Tag Goose Chase',        'TGC', '#006064', '#FFFFFF'),
  ('Tag Upon Trent',         'TUT', '#880E4F', '#FFFFFF'),
  ('Taggingham Forest',      'TGF', '#C62828', '#FFFFFF'),
  ('Tagville and Dean',      'TVD', '#37474F', '#FF6F00'),
  ('Tags in Tights',         'TIT', '#F9A825', '#212121'),
  ('The Expletive Counters', 'TEC', '#283593', '#FF5252'),
  ('The Sherry Maggers',     'TSM', '#004D40', '#B2DFDB')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Real players from the Spawtz POTM statistics, with award counts.
-- Price = £6.5m + £0.5m per POTM award (top performers are premium picks).
-- ---------------------------------------------------------------------------
create temporary table _real_players (
  team_short text, first_name text, last_name text, pom int
);

insert into _real_players values
  -- Mull of Kintag
  ('MOK', 'Ethan',     'Duddridge',       3),
  ('MOK', 'Reece',     'Jordan',          1),
  ('MOK', 'Adrian',    'Bourke',          1),
  ('MOK', 'Dan',       'McLean',          1),
  ('MOK', 'Anna',      'Mosley',          1),
  -- The Expletive Counters
  ('TEC', 'Emily',     'Gallivan',        3),
  ('TEC', 'Karan',     'Khera',           2),
  ('TEC', 'Faye',      'Wheatley',        1),
  -- Taggingham Forest
  ('TGF', 'Tom',       'Mansell',         2),
  ('TGF', 'Rose',      'Shipley',         2),
  ('TGF', 'Anna',      'Lucas',           1),
  -- Rock Tag City
  ('RTC', 'Beth',      'Evans',           2),
  ('RTC', 'Olivia',    'Bramble',         2),
  ('RTC', 'Conall',    'C',               1),
  ('RTC', 'Bea',       'Evans',           1),
  -- County Tagpies
  ('CTP', 'Indrani',   'Saha',            2),
  ('CTP', 'Sophie',    'Shearlaw',        1),
  ('CTP', 'Elizabeth', 'Barnes',          1),
  -- Ay'up Me Tag!
  ('AMT', 'Andy',      'Mack',            2),
  ('AMT', 'Szandra',   'Kormos',          1),
  ('AMT', 'Anthony',   'Clark',           1),
  -- The Sherry Maggers
  ('TSM', 'Francesca', 'Hamilton',        3),
  ('TSM', 'Luke',      'Marshall-O''Brien', 2),
  ('TSM', 'Helen',     'Tranter',         1),
  -- Tag Goose Chase
  ('TGC', 'Mike',      'Whitcutt',        2),
  ('TGC', 'Peter',     'Jackson',         1),
  ('TGC', 'Jonathon',  'Godfrey',         1),
  ('TGC', 'Natalie',   'Juson-Wright',    1),
  -- Tag Upon Trent
  ('TUT', 'Emily',     'Dale',            3),
  ('TUT', 'Mark',      'Seeger',          2),
  ('TUT', 'Liam',      'Welsh',           1),
  ('TUT', 'Lauren',    'Roitman',         1),
  -- Tagville and Dean
  ('TVD', 'Liam',      'Parker',          1),
  ('TVD', 'Sally',     'Slater',          1),
  ('TVD', 'Michael',   'Mowles',          1),
  -- Tags in Tights
  ('TIT', 'Vita',      'Rakers',          1),
  ('TIT', 'Luke',      'Chandler',        1),
  ('TIT', 'Amanda',    'Hunter',          1),
  ('TIT', 'Charlie',   'Heaton',          1);

insert into public.players (team_id, first_name, last_name, position, price)
select t.id, rp.first_name, rp.last_name, 'Utility',
       least(10.0, 6.5 + rp.pom * 0.5)
  from _real_players rp
  join public.teams t on t.short_name = rp.team_short
 where not exists (           -- idempotent: skip players already seeded
   select 1 from public.players p
    where p.team_id = t.id
      and p.first_name = rp.first_name
      and p.last_name  = rp.last_name
 );

-- ---------------------------------------------------------------------------
-- Generated players fill the remaining roster spots (13 per team, 156 total)
-- ---------------------------------------------------------------------------
do $$
declare
  t record;
  i int;
  v_need int;
  v_first text[] := array[
    'Alfie','Archie','Ben','Callum','Charlie','Dan','Dylan','Ed','Ellis','Finn',
    'Freddie','George','Harry','Hugo','Isaac','Jack','Jacob','Jamie','Joe','Josh',
    'Kai','Leo','Liam','Louie','Luke','Mason','Max','Nathan','Noah','Ollie',
    'Oscar','Owen','Reuben','Rory','Ryan','Sam','Seb','Teddy','Theo','Tom',
    'Aisha','Amelia','Beth','Chloe','Daisy','Ella','Evie','Freya','Grace','Holly',
    'Imogen','Isla','Jess','Katie','Lily','Lucy','Maisie','Mia','Millie','Niamh',
    'Olivia','Poppy','Ruby','Sofia','Sophie','Tia','Willow','Zara','Erin','Harriet'
  ];
  v_last text[] := array[
    'Abbott','Barker','Bennett','Birch','Bowen','Brewer','Briggs','Carter','Chambers','Clarke',
    'Cooper','Dawson','Draper','Ellis','Fletcher','Foster','Gibson','Gilbert','Goddard','Granger',
    'Harrison','Hartley','Hayes','Higgins','Holland','Hopkins','Hudson','Jarvis','Kemp','Kirk',
    'Lamb','Lawson','Lowe','Marsh','Mason','Middleton','Mills','Nash','Newton','Osborne',
    'Page','Palmer','Pearce','Potter','Pratt','Quinn','Radford','Reed','Rhodes','Robinson',
    'Saunders','Sharp','Slater','Spencer','Stevens','Sutton','Taylor','Thorpe','Turner','Wade',
    'Walker','Ward','Webb','Weston','White','Wild','Wilkins','Wood','Wright','Yates'
  ];
  v_positions text[] := array['Forward','Back','Utility'];
begin
  for t in select id from public.teams order by name loop
    select 13 - count(*) into v_need from public.players where team_id = t.id;
    for i in 1..v_need loop
      insert into public.players (team_id, first_name, last_name, position, price)
      values (
        t.id,
        v_first[1 + floor(random() * array_length(v_first, 1))::int],
        v_last[1 + floor(random() * array_length(v_last, 1))::int],
        v_positions[1 + floor(random() * 3)::int]::player_position,
        round((4.5 + random() * 5.5)::numeric, 1)
      );
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures — real Autumn 2026 season at Beeston (Pitch A / Pitch B).
-- GW1–9 finished with real scores; GW10 = scheduled finals.
-- (Two 'Beeston TTR Friendly' matches are excluded — not league fixtures.)
-- ---------------------------------------------------------------------------
create temporary table _fx (
  gw int, kickoff timestamptz, venue text,
  home text, away text, hs int, aw int, status fixture_status
);

insert into _fx values
  -- GW1 · Mon 07 Sep 2026
  (1, '2026-09-07 19:30+01', 'Beeston — Pitch A', 'TGF', 'RTC', 10,  8, 'finished'),
  (1, '2026-09-07 19:30+01', 'Beeston — Pitch B', 'TUT', 'TGC', 14,  5, 'finished'),
  (1, '2026-09-07 20:10+01', 'Beeston — Pitch A', 'AMT', 'TVD', 17,  1, 'finished'),
  (1, '2026-09-07 20:10+01', 'Beeston — Pitch B', 'MOK', 'CTP',  9,  2, 'finished'),
  (1, '2026-09-07 20:50+01', 'Beeston — Pitch A', 'TEC', 'TSM',  9,  5, 'finished'),
  -- GW2 · Mon 14 Sep 2026
  (2, '2026-09-14 19:30+01', 'Beeston — Pitch A', 'MOK', 'TUT', 17,  2, 'finished'),
  (2, '2026-09-14 19:30+01', 'Beeston — Pitch B', 'CTP', 'AMT',  5,  8, 'finished'),
  (2, '2026-09-14 20:10+01', 'Beeston — Pitch A', 'TSM', 'RTC',  4,  8, 'finished'),
  (2, '2026-09-14 20:50+01', 'Beeston — Pitch A', 'TEC', 'TGF', 10,  5, 'finished'),
  (2, '2026-09-14 20:50+01', 'Beeston — Pitch B', 'TGC', 'TVD',  6,  2, 'finished'),
  -- GW3 · Mon 21 Sep 2026
  (3, '2026-09-21 19:30+01', 'Beeston — Pitch B', 'TIT', 'TGF',  0, 13, 'finished'),
  (3, '2026-09-21 20:10+01', 'Beeston — Pitch A', 'TEC', 'RTC', 10, 10, 'finished'),
  (3, '2026-09-21 20:10+01', 'Beeston — Pitch B', 'AMT', 'TUT',  8, 10, 'finished'),
  (3, '2026-09-21 20:50+01', 'Beeston — Pitch A', 'MOK', 'TGC', 17,  2, 'finished'),
  (3, '2026-09-21 20:50+01', 'Beeston — Pitch B', 'CTP', 'TVD',  4,  3, 'finished'),
  -- GW4 · Mon 28 Sep 2026
  (4, '2026-09-28 19:30+01', 'Beeston — Pitch A', 'TUT', 'TVD',  8,  2, 'finished'),
  (4, '2026-09-28 20:10+01', 'Beeston — Pitch A', 'CTP', 'TGC', 16,  4, 'finished'),
  (4, '2026-09-28 20:10+01', 'Beeston — Pitch B', 'TEC', 'TIT',  9,  4, 'finished'),
  (4, '2026-09-28 20:50+01', 'Beeston — Pitch A', 'MOK', 'AMT',  6,  6, 'finished'),
  (4, '2026-09-28 20:50+01', 'Beeston — Pitch B', 'TSM', 'TGF',  6,  2, 'finished'),
  -- GW5 · Mon 05 Oct 2026
  (5, '2026-10-05 19:30+01', 'Beeston — Pitch A', 'TSM', 'TIT',  9,  7, 'finished'),
  (5, '2026-10-05 19:30+01', 'Beeston — Pitch B', 'TGC', 'AMT',  4,  8, 'finished'),
  (5, '2026-10-05 20:10+01', 'Beeston — Pitch A', 'TGF', 'TEC',  6,  4, 'finished'),
  (5, '2026-10-05 20:10+01', 'Beeston — Pitch B', 'MOK', 'TVD', 11,  1, 'finished'),
  (5, '2026-10-05 20:50+01', 'Beeston — Pitch A', 'TIT', 'RTC',  7, 15, 'finished'),
  (5, '2026-10-05 20:50+01', 'Beeston — Pitch B', 'CTP', 'TUT', 10,  8, 'finished'),
  -- GW6 · Mon 12 Oct 2026
  (6, '2026-10-12 19:30+01', 'Beeston — Pitch A', 'CRK', 'TGC',  2, 11, 'finished'),
  (6, '2026-10-12 19:30+01', 'Beeston — Pitch B', 'TIT', 'TVD',  6,  7, 'finished'),
  (6, '2026-10-12 20:10+01', 'Beeston — Pitch A', 'TSM', 'TUT',  9,  2, 'finished'),
  (6, '2026-10-12 20:10+01', 'Beeston — Pitch B', 'TGF', 'CTP',  1, 15, 'finished'),
  (6, '2026-10-12 20:50+01', 'Beeston — Pitch A', 'RTC', 'MOK',  2,  8, 'finished'),
  (6, '2026-10-12 20:50+01', 'Beeston — Pitch B', 'AMT', 'TEC',  6,  9, 'finished'),
  -- GW7 · Mon 19 Oct 2026
  (7, '2026-10-19 19:30+01', 'Beeston — Pitch A', 'TUT', 'TGC',  9, 11, 'finished'),
  (7, '2026-10-19 19:30+01', 'Beeston — Pitch B', 'TGF', 'RTC',  9,  9, 'finished'),
  (7, '2026-10-19 20:10+01', 'Beeston — Pitch A', 'CTP', 'TEC',  6,  7, 'finished'),
  (7, '2026-10-19 20:10+01', 'Beeston — Pitch B', 'CRK', 'TVD',  3, 12, 'finished'),
  (7, '2026-10-19 20:50+01', 'Beeston — Pitch A', 'TSM', 'TIT', 14,  1, 'finished'),
  (7, '2026-10-19 20:50+01', 'Beeston — Pitch B', 'AMT', 'MOK',  2, 14, 'finished'),
  -- GW8 · Mon 26 Oct 2026 (double-headers; clocks went back — GMT)
  (8, '2026-10-26 19:30+00', 'Beeston — Pitch A', 'TUT', 'TIT', 22,  2, 'finished'),
  (8, '2026-10-26 19:30+00', 'Beeston — Pitch B', 'CRK', 'TSM',  0, 32, 'finished'),
  (8, '2026-10-26 19:50+00', 'Beeston — Pitch A', 'TUT', 'TVD', 16,  0, 'finished'),
  (8, '2026-10-26 19:50+00', 'Beeston — Pitch B', 'TSM', 'TGC', 12,  4, 'finished'),
  (8, '2026-10-26 20:10+00', 'Beeston — Pitch A', 'CRK', 'TIT',  4, 10, 'finished'),
  (8, '2026-10-26 20:10+00', 'Beeston — Pitch B', 'MOK', 'TEC',  6,  4, 'finished'),
  (8, '2026-10-26 20:30+00', 'Beeston — Pitch A', 'AMT', 'RTC', 14,  0, 'finished'),
  (8, '2026-10-26 20:30+00', 'Beeston — Pitch B', 'TVD', 'TGC',  4, 10, 'finished'),
  (8, '2026-10-26 20:50+00', 'Beeston — Pitch A', 'CTP', 'MOK',  4, 12, 'finished'),
  (8, '2026-10-26 20:50+00', 'Beeston — Pitch B', 'TGF', 'TEC',  2, 10, 'finished'),
  (8, '2026-10-26 21:10+00', 'Beeston — Pitch A', 'CTP', 'RTC',  8,  8, 'finished'),
  (8, '2026-10-26 21:10+00', 'Beeston — Pitch B', 'AMT', 'TGF', 10, 12, 'finished'),
  -- GW9 · Mon 02 Nov 2026
  (9, '2026-11-02 19:30+00', 'Beeston — Pitch A', 'MOK', 'TGF',  9,  8, 'finished'),
  (9, '2026-11-02 19:30+00', 'Beeston — Pitch B', 'RTC', 'TEC',  5,  6, 'finished'),
  (9, '2026-11-02 20:10+00', 'Beeston — Pitch A', 'CTP', 'AMT',  9,  0, 'finished'),
  (9, '2026-11-02 20:10+00', 'Beeston — Pitch B', 'TVD', 'TSM',  7, 18, 'finished'),
  (9, '2026-11-02 20:50+00', 'Beeston — Pitch A', 'TUT', 'CRK', 10,  4, 'finished'),
  (9, '2026-11-02 20:50+00', 'Beeston — Pitch B', 'TIT', 'TGC',  2, 10, 'finished'),
  -- GW10 · Mon 09 Nov 2026 — Finals Night (scheduled)
  (10, '2026-11-09 19:30+00', 'Beeston — Pitch A', 'AMT', 'RTC', null, null, 'scheduled'),  -- Cup 5th/6th
  (10, '2026-11-09 19:30+00', 'Beeston — Pitch B', 'TUT', 'TVD', null, null, 'scheduled'),  -- Plate 3rd/4th
  (10, '2026-11-09 20:10+00', 'Beeston — Pitch A', 'TIT', 'CRK', null, null, 'scheduled'),  -- Plate 5th/6th
  (10, '2026-11-09 20:10+00', 'Beeston — Pitch B', 'TSM', 'TGC', null, null, 'scheduled'),  -- Plate Final
  (10, '2026-11-09 20:50+00', 'Beeston — Pitch A', 'MOK', 'TEC', null, null, 'scheduled'),  -- Cup Final
  (10, '2026-11-09 20:50+00', 'Beeston — Pitch B', 'CTP', 'TGF', null, null, 'scheduled');  -- Cup 3rd/4th

insert into public.fixtures
  (gameweek_id, home_team_id, away_team_id, kickoff, venue, home_score, away_score, status)
select f.gw, h.id, a.id, f.kickoff, f.venue, f.hs, f.aw, f.status
  from _fx f
  join public.teams h on h.short_name = f.home
  join public.teams a on a.short_name = f.away
 where not exists (           -- idempotent: skip fixtures already seeded
   select 1 from public.fixtures f2
    where f2.gameweek_id  = f.gw
      and f2.home_team_id = h.id
      and f2.away_team_id = a.id
 );

drop table _fx;

-- ---------------------------------------------------------------------------
-- Season statistics for the real players.
-- For every real player: one stats row per finished fixture their team
-- played — attended (+1), win bonus (+5) computed from the real scoreline,
-- and Player of the Match (+10) assigned to their earliest N appearances
-- matching their real Spawtz award count. Tries/assists/conversions are not
-- published per-player by Spawtz, so they stay 0 until entered via Admin.
-- ---------------------------------------------------------------------------
with rp as (
  select p.id as player_id, p.team_id, x.pom
    from _real_players x
    join public.teams t on t.short_name = x.team_short
    join public.players p
      on p.team_id   = t.id
     and p.first_name = x.first_name
     and p.last_name  = x.last_name
),
fx as (
  select f.id, f.home_team_id, f.away_team_id, f.home_score, f.away_score,
         tm.team_id,
         row_number() over (partition by tm.team_id order by f.kickoff) as rn
    from public.fixtures f
    join (select id as team_id from public.teams) tm
      on f.home_team_id = tm.team_id or f.away_team_id = tm.team_id
   where f.status = 'finished'
)
insert into public.player_match_stats
  (fixture_id, player_id, tries, assists, conversions, player_of_match, win, attended)
select fx.id,
       rp.player_id,
       0, 0, 0,
       fx.rn <= rp.pom,
       (fx.home_team_id = rp.team_id and fx.home_score > fx.away_score)
       or (fx.away_team_id = rp.team_id and fx.away_score > fx.home_score),
       true
  from rp
  join fx on fx.team_id = rp.team_id
on conflict (fixture_id, player_id) do nothing;

drop table _real_players;
