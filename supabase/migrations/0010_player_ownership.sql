-- ============================================================================
-- Fantasy Tag Nottingham — 0010_player_ownership.sql
-- Aggregate ownership % for the Squad Builder (UX redesign 2.4).
-- Since migration 0009 hides individual squads before the deadline, the
-- client can no longer count owners itself — this SECURITY DEFINER function
-- returns ONLY per-player aggregates, which is exactly the data FPL shows.
-- ============================================================================

create or replace function public.player_ownership()
returns table (player_id uuid, owners integer, pct numeric)
language sql stable security definer set search_path = public
as $$
  with total as (select count(*)::numeric as n from public.fantasy_teams)
  select ftp.player_id,
         count(*)::integer as owners,
         case when total.n = 0 then 0
              else round(count(*)::numeric / total.n * 100, 1) end as pct
    from public.fantasy_team_players ftp, total
   where ftp.is_active
   group by ftp.player_id, total.n;
$$;
