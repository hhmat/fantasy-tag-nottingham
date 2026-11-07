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
