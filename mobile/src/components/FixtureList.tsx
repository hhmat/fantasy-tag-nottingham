// Shared compact fixture/result rows with Match Centre navigation.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, font, radius, spacing } from '@/theme';
import type { Fixture } from '@/types';

export function FixtureList({ fixtures, emptyLabel }: { fixtures: Fixture[]; emptyLabel: string }) {
  if (!fixtures.length) return <Text style={font.muted}>{emptyLabel}</Text>;
  return <>{fixtures.map((fixture) => <FixtureRow key={fixture.id} fixture={fixture} />)}</>;
}

export function FixtureRow({ fixture }: { fixture: Fixture }) {
  const router = useRouter();
  const scored = fixture.status === 'live' || fixture.status === 'finished';
  const date = new Date(fixture.kickoff).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
  return (
    <Pressable
      onPress={() => router.push(`/match/${fixture.id}`)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Open Match Centre for ${fixture.home_team_name} versus ${fixture.away_team_name}, gameweek ${fixture.gameweek_id}`}
    >
      <View style={styles.meta}>
        <Text style={font.tiny}>GW{fixture.gameweek_id}</Text>
        <Text style={font.tiny}>{date}</Text>
      </View>
      <View style={styles.teams}>
        <Text style={font.body} numberOfLines={2}>{fixture.home_short} vs {fixture.away_short}</Text>
        <Text style={font.tiny}>{fixture.home_team_name} v {fixture.away_team_name}</Text>
      </View>
      <View style={styles.scoreWrap}>
        <Text style={[styles.score, fixture.status === 'live' && { color: colors.live }]}>
          {scored ? `${fixture.home_score ?? 0}–${fixture.away_score ?? 0}` : 'vs'}
        </Text>
        <Text style={font.tiny}>{fixture.status === 'finished' ? 'FT' : fixture.status.toUpperCase()} ›</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing(3),
    marginBottom: spacing(2),
  },
  pressed: { opacity: 0.7 },
  meta: { width: 64, gap: spacing(1) },
  teams: { flex: 1, minWidth: 0, gap: spacing(1) },
  scoreWrap: { minWidth: 52, alignItems: 'flex-end', gap: spacing(1) },
  score: { color: colors.accent, fontWeight: '800', fontSize: 17 },
});
