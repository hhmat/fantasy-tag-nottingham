// Scoring helpers — mirrors public.player_points() in 0003_functions.sql.
// Used client-side for previews/validation only; the DB is authoritative.

export const SCORING = {
  try: 5,
  assist: 3,
  conversion: 2,
  playerOfMatch: 10,
  win: 5,
  attendance: 1,
  captainMultiplier: 2,
} as const;

export interface RawStats {
  tries: number;
  assists: number;
  conversions: number;
  player_of_match: boolean;
  win: boolean;
  attended: boolean;
}

export function computePoints(s: RawStats): number {
  return (
    s.tries * SCORING.try +
    s.assists * SCORING.assist +
    s.conversions * SCORING.conversion +
    (s.player_of_match ? SCORING.playerOfMatch : 0) +
    (s.win ? SCORING.win : 0) +
    (s.attended ? SCORING.attendance : 0)
  );
}

export const SQUAD_RULES = {
  budget: 100,
  size: 10,
  maxPerTeam: 2,
  freeTransfersPerGameweek: 1,
  extraTransferHit: 4,
} as const;

export interface SquadSlot {
  playerId: string;
  teamId: string;
  price: number;
  isCaptain: boolean;
}

/** Client-side pre-validation; validate_squad() in Postgres re-checks. */
export function validateSquad(slots: SquadSlot[]): string | null {
  if (slots.length > SQUAD_RULES.size) return `Maximum ${SQUAD_RULES.size} players.`;
  const spend = slots.reduce((a, s) => a + s.price, 0);
  if (spend > SQUAD_RULES.budget)
    return `Over budget: £${spend.toFixed(1)}m / £${SQUAD_RULES.budget}m.`;
  const perTeam = new Map<string, number>();
  for (const s of slots) perTeam.set(s.teamId, (perTeam.get(s.teamId) ?? 0) + 1);
  for (const n of perTeam.values())
    if (n > SQUAD_RULES.maxPerTeam) return `Max ${SQUAD_RULES.maxPerTeam} players per team.`;
  if (slots.filter((s) => s.isCaptain).length > 1) return 'Only one captain allowed.';
  return null;
}

export function formatMoney(m: number): string {
  return `£${m.toFixed(1)}m`;
}
