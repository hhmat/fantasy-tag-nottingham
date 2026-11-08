// Leaderboards & private leagues API
import { supabase } from '@/lib/supabase';
import type { LeaderboardRow, PrivateLeague, WeeklyRow } from '@/types';

export async function getGlobalLeaderboard(limit = 100): Promise<LeaderboardRow[]> {
  const { data, error } = await supabase
    .from('v_global_leaderboard')
    .select('*')
    .order('rank')
    .limit(limit);
  if (error) throw error;
  return data as LeaderboardRow[];
}

export async function getWeeklyLeaderboard(gameweekId: number): Promise<WeeklyRow[]> {
  const { data, error } = await supabase
    .from('v_weekly_leaderboard')
    .select('*')
    .eq('gameweek_id', gameweekId)
    .order('rank');
  if (error) throw error;
  return data as WeeklyRow[];
}

export async function getMyPrivateLeagues(teamId: string) {
  const { data, error } = await supabase
    .from('league_members')
    .select('league_id, private_leagues!inner(id, name, code, commissioner_id)')
    .eq('fantasy_team_id', teamId);
  if (error) throw error;
  return (data ?? []).map((r: any) => r.private_leagues as PrivateLeague);
}

export async function createPrivateLeague(name: string, commissionerId: string, teamId: string) {
  const { data, error } = await supabase
    .from('private_leagues')
    .insert({ name, commissioner_id: commissionerId })
    .select()
    .single();
  if (error) throw error;
  await joinPrivateLeagueById((data as PrivateLeague).id, teamId);
  return data as PrivateLeague;
}

export async function joinPrivateLeagueByCode(code: string, _teamId: string) {
  // Server-side RPC: league codes are no longer readable client-side (M2).
  const { error } = await supabase.rpc('join_league_by_code', { p_code: code });
  if (error) throw error;
}

async function joinPrivateLeagueById(leagueId: string, teamId: string) {
  const { error } = await supabase
    .from('league_members')
    .insert({ league_id: leagueId, fantasy_team_id: teamId });
  if (error && error.code !== '23505') throw error; // ignore duplicate membership
}

export async function leavePrivateLeague(leagueId: string, teamId: string) {
  const { error } = await supabase
    .from('league_members')
    .delete()
    .eq('league_id', leagueId)
    .eq('fantasy_team_id', teamId);
  if (error) throw error;
}

/** Leaderboard restricted to one private league's members. */
export async function getPrivateLeagueTable(leagueId: string): Promise<LeaderboardRow[]> {
  const { data: members, error: mErr } = await supabase
    .from('league_members')
    .select('fantasy_team_id')
    .eq('league_id', leagueId);
  if (mErr) throw mErr;
  const ids = (members ?? []).map((m: any) => m.fantasy_team_id);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('v_global_leaderboard')
    .select('*')
    .in('fantasy_team_id', ids)
    .order('total_points', { ascending: false });
  if (error) throw error;
  // re-rank within the league
  return (data as LeaderboardRow[]).map((r, i) => ({ ...r, rank: i + 1 }));
}
