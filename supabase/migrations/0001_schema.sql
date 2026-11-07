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
