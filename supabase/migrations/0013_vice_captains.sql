-- ============================================================================
-- Fantasy Tag Nottingham — 0013_vice_captains.sql
-- Phase 3.2: per-gameweek vice-captains and automatic fallback scoring.
--
-- Rule: an attending captain scores 2x. If the captain has NO attended match
-- in that gameweek, the vice-captain scores 2x instead. If there is no captain
-- or no vice-captain, no fallback is invented. Historical gameweeks without a
-- captain_picks row retain the legacy is_captain behaviour from 0006.
--
-- Run AFTER migration 0012. Apply during a quiet period before results entry.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. A pick row may now hold C, V, both, or neither. C and V must differ.
-- ---------------------------------------------------------------------------
alter table public.captain_picks
  alter column squad_row_id drop not null,
  add column if not exists vice_squad_row_id uuid
    references public.fantasy_team_players(id) on delete cascade;

comment on column public.captain_picks.vice_squad_row_id is
  'Vice-captain for this gameweek; doubles only when the captain has no attended match.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'captain_picks_distinct_armbands') then
    alter table public.captain_picks add constraint captain_picks_distinct_armbands
      check (
        squad_row_id is null
        or vice_squad_row_id is null
        or squad_row_id <> vice_squad_row_id
      );
  end if;
end $$;

-- Validate each non-null armband independently. Nulls are valid: managers may
-- remove one role without deleting the other role's per-GW history.
create or replace function public.validate_captain_pick()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.squad_row_id is not null and not exists (
    select 1 from public.fantasy_team_players
     where id = new.squad_row_id
       and fantasy_team_id = new.fantasy_team_id
       and is_active
  ) then
    raise exception 'Captain must be an active member of your squad.';
  end if;

  if new.vice_squad_row_id is not null and not exists (
    select 1 from public.fantasy_team_players
     where id = new.vice_squad_row_id
       and fantasy_team_id = new.fantasy_team_id
       and is_active
  ) then
    raise exception 'Vice-captain must be an active member of your squad.';
  end if;

  if new.squad_row_id is not null
     and new.squad_row_id = new.vice_squad_row_id then
    raise exception 'Captain and vice-captain must be different players.';
  end if;

  if now() > (select deadline from public.gameweeks where id = new.gameweek_id) then
    raise exception 'Captain locked: the deadline for this gameweek has passed.';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Atomic client operation. Selecting a player who already holds the other
--    armband moves them to the new role and clears the old one. The initial
--    insert + SELECT FOR UPDATE serialises simultaneous C/V changes.
-- ---------------------------------------------------------------------------
create or replace function public.set_captaincy(
  p_fantasy_team_id uuid,
  p_gameweek_id integer,
  p_squad_row_id uuid,
  p_role text,
  p_selected boolean
)
returns void
language plpgsql security invoker set search_path = public
as $$
declare
  v_captain uuid;
  v_vice    uuid;
begin
  if p_role is null or p_role not in ('captain', 'vice') then
    raise exception 'Captaincy role must be captain or vice.';
  end if;

  if not exists (
    select 1 from public.fantasy_teams
     where id = p_fantasy_team_id and user_id = auth.uid()
  ) then
    raise exception 'You can only change captaincy for your own squad.';
  end if;

  perform public.assert_squad_unlocked();
  if now() > (select deadline from public.gameweeks where id = p_gameweek_id) then
    raise exception 'Captain locked: the deadline for this gameweek has passed.';
  end if;

  if not exists (
    select 1 from public.fantasy_team_players
     where id = p_squad_row_id
       and fantasy_team_id = p_fantasy_team_id
       and is_active
  ) then
    raise exception 'Choose an active player from your own squad.';
  end if;

  insert into public.captain_picks (fantasy_team_id, gameweek_id)
  values (p_fantasy_team_id, p_gameweek_id)
  on conflict (fantasy_team_id, gameweek_id) do nothing;

  select squad_row_id, vice_squad_row_id
    into v_captain, v_vice
    from public.captain_picks
   where fantasy_team_id = p_fantasy_team_id
     and gameweek_id = p_gameweek_id
   for update;

  if p_role = 'captain' then
    if coalesce(p_selected, false) then
      if v_vice = p_squad_row_id then v_vice := null; end if;
      v_captain := p_squad_row_id;
    elsif v_captain = p_squad_row_id then
      v_captain := null;
    end if;
  else
    if coalesce(p_selected, false) then
      if v_captain = p_squad_row_id then v_captain := null; end if;
      v_vice := p_squad_row_id;
    elsif v_vice = p_squad_row_id then
      v_vice := null;
    end if;
  end if;

  update public.captain_picks
     set squad_row_id = v_captain,
         vice_squad_row_id = v_vice,
         set_at = now()
   where fantasy_team_id = p_fantasy_team_id
     and gameweek_id = p_gameweek_id;
