// Players & teams API
import { supabase } from '@/lib/supabase';
import { computePoints } from '@/lib/scoring';
import type { Player, PlayerMatchLogEntry, PlayerProfile, PlayerSeasonStats, PriceChange, Team } from '@/types';

export async function getTeams(): Promise<Team[]> {
  const { data, error } = await supabase.from('teams').select('*').order('name');
  if (error) throw error;
  return data as Team[];
}

export async function getTeam(id: string): Promise<Team> {
  const { data, error } = await supabase.from('teams').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Team;
}

export async function getPlayers(opts?: {
  teamId?: string;
  search?: string;
  sortBy?: 'price' | 'total_points' | 'last_name';
  ascending?: boolean;
}): Promise<PlayerSeasonStats[]> {
  let q = supabase.from('v_player_season_stats').select('*').eq('active', true);
  if (opts?.teamId) q = q.eq('team_id', opts.teamId);
  if (opts?.search) {
    q = q.or(`first_name.ilike.%${opts.search}%,last_name.ilike.%${opts.search}%`);
  }
  const sortBy = opts?.sortBy ?? 'total_points';
  q = q.order(sortBy, { ascending: opts?.ascending ?? sortBy === 'last_name' });
  const { data, error } = await q;
  if (error) throw error;
  return data as PlayerSeasonStats[];
}

export async function getPlayer(id: string): Promise<PlayerProfile> {
  const [{ data, error }, { data: photo, error: photoError }] = await Promise.all([
    supabase.from('v_player_season_stats').select('*').eq('player_id', id).single(),
    supabase.from('players').select('photo_url').eq('id', id).single(),
  ]);
  if (error) throw error;
  if (photoError) throw photoError;
  return { ...(data as PlayerSeasonStats), photo_url: photo.photo_url };
}

export async function getPlayerPriceHistory(playerId: string): Promise<PriceChange[]> {
  const { data, error } = await supabase
    .from('price_history')
    .select('player_id, old_price, new_price, changed_at, gameweek_id')
    .eq('player_id', playerId)
    .order('changed_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return data as PriceChange[];
}

export async function getPlayerMatchLog(playerId: string): Promise<PlayerMatchLogEntry[]> {
  const { data, error } = await supabase
    .from('player_match_stats')
    .select(`*, fixtures!inner(
      gameweek_id, kickoff, status, home_score, away_score,
      home_team:teams!fixtures_home_team_id_fkey(id, name, short_name),
      away_team:teams!fixtures_away_team_id_fkey(id, name, short_name)
    )`)
    .eq('player_id', playerId);
  if (error) throw error;
  return ((data ?? []) as unknown as PlayerMatchLogEntry[]).sort(
    (a, b) => b.fixtures.kickoff.localeCompare(a.fixtures.kickoff),
  );
}

/**
 * Recent form: player_id → point totals for the given gameweeks
 * (oldest → newest). Points computed with the same table as the DB.
 */
export async function getRecentForm(gameweekIds: number[]): Promise<Record<string, number[]>> {
  if (!gameweekIds.length) return {};
  const { data, error } = await supabase
    .from('player_match_stats')
    .select('player_id, tries, assists, conversions, player_of_match, win, attended, fixtures!inner(gameweek_id)')
    .in('fixtures.gameweek_id', gameweekIds);
  if (error) throw error;

  const out: Record<string, number[]> = {};
  for (const row of data ?? []) {
    const pts = computePoints(row);
    (out[row.player_id] ??= []).push(pts);
  }
  return out;
}

/** Ownership % per player (aggregate RPC — squads themselves stay private). */
export async function getOwnership(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('player_ownership');
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const r of data ?? []) out[r.player_id] = Number(r.pct);
  return out;
}

// ---- Admin ----

export async function adminAddPlayer(p: Omit<Player, 'id' | 'active' | 'photo_url'>) {
  const { error } = await supabase.from('players').insert(p);
  if (error) throw error;
}

export async function adminUpdatePlayer(id: string, patch: Partial<Player>) {
  const { error } = await supabase.from('players').update(patch).eq('id', id);
  if (error) throw error;
}

export async function adminAddTeam(t: Pick<Team, 'name' | 'short_name' | 'primary_color' | 'secondary_color'>) {
  const { error } = await supabase.from('teams').insert(t);
  if (error) throw error;
}
