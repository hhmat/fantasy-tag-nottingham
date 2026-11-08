// Fixtures — gameweek picker, live scores via Supabase Realtime.
import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { getCurrentGameweek, getFixtures, getGameweeks, subscribeToLiveScores } from '@/api/fixtures';
import { Badge, Screen } from '@/components/ui';
import { colors, font, radius, spacing } from '@/theme';
import type { Fixture } from '@/types';

export default function FixturesScreen() {
  const qc = useQueryClient();
  const { data: gameweeks = [] } = useQuery({ queryKey: ['gameweeks'], queryFn: getGameweeks });
  const { data: currentGw } = useQuery({ queryKey: ['current-gw'], queryFn: getCurrentGameweek });
  const [selectedGw, setSelectedGw] = useState<number | null>(null);

  const gwId = selectedGw ?? currentGw?.id ?? gameweeks[0]?.id;

  const { data: fixtures = [] } = useQuery({
    queryKey: ['fixtures', gwId],
    queryFn: () => getFixtures(gwId!),
    enabled: gwId != null,
  });

  // Live score subscription
  useEffect(() => {
    if (gwId == null) return;
    const unsub = subscribeToLiveScores(gwId, () =>
      qc.invalidateQueries({ queryKey: ['fixtures', gwId] }),
    );
    return unsub;
  }, [gwId]);

  return (
    <Screen scroll={false}>
      <View style={{ padding: spacing(4), paddingBottom: 0, flex: 1 }}>
        {/* Gameweek picker */}
        <FlatList
          horizontal
          data={gameweeks}
          keyExtractor={(g) => String(g.id)}
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, marginBottom: spacing(3) }}
          renderItem={({ item: g }) => (
            <Pressable
              onPress={() => setSelectedGw(g.id)}
              style={[styles.chip, gwId === g.id && styles.chipActive]}
              accessibilityRole="tab"
              accessibilityLabel={`Show gameweek ${g.id}: ${g.name}`}
              accessibilityState={{ selected: gwId === g.id }}
            >
              <Text style={[styles.chipText, gwId === g.id && { color: '#0B3D2E' }]}>GW{g.id}</Text>
            </Pressable>
          )}
        />

        <FlatList
          data={fixtures}
          keyExtractor={(f) => f.id}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={[font.muted, { textAlign: 'center', marginTop: 40 }]}>
              No fixtures for this gameweek yet.
            </Text>
          }
          renderItem={({ item: f }) => <FixtureCard fixture={f} />}
        />
      </View>
    </Screen>
  );
}

function FixtureCard({ fixture: f }: { fixture: Fixture }) {
  const router = useRouter();
  const played = f.status === 'finished';
  const live = f.status === 'live';
  return (
    <Pressable
      onPress={() => router.push(`/match/${f.id}`)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={`Open Match Centre: ${f.home_team_name} versus ${f.away_team_name}`}
    >
      <View style={styles.cardHeader}>
        <Text style={font.tiny}>
          {new Date(f.kickoff).toLocaleString('en-GB', {
            weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
          })}
          {f.venue ? ` · ${f.venue}` : ''}
        </Text>
        {live ? <Badge text="LIVE" color={colors.danger} /> : null}
        {played ? <Badge text="FT" color={colors.textMuted} /> : null}
      </View>
      <View style={styles.scoreRow}>
        <Text style={[styles.team, { textAlign: 'right' }]}>{f.home_team_name}</Text>
        <View style={styles.scoreBox}>
          <Text style={styles.score}>
            {played || live ? `${f.home_score ?? 0} - ${f.away_score ?? 0}` : 'vs'}
          </Text>
        </View>
        <Text style={[styles.team, { textAlign: 'left' }]}>{f.away_team_name}</Text>
      </View>
      <Text style={[font.tiny, styles.matchLink]}>Match Centre ›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: colors.card,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
    marginRight: spacing(2),
    minHeight: 44,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(3),
    marginBottom: spacing(2),
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing(2),
  },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  team: { ...font.h3, flex: 1 },
  scoreBox: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.sm,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1),
    minWidth: 64,
    alignItems: 'center',
  },
  score: { color: colors.accent, fontWeight: '800', fontSize: 16 },
  matchLink: { color: colors.accent, textAlign: 'right', marginTop: spacing(2) },
});
