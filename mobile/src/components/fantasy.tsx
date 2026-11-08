// Fantasy badge family — DeadlineChip, RankBadge, FormDots, PriceArrow,
// ArmbandIcon. Small, composable, colour+icon (never colour alone).
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, spacing } from '@/theme';

// ---------------------------------------------------------------------------
// DeadlineChip — countdown to the gameweek lock.
// Grey → amber (< 24 h) → red (< 2 h) → "Locked".
// ---------------------------------------------------------------------------
export function DeadlineChip({ deadline }: { deadline: string | Date }) {
  const target = new Date(deadline).getTime();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const ms = target - now;
  const locked = ms <= 0;
  const hours = ms / 3_600_000;

  const tone = locked ? 'locked' : hours < 2 ? 'soon' : hours < 24 ? 'warn' : 'calm';
  const bg = {
    locked: colors.cardAlt,
    soon: colors.fall,
    warn: colors.warn,
    calm: colors.cardAlt,
  }[tone];
  const fg = tone === 'soon' || tone === 'warn' ? '#0B3D2E' : colors.textMuted;

  const label = locked ? '🔒 Locked' : `⏱ Locks in ${formatRemaining(ms)}`;

  return (
    <View
      style={[styles.chip, { backgroundColor: bg }]}
      accessibilityRole="text"
      accessibilityLabel={locked ? 'Transfer window locked' : `Deadline in ${formatRemaining(ms)}`}
    >
      <Text style={[styles.chipText, { color: fg }]}>{label}</Text>
    </View>
  );
}

function formatRemaining(ms: number): string {
  const mins = Math.floor(ms / 60_000);
  const d = Math.floor(mins / 1_440);
  const h = Math.floor((mins % 1_440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ---------------------------------------------------------------------------
// RankBadge — "#4 ▲2" with movement. movement > 0 means climbed.
// ---------------------------------------------------------------------------
export function RankBadge({ rank, movement }: { rank?: number | null; movement?: number | null }) {
  if (rank == null) return <Text style={font.muted}>Unranked</Text>;
  const arrow = movement == null || movement === 0 ? '—' : movement > 0 ? '▲' : '▼';
  const tone = movement == null || movement === 0 ? colors.textMuted : movement > 0 ? colors.rise : colors.fall;
  return (
    <View style={styles.rankWrap} accessibilityLabel={`Rank ${rank}${movement ? `, moved ${movement > 0 ? 'up' : 'down'} ${Math.abs(movement)}` : ''}`}>
      <Text style={styles.rankText}>#{rank}</Text>
      <Text style={[styles.rankArrow, { color: tone }]}>
        {arrow}
        {movement ? Math.abs(movement) : ''}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// FormDots — last N gameweek points as dots. Filled = hauled (≥ 8 pts).
// Oldest → newest left → right.
// ---------------------------------------------------------------------------
export function FormDots({ gameweeks, threshold = 8 }: { gameweeks: number[]; threshold?: number }) {
  if (!gameweeks.length) return null;
  return (
    <View
      style={styles.dots}
      accessibilityLabel={`Form: ${gameweeks.join(', ')} points over the last ${gameweeks.length} gameweeks`}
    >
      {gameweeks.map((pts, i) => (
        <View
          key={i}
          style={[styles.dot, { backgroundColor: pts >= threshold ? colors.gold : colors.cardAlt }]}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// PriceArrow — ▲/▼ with the delta, from price_history. Null/0 renders nothing.
// ---------------------------------------------------------------------------
export function PriceArrow({ delta }: { delta?: number | null }) {
  if (delta == null || delta === 0) return null;
  const up = delta > 0;
  return (
    <Text
      style={[styles.arrow, { color: up ? colors.rise : colors.fall }]}
      accessibilityLabel={`Price ${up ? 'rose' : 'fell'} £${Math.abs(delta).toFixed(1)}m this week`}
    >
      {up ? '▲' : '▼'}£{Math.abs(delta).toFixed(1)}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// ArmbandIcon — captain © / POTM ⭐ badges.
// ---------------------------------------------------------------------------
export function ArmbandIcon({ kind }: { kind: 'captain' | 'pom' }) {
  return (
    <View style={styles.armband} accessibilityLabel={kind === 'captain' ? 'Captain' : 'Player of the match'}>
      <Text style={styles.armbandText}>{kind === 'captain' ? '©' : '⭐'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: radius.full,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
    alignSelf: 'flex-start',
  },
  chipText: { fontSize: 12, fontWeight: '700' },
  rankWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  rankText: { color: colors.text, fontWeight: '800', fontSize: 15 },
  rankArrow: { fontWeight: '700', fontSize: 12 },
  dots: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  arrow: { fontWeight: '700', fontSize: 12 },
  armband: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  armbandText: { fontSize: 13, fontWeight: '800', color: '#0B3D2E' },
});
