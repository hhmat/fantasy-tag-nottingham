import type { FormationEntry, SquadPlayer } from '@/types';

export const STARTING_PLAYERS = 7;
export const MIN_PITCH_COORDINATE = 0.1;
export const MAX_PITCH_COORDINATE = 0.9;

// A balanced 1–2–3–1 tag-rugby shape, ordered top to bottom on the pitch.
export const FORMATION_SLOTS = [
  { x: 0.5, y: 0.15 },
  { x: 0.27, y: 0.31 },
  { x: 0.73, y: 0.31 },
  { x: 0.18, y: 0.56 },
  { x: 0.5, y: 0.49 },
  { x: 0.82, y: 0.56 },
  { x: 0.5, y: 0.77 },
] as const;

export function clampPitchCoordinate(value: number) {
  return Math.min(MAX_PITCH_COORDINATE, Math.max(MIN_PITCH_COORDINATE, value));
}

export function defaultFormation(squad: SquadPlayer[]): FormationEntry[] {
  return squad.map((player, index) => {
    const isStarter = index < STARTING_PLAYERS;
    const slot = FORMATION_SLOTS[index % STARTING_PLAYERS];
    return {
      squad_row_id: player.id,
      is_starter: isStarter,
      position_x: isStarter ? slot.x : 0.5,
      position_y: isStarter ? slot.y : 0.9,
      bench_order: isStarter ? 0 : index - STARTING_PLAYERS + 1,
    };
  });
}

/** Merge a saved formation with the current active squad. Transferred-out rows
 * disappear and newly acquired players fill a free slot or join the bench. */
export function mergeFormation(
  squad: SquadPlayer[],
  saved: FormationEntry[],
): FormationEntry[] {
  const activeIds = new Set(squad.map((player) => player.id));
  const merged = saved
    .filter((entry) => activeIds.has(entry.squad_row_id))
    .map((entry) => ({
      ...entry,
      position_x: clampPitchCoordinate(Number(entry.position_x)),
      position_y: clampPitchCoordinate(Number(entry.position_y)),
    }));
  const defaults = defaultFormation(squad);

  for (const player of squad) {
    if (merged.some((entry) => entry.squad_row_id === player.id)) continue;
    const starterCount = merged.filter((entry) => entry.is_starter).length;
    if (starterCount < Math.min(STARTING_PLAYERS, squad.length)) {
      const usedSlots = merged
        .filter((entry) => entry.is_starter)
        .map((entry) => ({ x: entry.position_x, y: entry.position_y }));
      const freeSlot = FORMATION_SLOTS.find((slot) =>
        usedSlots.every((used) => Math.abs(used.x - slot.x) > 0.02 || Math.abs(used.y - slot.y) > 0.02),
      ) ?? FORMATION_SLOTS[starterCount % STARTING_PLAYERS];
      merged.push({
        squad_row_id: player.id,
        is_starter: true,
        position_x: freeSlot.x,
        position_y: freeSlot.y,
        bench_order: 0,
      });
    } else {
      const fallback = defaults.find((entry) => entry.squad_row_id === player.id)!;
      merged.push({ ...fallback, is_starter: false, position_x: 0.5, position_y: 0.9 });
    }
  }
  return normaliseBenchOrder(merged);
}

export function normaliseBenchOrder(entries: FormationEntry[]) {
  let benchOrder = 0;
  return entries.map((entry) => ({
    ...entry,
    bench_order: entry.is_starter ? 0 : ++benchOrder,
  }));
}

export function nearestStarter(entries: FormationEntry[], x: number, y: number) {
  return entries
    .filter((entry) => entry.is_starter)
    .sort((a, b) => {
      const distanceA = (a.position_x - x) ** 2 + (a.position_y - y) ** 2;
      const distanceB = (b.position_x - x) ** 2 + (b.position_y - y) ** 2;
      return distanceA - distanceB;
    })[0];
}
