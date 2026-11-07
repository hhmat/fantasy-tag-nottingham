// Players & teams API
import { supabase } from '@/lib/supabase';
import type { Player, PlayerSeasonStats, PriceChange, Team } from '@/types';

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

export async function getPlayer(id: string): Promise<PlayerSeasonStats> {
  const { data, error } = await supabase
    .from('v_player_season_stats')
    .select('*')
    .eq('player_id', id)
    .single();
  if (error) throw error;
  return data as PlayerSeasonStats;
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

export async function getPlayerMatchLog(playerId: string) {
  const { data, error } = await supabase
    .from('player_match_stats')
    .select('*, fixtures!inner(gameweek_id, kickoff, home_team_id, away_team_id, status)')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
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