end;
$$;

revoke execute on function public.set_captaincy(uuid, integer, uuid, text, boolean) from public;
grant execute on function public.set_captaincy(uuid, integer, uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Transfers deactivate squad rows rather than deleting them. Clear either
--    armband from the affected and future GWs so no inactive pick remains stuck.
--    Earlier GWs keep their armbands (and avoid their expired deadline checks).
-- ---------------------------------------------------------------------------
create or replace function public.clear_inactive_captaincy()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if old.is_active and not new.is_active then
    update public.captain_picks
       set squad_row_id = case when squad_row_id = new.id then null else squad_row_id end,
           vice_squad_row_id = case when vice_squad_row_id = new.id then null else vice_squad_row_id end,
           set_at = now()
     where (squad_row_id = new.id or vice_squad_row_id = new.id)
       and (new.removed_gameweek is null or gameweek_id >= new.removed_gameweek);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clear_inactive_captaincy on public.fantasy_team_players;
create trigger trg_clear_inactive_captaincy
  after update of is_active on public.fantasy_team_players
  for each row execute function public.clear_inactive_captaincy();

-- ---------------------------------------------------------------------------
-- 4. Fallback scoring. captain_status examines only fixtures in the pick's GW.
--    bool_or handles multiple fixtures; no stats or attended=false both count
--    as absent. effective_captains emits at most one row per fantasy team/GW.
-- ---------------------------------------------------------------------------
create or replace view public.v_gameweek_points as
with captain_status as (
  select cp.fantasy_team_id,
         cp.gameweek_id,
         cp.squad_row_id,
         cp.vice_squad_row_id,
         coalesce(bool_or(cs.attended), false) as captain_played
    from public.captain_picks cp
    left join public.fantasy_team_players captain
           on captain.id = cp.squad_row_id
    left join public.player_match_stats cs
           on cs.player_id = captain.player_id
          and exists (
            select 1 from public.fixtures cf
             where cf.id = cs.fixture_id
               and cf.gameweek_id = cp.gameweek_id
          )
   group by cp.fantasy_team_id, cp.gameweek_id,
            cp.squad_row_id, cp.vice_squad_row_id
),
effective_captains as (
  select fantasy_team_id,
         gameweek_id,
         case
           when squad_row_id is not null and captain_played
             then squad_row_id
           when squad_row_id is not null
                and not captain_played
                and vice_squad_row_id is not null
             then vice_squad_row_id
           else null
         end as effective_squad_row_id
    from captain_status
),
squad_pts as (
  select ftp.fantasy_team_id,
         f.gameweek_id,
         sum(public.player_points(s.tries, s.assists, s.conversions,
                                  s.player_of_match, s.win, s.attended)
             * case
                 when ec.effective_squad_row_id is not null then 2
                 when cp_any.fantasy_team_id is null
                      and ftp.is_captain then 2
                 else 1
               end) as pts
    from public.fantasy_team_players ftp
    join public.player_match_stats s on s.player_id = ftp.player_id
    join public.fixtures f           on f.id = s.fixture_id
    left join effective_captains ec
           on ec.fantasy_team_id = ftp.fantasy_team_id
          and ec.gameweek_id     = f.gameweek_id
          and ec.effective_squad_row_id = ftp.id
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

select pg_notify('pgrst', 'reload schema');
