// Player profile — season stats, price history, recent match log.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { getPlayer, getPlayerMatchLog, getPlayerPriceHistory } from '@/api/players';
import { computePoints } from '@/lib/scoring';
import { Card, Screen, SectionTitle, Badge } from '@/components/ui';
import { colors, font, radius, spacing } from '@/theme';
import { formatMoney } from '@/lib/scoring';

export default function PlayerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: player } = useQuery({ queryKey: ['player', id], queryFn: () => getPlayer(id!) });
  const { data: history = [] } = useQuery({
    queryKey: ['price-history', id],
    queryFn: () => getPlayerPriceHistory(id!),
  });
  const { data: matchLog = [] } = useQuery({
    queryKey: ['match-log', id],
    queryFn: () => getPlayerMatchLog(id!),
  });

  if (!player) return <Screen>{null}</Screen>;

  const latestChange = history[0];

  return (
    <Screen>
      {/* Header */}
      <Card style={{ alignItems: 'center' }}>
        <View style={styles.avatar}>
          <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 18 }}>
            {player.team_short}
          </Text>
        </View>
        <Text style={font.h1}>
          {player.first_name} {player.last_name}
        </Text>
        <Text style={font.muted}>
          {player.position} ·{' '}
          <Text style={{ color: colors.accent }} onPress={() => router.push(`/team/${player.team_id}`)}>
            {player.team_name}
          </Text>
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing(2), marginTop: spacing(2) }}>
          <Badge text={formatMoney(player.price)} />
          {latestChange ? (
            <Badge
              text={`${latestChange.new_price > latestChange.old_price ? '▲' : '▼'} ${formatMoney(
                Math.abs(latestChange.new_price - latestChange.old_price),
              )}`}
              color={latestChange.new_price > latestChange.old_price ? colors.success : colors.danger}
            />
          ) : null}
        </View>
      </Card>

      {/* Season stats */}
      <SectionTitle>Season stats</SectionTitle>
      <View style={styles.statGrid}>
        <StatBox label="Points" value={player.total_points} highlight />
        <StatBox label="Tries" value={player.tries} />
        <StatBox label="Assists" value={player.assists} />
        <StatBox label="Conversions" value={player.conversions} />
        <StatBox label="POTM" value={player.pom_awards} />
        <StatBox label="Wins" value={player.wins} />
        <StatBox label="Games" value={player.appearances} />
      </View>

      {/* Price history */}
      <SectionTitle>Price changes</SectionTitle>
      {history.length === 0 ? (
        <Text style={font.muted}>No price changes yet.</Text>
      ) : (
        history.slice(0, 5).map((h, i) => (
          <View key={i} style={styles.historyRow}>
            <Text style={font.body}>
              {formatMoney(h.old_price)} → {formatMoney(h.new_price)}
            </Text>
            <Text style={font.tiny}>
              {new Date(h.changed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </Text>
          </View>
        ))
      )}

      {/* Match log */}
      <SectionTitle>Match log</SectionTitle>
      {matchLog.length === 0 ? (
        <Text style={font.muted}>No appearances yet.</Text>
      ) : (
        matchLog.slice(0, 8).map((m: any) => (
          <View key={m.id} style={styles.historyRow}>
            <Text style={font.body}>
              GW{m.fixtures.gameweek_id} · {m.tries}T {m.assists}A {m.conversions}C
              {m.player_of_match ? ' ⭐' : ''}
            </Text>
            <Text style={{ color: colors.accent, fontWeight: '800' }}>{computePoints(m)} pts</Text>
          </View>
        ))
      )}
    </Screen>
  );
}

function StatBox({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, highlight && { color: colors.accent }]}>{value}</Text>
      <Text style={font.tiny}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing(2),
  },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  statBox: {
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing(3),
    alignItems: 'center',
    flexBasis: '22%',
    flexGrow: 1,
  },
  statValue: { color: colors.text, fontWeight: '800', fontSize: 18 },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing(2),
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
