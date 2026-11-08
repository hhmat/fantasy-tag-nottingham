-- ============================================================================
-- Fantasy Tag Nottingham — 0009_medium_batch.sql
-- Fixes audit findings M1 (opponent squads visible pre-deadline), M2 (league
-- invite codes enumerable), M4 (non-atomic transfers) and M6 (possible
-- duplicate players).
--
--   M1  Squad rows, transfer logs and captain picks become visible to OTHER
--       managers only once the open gameweek's deadline has passed (the FPL
--       lock rule). Owners always see their own. Leaderboard views are
--       unaffected (views execute as their owner).
--   M2  private_leagues rows are now visible only to the commissioner and
--       members. Joining happens through join_league_by_code() — a SECURITY
--       DEFINER RPC that validates the code server-side, so codes can no
--       longer be enumerated.
--   M4  transfer_player() performs out → in → log in ONE transaction with
--       server-side ownership, deadline and availability checks. The price
--       is taken from the players table, not the client.
--   M6  Unique index on (team, lower(first), lower(last)) prevents duplicate
--       player records from sync races.
--
-- M3 (POTM sync attendance) was re-analysed and needs no change: a Player of
-- the Match award implies the player attended, and manual stat entry
-- overwrites synced rows via upsert with an explicit attended flag.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Shared helper: is the transfer window locked right now?
-- True when the earliest open gameweek's deadline has passed, or the season
-- is over (no open gameweek → everything public).
-- ---------------------------------------------------------------------------
create or replace function public.squad_locked()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select now() > deadline from public.gameweeks
      where not is_finished order by id limit 1),
    true
  );
$$;

-- ---------------------------------------------------------------------------
-- M1 — visibility lock on squads, transfers, captain picks
-- ---------------------------------------------------------------------------
drop policy if exists "squads readable by all" on public.fantasy_team_players;
drop policy if exists "squads visible after lock or to owner" on public.fantasy_team_players;
create policy "squads visible after lock or to owner" on public.fantasy_team_players
  for select using (
    public.squad_locked()
    or exists (select 1 from public.fantasy_teams ft
               where ft.id = fantasy_team_id and ft.user_id = auth.uid())
  );

drop policy if exists "transfers readable by all" on public.transfers;
drop policy if exists "transfers visible after lock or to owner" on public.transfers;
create policy "transfers visible after lock or to owner" on public.transfers
  for select using (
    public.squad_locked()
    or exists (select 1 from public.fantasy_teams ft
               where ft.id = fantasy_team_id and ft.user_id = auth.uid())
  );

drop policy if exists "captain picks readable by all" on public.captain_picks;
drop policy if exists "captain picks visible after lock or to owner" on public.captain_picks;
create policy "captain picks visible after lock or to owner" on public.captain_picks
  for select using (
    public.squad_locked()
    or exists (select 1 from public.fantasy_teams ft
               where ft.id = fantasy_team_id and ft.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- M2 — private leagues visible to members only; join via RPC
-- ---------------------------------------------------------------------------
drop policy if exists "leagues readable by all" on public.private_leagues;
drop policy if exists "leagues visible to commissioner and members" on public.private_leagues;
create policy "leagues visible to commissioner and members" on public.private_leagues
  for select using (
    commissioner_id = auth.uid()
    or exists (select 1
                 from public.league_members lm
                 join public.fantasy_teams ft on ft.id = lm.fantasy_team_id
                where lm.league_id = id and ft.user_id = auth.uid())
  );

create or replace function public.join_league_by_code(p_code text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_league uuid;
  v_team   uuid;
begin
  select id into v_league
    from public.private_leagues
   where code = upper(trim(p_code));
  if v_league is null then
    raise exception 'No league found with that code.';
  end if;

  select id into v_team from public.fantasy_teams where user_id = auth.uid();
  if v_team is null then
    raise exception 'Create your fantasy team first.';
  end if;

  insert into public.league_members (league_id, fantasy_team_id)
  values (v_league, v_team)
  on conflict do nothing;

  return v_league;
end;
$$;

-- ---------------------------------------------------------------------------
-- M4 — atomic transfer RPC (out → in → log in one transaction)
-- ---------------------------------------------------------------------------
create or replace function public.transfer_player(
  p_fantasy_team_id   uuid,
  p_player_in_id      uuid,
  p_gameweek_id       integer,
  p_player_out_row_id uuid default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_out_player uuid;
  v_price      numeric(4,1);
begin
  -- Ownership
  if not exists (
    select 1 from public.fantasy_teams
     where id = p_fantasy_team_id and user_id = auth.uid()
  ) then
    raise exception 'You can only change your own squad.';
  end if;

  -- Global lock + this gameweek's window
  perform public.assert_squad_unlocked();
  if now() > (select deadline from public.gameweeks where id = p_gameweek_id) then
    raise exception 'Transfer window closed: the deadline for this gameweek has passed.';
  end if;

  -- Availability + authoritative price
  select price into v_price
    from public.players
   where id = p_player_in_id and active;
  if v_price is null then
    raise exception 'That player is not available.';
  end if;

  -- Outgoing player (transfer) or null (initial squad building)
  if p_player_out_row_id is not null then
    update public.fantasy_team_players
       set is_active = false, removed_gameweek = p_gameweek_id
     where id = p_player_out_row_id
       and fantasy_team_id = p_fantasy_team_id
       and is_active
    returning player_id into v_out_player;
    if v_out_player is null then
      raise exception 'Outgoing player is not in your squad.';
    end if;
  end if;

  -- Incoming player (validate_squad trigger enforces size/budget/team cap)
  insert into public.fantasy_team_players
    (fantasy_team_id, player_id, purchase_price, added_gameweek)
  values
    (p_fantasy_team_id, p_player_in_id, v_price, p_gameweek_id);

  -- Log (price_transfer trigger applies free/−4 rules)
  insert into public.transfers
    (fantasy_team_id, gameweek_id, player_in_id, player_out_id)
  values
    (p_fantasy_team_id, p_gameweek_id, p_player_in_id, v_out_player);
end;
$$;

-- ---------------------------------------------------------------------------
-- M6 — no duplicate players per team (case-insensitive names)
-- ---------------------------------------------------------------------------
create unique index if not exists players_team_name_uniq
  on public.players (team_id, lower(first_name), lower(last_name));
