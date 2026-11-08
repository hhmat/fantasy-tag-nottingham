// Per-gameweek visual formations (starting 7, substitutes and pitch coordinates)
import { supabase } from '@/lib/supabase';
import type { FormationEntry } from '@/types';

export async function getFormation(
  fantasyTeamId: string,
  gameweekId: number,
): Promise<FormationEntry[]> {
  const { data, error } = await supabase
    .from('squad_formations')
    .select('squad_row_id, is_starter, position_x, position_y, bench_order')
    .eq('fantasy_team_id', fantasyTeamId)
    .eq('gameweek_id', gameweekId)
    .order('bench_order');

  // Keep the pitch usable before migration 0014 has been applied. Saving will
  // still surface the server's migration-required error instead of pretending.
  if (error?.code === '42P01' || error?.code === 'PGRST205') return [];
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    squad_row_id: row.squad_row_id,
    is_starter: row.is_starter,
    position_x: Number(row.position_x),
    position_y: Number(row.position_y),
    bench_order: row.bench_order,
  }));
}

export async function saveFormation(opts: {
  fantasyTeamId: string;
  gameweekId: number;
  entries: FormationEntry[];
}) {
  const { error } = await supabase.rpc('save_squad_formation', {
    p_fantasy_team_id: opts.fantasyTeamId,
    p_gameweek_id: opts.gameweekId,
    p_entries: opts.entries.map((entry) => ({
      squad_row_id: entry.squad_row_id,
      is_starter: entry.is_starter,
      position_x: entry.position_x,
      position_y: entry.position_y,
      bench_order: entry.bench_order,
    })),
  });
  if (error) throw error;
}
