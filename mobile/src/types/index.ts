// Shared domain types — mirror supabase/migrations/0001_schema.sql

export type Position = 'Forward' | 'Back' | 'Utility';
export type FixtureStatus = 'scheduled' | 'live' | 'finished' | 'postponed';

export interface Team {
  id: string;
  name: string;
  short_name: string;
  primary_color: string;
  secondary_color: string;
  crest_url: string | null;
}

export interface Player {
  id: string;
  team_id: string;
  first_name: string;
  last_name: string;
  position: Position;
  price: number; // £m
  active: boolean;
  photo_url: string | null;
}

/** Row of v_player_season_stats */
export interface PlayerSeasonStats {
  player_id: string;
  team_id: string;
  first_name: string;
  last_name: string;
  position: Position;
  price: number;
  active: boolean;
  team_name: string;
  team_short: string;
  tries: number;
  assists: number;
  conversions: number;
  pom_awards: number;
  wins: number;
  appearances: number;
  total_points: number;
}

export interface Gameweek {
  id: number;
  name: string;
  deadline: string;
  is_finished: boolean;
}

export interface Fixture {
  id: string;
  gameweek_id: number;
  kickoff: string;
  venue: string | null;
  status: FixtureStatus;
  home_score: number | null;
  away_score: number | null;
  home_team_id: string;
  home_team_name: string;
  home_short: string;
  away_team_id: string;
  away_team_name: string;
  away_short: string;
}

export interface PlayerMatchStats {
  id: string;
  fixture_id: string;
  player_id: string;
  tries: number;
  assists: number;
  conversions: number;
  player_of_match: boolean;
  win: boolean;
  attended: boolean;
}

export interface PlayerProfile extends PlayerSeasonStats {
  photo_url: string | null;
}

export interface MatchTeam {
  id: string;
  name: string;
  short_name: string;
}

export interface PlayerMatchLogEntry extends PlayerMatchStats {
  fixtures: {
    gameweek_id: number;
    kickoff: string;
    status: FixtureStatus;
    home_score: number | null;
    away_score: number | null;
    home_team: MatchTeam;
    away_team: MatchTeam;
  };
}

export type MatchEventType = 'try' | 'assist' | 'conversion' | 'player_of_match';

export interface MatchEvent {
  id: string;
  fixture_id: string;
  player_id: string;
  team_id: string;
  event_type: MatchEventType;
  minute: number | null;
  occurred_at: string;
  created_at: string;
  players: {
    first_name: string;
    last_name: string;
    team_id: string;
  };
}

export interface MatchPerformance extends PlayerMatchStats {
  players: {
    first_name: string;
    last_name: string;
    position: Position;
    team_id: string;
  };
}

export interface Profile {
  id: string;
  display_name: string;
  is_admin: boolean;
  /** Deliberately never selected by the client; notification registration writes it directly. */
  expo_push_token?: never;
  avatar_url: string | null;
  /** 0–3 while onboarding is in progress, null once done. */
  onboarding_step?: number | null;
}

export interface FantasyTeam {
  id: string;
  user_id: string;
  name: string;
  budget: number;
  badge_url?: string | null;
  primary_color?: string;
  secondary_color?: string;
  description?: string;
}

export interface SquadPlayer {
  id: string;             // fantasy_team_players row id
  player_id: string;
  is_captain: boolean;
  is_vice_captain: boolean;
  is_active: boolean;
  purchase_price: number;
  added_gameweek: number;
  player: Player & { team_name: string; team_short: string; total_points?: number };
}

export interface FormationEntry {
  squad_row_id: string;
  is_starter: boolean;
  position_x: number;
  position_y: number;
  bench_order: number;
}

export interface LeaderboardRow {
  fantasy_team_id: string;
  team_name: string;
  manager: string;
  total_points: number;
  rank: number;
}

export interface WeeklyRow {
  gameweek_id: number;
  fantasy_team_id: string;
  team_name: string;
  manager: string;
  points: number;
  rank: number;
}

export interface PrivateLeague {
  id: string;
  name: string;
  code: string;
  commissioner_id: string;
}

export interface PriceChange {
  player_id: string;
  old_price: number;
  new_price: number;
  changed_at: string;
  gameweek_id: number | null;
}

export interface SyncRun {
  id: number;
  ran_at: string;
  triggered_by: string | null;
  fixtures_scraped: number;
  fixtures_upserted: number;
  teams_created: number;
  pom_players: number;
  pom_awards_applied: number;
  error_count: number;
  errors: string[];
}
