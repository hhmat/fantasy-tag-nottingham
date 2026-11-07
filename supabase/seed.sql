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
