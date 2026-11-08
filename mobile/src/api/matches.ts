// Match Centre API: fixture detail, team schedules, performances and events.
import { supabase } from '@/lib/supabase';
import type { Fixture, MatchEvent, MatchEventType, MatchPerformance } from '@/types';

export async function getFixture(id: string): Promise<Fixture> {
  const { data, error } = await supabase.from('v_fixtures').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Fixture;
}

export async function getTeamFixtures(teamId: string): Promise<Fixture[]> {
  const { data, error } = await supabase
    .from('v_fixtures')
    .select('*')
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .order('kickoff');
  if (error) throw error;
  return data as Fixture[];
}

export async function getMatchPerformances(fixtureId: string): Promise<MatchPerformance[]> {
  const { data, error } = await supabase
    .from('player_match_stats')
    .select('*, players!inner(first_name, last_name, position, team_id)')
    .eq('fixture_id', fixtureId)
    .order('player_of_match', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as MatchPerformance[]).sort(
    (a, b) => b.players.last_name.localeCompare(a.players.last_name),
  );
}

export async function getMatchEvents(fixtureId: string): Promise<MatchEvent[]> {
  const { data, error } = await supabase
    .from('match_events')
    .select('*, players!inner(first_name, last_name, team_id)')
    .eq('fixture_id', fixtureId)
    .order('occurred_at')
    .order('created_at');
  if (error) throw error;
  return data as unknown as MatchEvent[];
}

let matchChannelId = 0;

/** Refresh fixture, statistics and event queries after any match-table change. */
export function subscribeToMatch(fixtureId: string, onChange: () => void) {
  // Never reuse a topic while Supabase may still be removing its predecessor.
  matchChannelId += 1;
  const channel = supabase
    .channel(`match-centre-${fixtureId}-${Date.now()}-${matchChannelId}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'fixtures', filter: `id=eq.${fixtureId}`,
    }, onChange)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'player_match_stats', filter: `fixture_id=eq.${fixtureId}`,
    }, onChange)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'match_events', filter: `fixture_id=eq.${fixtureId}`,
    }, onChange)
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function adminAddMatchEvent(event: {
  fixture_id: string;
  player_id: string;
  team_id: string;
  event_type: MatchEventType;
  minute: number | null;
}) {
  const { error } = await supabase.from('match_events').insert(event);
  if (error) throw error;
}

export async function adminDeleteMatchEvent(id: string) {
  const { error } = await supabase.from('match_events').delete().eq('id', id);
  if (error) throw error;
}
