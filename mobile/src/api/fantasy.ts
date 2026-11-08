// Fantasy team / squad / transfers API
import { supabase } from '@/lib/supabase';
import { SQUAD_RULES } from '@/lib/scoring';
import type { FantasyTeam, SquadPlayer } from '@/types';

export async function getMyFantasyTeam(userId: string): Promise<FantasyTeam | null> {
  const { data, error } = await supabase
    .from('fantasy_teams')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as FantasyTeam) ?? null;
}

export async function createFantasyTeam(userId: string, name: string): Promise<FantasyTeam> {
  const { data, error } = await supabase
    .from('fantasy_teams')
    .insert({ user_id: userId, name })
    .select()
    .single();
  if (error) throw error;
  return data as FantasyTeam;
}

export async function renameFantasyTeam(teamId: string, name: string) {
  const { error } = await supabase.from('fantasy_teams').update({ name }).eq('id', teamId);
  if (error) throw error;
}

export async function updateFantasyTeamProfile(teamId: string, details: {
  name: string;
  description: string;
  primary_color: string;
  secondary_color: string;
}) {
  const { error } = await supabase.from('fantasy_teams').update(details).eq('id', teamId);
  if (error) throw error;
}

export async function setTeamBadgeUrl(teamId: string, badgeUrl: string | null) {
  const { error } = await supabase.from('fantasy_teams').update({ badge_url: badgeUrl }).eq('id', teamId);
  if (error) throw error;
}

export async function getSquad(teamId: string, gameweekId?: number): Promise<SquadPlayer[]> {
  const squadQuery = supabase
    .from('fantasy_team_players')
    .select(`id, player_id, is_captain, is_active, purchase_price, added_gameweek,
             player:players!inner(id, team_id, first_name, last_name, position, price,
                              teams!inner(name, short_name))`)
    .eq('fantasy_team_id', teamId)
    .eq('is_active', true)
    .order('is_captain', { ascending: false });

  const pickQuery = gameweekId
    ? supabase
        .from('captain_picks')
        .select('squad_row_id')
        .eq('fantasy_team_id', teamId)
        .eq('gameweek_id', gameweekId)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null } as const);

  const [{ data, error }, pickRes] = await Promise.all([squadQuery, pickQuery]);
  if (error) throw error;
  if (pickRes.error) throw pickRes.error;
  const captainRowId = pickRes.data?.squad_row_id ?? null;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    player_id: row.player_id,
    // Captain for the open gameweek comes from captain_picks; fall back to
    // the legacy flag when no pick exists for that gameweek.
    is_captain: captainRowId ? row.id === captainRowId : row.is_captain,
    is_active: row.is_active,
    purchase_price: row.purchase_price,
    added_gameweek: row.added_gameweek,
    player: {
      id: row.player.id,
      team_id: row.player.team_id,
      first_name: row.player.first_name,
      last_name: row.player.last_name,
      position: row.player.position,
      price: row.player.price,
      active: true,
      photo_url: null,
      team_name: row.player.teams.name,
      team_short: row.player.teams.short_name,
    },
  }));
}

export async function getSquadGameweekPoints(teamId: string, gameweekId: number): Promise<number> {
  const { data, error } = await supabase
    .from('v_gameweek_points')
    .select('points')
    .eq('fantasy_team_id', teamId)
    .eq('gameweek_id', gameweekId)
    .maybeSingle();
  if (error) throw error;
  return data?.points ?? 0;
}

export async function getSquadTotalPoints(teamId: string): Promise<number> {
  const { data, error } = await supabase
    .from('v_gameweek_points')
    .select('points')
    .eq('fantasy_team_id', teamId);
  if (error) throw error;
  return (data ?? []).reduce((a: number, r: any) => a + r.points, 0);
}

/**
 * Set (or unset) the captain for a specific open gameweek.
 * Captaincy is recorded per gameweek (captain_picks), so changing it never
 * rewrites past gameweeks' points. The DB rejects changes after the deadline.
 */
export async function setCaptainForGameweek(opts: {
  teamId: string;
  squadRowId: string;
  gameweekId: number;
  makeCaptain: boolean;
}) {
  const { teamId, squadRowId, gameweekId, makeCaptain } = opts;
  if (makeCaptain) {
    const { error } = await supabase
      .from('captain_picks')
      .upsert(
        { fantasy_team_id: teamId, gameweek_id: gameweekId, squad_row_id: squadRowId },
        { onConflict: 'fantasy_team_id,gameweek_id' },
      );
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('captain_picks')
      .delete()
      .eq('fantasy_team_id', teamId)
      .eq('gameweek_id', gameweekId)
      .eq('squad_row_id', squadRowId);
    if (error) throw error;
  }
}

/**
 * Add a player to the squad — initial pick (no playerOutRowId) or transfer.
 * Runs as ONE server-side transaction (transfer_player RPC): ownership,
 * deadline, availability, budget and team-cap rules are all enforced in the
 * database, and the price comes from the players table, not the client.
 */
export async function addPlayerToSquad(opts: {
  fantasyTeamId: string;
  playerId: string;
  gameweekId: number;
  playerOutRowId?: string; // fantasy_team_players row to transfer out
}) {
  const { error } = await supabase.rpc('transfer_player', {
    p_fantasy_team_id: opts.fantasyTeamId,
    p_player_in_id: opts.playerId,
    p_gameweek_id: opts.gameweekId,
    p_player_out_row_id: opts.playerOutRowId ?? null,
  });
  if (error) throw error;
}

export async function getTransfersThisGameweek(teamId: string, gameweekId: number) {
  const { data, error } = await supabase
    .from('transfers')
    .select('*')
    .eq('fantasy_team_id', teamId)
    .eq('gameweek_id', gameweekId)
    .not('player_out_id', 'is', null);
  if (error) throw error;
  return data ?? [];
}

export function freeTransfersRemaining(used: number): number {
  return Math.max(0, SQUAD_RULES.freeTransfersPerGameweek - used);
}
