-- ============================================================================
-- Fantasy Tag Nottingham — 0008_price_engine_scale.sql
-- Fixes audit finding H6: the FPL-style thresholds (±20 / ±50 net transfers)
-- can never trigger in a league of ~40 managers, so prices would stay frozen
-- all season.
--
-- Thresholds now scale with the number of active fantasy teams:
--     ±0.2  when net transfers reach ~15% of managers (min 6)
--     ±0.1  when net transfers reach  ~7% of managers (min 3)
-- A 40-manager league moves prices at 6 / 3 net transfers; a 400-manager
-- league at 60 / 28 — no re-tuning needed as the game grows.
-- Prices still clamp to [3.0, 15.0] and every change is logged to
-- price_history (readable by all, so the app can show rise/fall arrows).
-- ============================================================================

create or replace function public.apply_price_changes(p_gameweek int)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  v_new numeric(4,1);
  v_count int := 0;
  v_managers int;
  v_rise2 int;
  v_rise1 int;
begin
  select count(*) into v_managers from public.fantasy_teams;

  -- Scale thresholds to league size (integer net-transfer counts).
  v_rise2 := greatest(6, ceil(v_managers * 0.15));
  v_rise1 := greatest(3, ceil(v_managers * 0.07));

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
      when r.net >=  v_rise2 then 0.2
      when r.net >=  v_rise1 then 0.1
      when r.net <= -v_rise2 then -0.2
      when r.net <= -v_rise1 then -0.1
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
