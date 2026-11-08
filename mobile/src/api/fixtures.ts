// Fixtures & gameweeks API (+ realtime live-score subscription)
import { supabase } from '@/lib/supabase';
import type { Fixture, Gameweek, SyncRun } from '@/types';

export async function getGameweeks(): Promise<Gameweek[]> {
  const { data, error } = await supabase.from('gameweeks').select('*').order('id');
  if (error) throw error;
  return data as Gameweek[];
}

export async function getCurrentGameweek(): Promise<Gameweek | null> {
  const { data, error } = await supabase
    .from('gameweeks')
    .select('*')
    .gte('deadline', new Date().toISOString())
    .order('deadline')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Gameweek) ?? null;
}

export async function getFixtures(gameweekId: number): Promise<Fixture[]> {
  const { data, error } = await supabase
    .from('v_fixtures')
    .select('*')
    .eq('gameweek_id', gameweekId)
    .order('kickoff');
  if (error) throw error;
  return data as Fixture[];
}

export async function getNextFixtures(limit = 6): Promise<Fixture[]> {
  const { data, error } = await supabase
    .from('v_fixtures')
    .select('*')
    .gte('kickoff', new Date().toISOString())
    .eq('status', 'scheduled')
    .order('kickoff')
    .limit(limit);
  if (error) throw error;
  return data as Fixture[];
}

/** Subscribe to live score changes for a gameweek. Returns unsubscribe fn. */
export function subscribeToLiveScores(gameweekId: number, onChange: () => void) {
  const channel = supabase
    .channel(`fixtures-gw-${gameweekId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'fixtures', filter: `gameweek_id=eq.${gameweekId}` },
      onChange,
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/** Earliest UNFINISHED gameweek — the one squads are being built for. */
export async function getOpenGameweek(): Promise<Gameweek | null> {
  const { data, error } = await supabase
    .from('gameweeks')
    .select('*')
    .eq('is_finished', false)
    .order('id')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Gameweek) ?? null;
}

/** Most recently finished gameweek (for "last week" points + price moves). */
export async function getLastFinishedGameweek(): Promise<Gameweek | null> {
  const { data, error } = await supabase
    .from('gameweeks')
    .select('*')
    .eq('is_finished', true)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Gameweek) ?? null;
}

/** Fixtures currently being played (status = 'live'). */
export async function getLiveFixtures(): Promise<Fixture[]> {
  const { data, error } = await supabase
    .from('v_fixtures')
    .select('*')
    .eq('status', 'live')
    .order('kickoff');
  if (error) throw error;
  return data as Fixture[];
}

/** Price movements applied for a gameweek: player_id → delta. */
export async function getPriceChanges(gameweekId: number): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('price_history')
    .select('player_id, old_price, new_price')
    .eq('gameweek_id', gameweekId);
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const r of data ?? []) {
    out[r.player_id] = Number(((r.new_price as number) - (r.old_price as number)).toFixed(1));
  }
  return out;
}

// ---- Admin ----

export async function adminCreateFixture(f: {
  gameweek_id: number;
  home_team_id: string;
  away_team_id: string;
  kickoff: string;
  venue?: string;
}) {
  const { error } = await supabase.from('fixtures').insert(f);
  if (error) throw error;
}

export async function adminSetFixtureStatus(id: string, status: Fixture['status']) {
  const { error } = await supabase.from('fixtures').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function adminEnterResult(id: string, homeScore: number, awayScore: number) {
  // status='finished' fires apply_match_result() which sets win flags
  const { error } = await supabase
    .from('fixtures')
    .update({ home_score: homeScore, away_score: awayScore, status: 'finished' })
    .eq('id', id);
  if (error) throw error;
}

export async function adminUpdateLiveScore(id: string, homeScore: number, awayScore: number) {
  const { error } = await supabase
    .from('fixtures')
    .update({ home_score: homeScore, away_score: awayScore, status: 'live' })
    .eq('id', id);
  if (error) throw error;
}

export async function adminUpsertStats(stat: {
  fixture_id: string;
  player_id: string;
  tries: number;
  assists: number;
  conversions: number;
  player_of_match: boolean;
  attended: boolean;
}) {
  const { error } = await supabase
    .from('player_match_stats')
    .upsert(stat, { onConflict: 'fixture_id,player_id' });
  if (error) throw error;
}

export async function adminGetTeamPlayers(teamId: string) {
  const { data, error } = await supabase
    .from('players')
    .select('id, first_name, last_name, position')
    .eq('team_id', teamId)
    .eq('active', true)
    .order('last_name');
  if (error) throw error;
  return data;
}

/** Trigger a Spawtz sync (results, fixtures, POTM). Requires admin profile. */
export interface SpawtzSyncSummary {
  fixtures_scraped: number;
  fixtures_upserted: number;
  teams_created: number;
  pom_players: number;
  pom_awards_applied: number;
  dry_run: boolean;
  errors: string[];
}

export async function adminRunSpawtzSync(dryRun = false): Promise<SpawtzSyncSummary> {
  const { data, error } = await supabase.functions.invoke('spawtz-sync', {
    body: { dryRun },
  });
  if (error) throw error;
  if (typeof data === 'string' && data === 'unauthorised') {
    throw new Error('Not authorised — is your account marked as admin?');
  }
  return data as SpawtzSyncSummary;
}

/** Recent spawtz-sync runs (admin-only via RLS). */
export async function getSyncHistory(limit = 5): Promise<SyncRun[]> {
  const { data, error } = await supabase
    .from('sync_log')
    .select('*')
    .order('ran_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as SyncRun[];
}
