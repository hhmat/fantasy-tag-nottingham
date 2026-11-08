// Player profile — identity, form trend, price movement and linked match history.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { getPlayer, getPlayerMatchLog, getPlayerPriceHistory } from '@/api/players';
import { computePoints, formatMoney } from '@/lib/scoring';
import { FormChart, PriceChart } from '@/components/PerformanceCharts';
import { Badge, Button, Card, Screen, SectionTitle } from '@/components/ui';
import { colors, font, radius, spacing } from '@/theme';

export default function PlayerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const playerQuery = useQuery({ queryKey: ['player', id], queryFn: () => getPlayer(id!), enabled: !!id });
  const historyQuery = useQuery({ queryKey: ['price-history', id], queryFn: () => getPlayerPriceHistory(id!), enabled: !!id });
  const matchQuery = useQuery({ queryKey: ['match-log', id], queryFn: () => getPlayerMatchLog(id!), enabled: !!id });

  if (playerQuery.isPending) {
    return <Screen><ActivityIndicator color={colors.accent} style={styles.loader} /></Screen>;
  }
  if (playerQuery.isError || !playerQuery.data) {
    return (
      <Screen>
        <Text style={[font.h2, styles.loader]}>We couldn’t load this player.</Text>
        <Button title="Try again" onPress={() => playerQuery.refetch()} />
      </Screen>
    );
  }

  const player = playerQuery.data;
  const history = historyQuery.data ?? [];
  const matchLog = matchQuery.data ?? [];
  const latestChange = history[0];
  const chronologicalForm = matchLog.slice(0, 6).reverse().map((match) => ({
    label: `GW${match.fixtures.gameweek_id}`,
    value: computePoints(match),
  }));
  const chronologicalPrices = [...history].reverse().map((change) => ({
    label: change.gameweek_id ? `GW${change.gameweek_id}` : shortDate(change.changed_at),
    value: Number(change.new_price),
  }));
  if (!chronologicalPrices.length || chronologicalPrices[chronologicalPrices.length - 1].value !== Number(player.price)) {
    chronologicalPrices.push({ label: 'Now', value: Number(player.price) });
  }

  return (
    <Screen>
      <Card style={styles.identity}>
        <PlayerAvatar uri={player.photo_url} name={`${player.first_name} ${player.last_name}`} fallback={player.team_short} />
        <Text style={[font.h1, styles.centre]}>{player.first_name} {player.last_name}</Text>
        <Text style={font.muted}>{player.position}</Text>
        <Pressable
          onPress={() => router.push(`/team/${player.team_id}`)}
          style={styles.teamLink}
          accessibilityRole="button"
          accessibilityLabel={`View ${player.team_name} team page`}
        >
          <Text style={styles.teamLinkText}>{player.team_name} ›</Text>
        </Pressable>
        <View style={styles.badges}>
          <Badge text={formatMoney(player.price)} />
          {latestChange ? (
            <Badge
              text={`${latestChange.new_price > latestChange.old_price ? '▲' : '▼'} ${formatMoney(Math.abs(latestChange.new_price - latestChange.old_price))}`}
              color={latestChange.new_price > latestChange.old_price ? colors.success : colors.danger}
            />
          ) : null}
        </View>
      </Card>

      <SectionTitle>Season overview</SectionTitle>
      <View style={styles.statGrid}>
        <StatBox label="Fantasy pts" value={player.total_points} highlight />
        <StatBox label="Tries" value={player.tries} />
        <StatBox label="Assists" value={player.assists} />
        <StatBox label="Conversions" value={player.conversions} />
        <StatBox label="POTM" value={player.pom_awards} />
        <StatBox label="Wins" value={player.wins} />
        <StatBox label="Games" value={player.appearances} />
      </View>

      <SectionTitle>Form trend</SectionTitle>
      <Card>
        {matchQuery.isError ? <QueryError onRetry={matchQuery.refetch} /> : <FormChart points={chronologicalForm} />}
      </Card>

      <SectionTitle>Price history</SectionTitle>
      <Card>
        {historyQuery.isError ? <QueryError onRetry={historyQuery.refetch} /> : <PriceChart points={chronologicalPrices.slice(-8)} />}
        {!historyQuery.isError && history.length > 0 ? <View style={styles.divider} /> : null}
        {!historyQuery.isError ? history.slice(0, 5).map((change) => (
          <View key={`${change.changed_at}-${change.new_price}`} style={styles.historyRow}>
            <Text style={font.body}>{formatMoney(change.old_price)} → {formatMoney(change.new_price)}</Text>
            <Text style={font.tiny}>{shortDate(change.changed_at)}</Text>
          </View>
        )) : null}
      </Card>

      <SectionTitle>Match history</SectionTitle>
      {matchQuery.isError ? <QueryError onRetry={matchQuery.refetch} /> : null}
      {!matchQuery.isError && matchLog.length === 0 ? <Text style={font.muted}>No appearances yet.</Text> : null}
      {!matchQuery.isError ? matchLog.slice(0, 12).map((match) => {
        const home = match.fixtures.home_team.id === player.team_id;
        const opponent = home ? match.fixtures.away_team : match.fixtures.home_team;
        const ownScore = home ? match.fixtures.home_score : match.fixtures.away_score;
        const opponentScore = home ? match.fixtures.away_score : match.fixtures.home_score;
        const result = ownScore == null || opponentScore == null ? '—' : ownScore > opponentScore ? 'W' : ownScore < opponentScore ? 'L' : 'D';
        return (
          <Pressable
            key={match.id}
            onPress={() => router.push(`/match/${match.fixture_id}`)}
            style={({ pressed }) => [styles.matchRow, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={`Gameweek ${match.fixtures.gameweek_id}, ${home ? 'home' : 'away'} against ${opponent.name}, ${computePoints(match)} fantasy points. Open Match Centre.`}
          >
            <View style={styles.matchTop}>
              <Text style={font.tiny}>GW{match.fixtures.gameweek_id} · {shortDate(match.fixtures.kickoff)}</Text>
              <Text style={styles.points}>{computePoints(match)} pts</Text>
            </View>
            <View style={styles.matchBottom}>
              <Text style={[font.h3, styles.opponent]} numberOfLines={1}>{home ? 'H' : 'A'} · {opponent.name}</Text>
              <Text style={font.body}>{result} {ownScore ?? '—'}–{opponentScore ?? '—'}</Text>
            </View>
            <Text style={font.tiny}>{match.tries}T · {match.assists}A · {match.conversions}C{match.player_of_match ? ' · ⭐ POTM' : ''}{match.attended ? ' · Attended' : ''}</Text>
          </Pressable>
        );
      }) : null}
    </Screen>
  );
}

function PlayerAvatar({ uri, name, fallback }: { uri: string | null; name: string; fallback: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  if (uri && !failed) {
    return <Image source={{ uri }} onError={() => setFailed(true)} style={styles.avatar} accessibilityLabel={`${name} profile photo`} />;
  }
  return (
    <View style={[styles.avatar, styles.avatarFallback]} accessibilityLabel={`${name} avatar placeholder`}>
      <Text style={styles.avatarText}>{fallback}</Text>
    </View>
  );
}

function StatBox({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, highlight && { color: colors.accent }]}>{value}</Text>
      <Text style={[font.tiny, styles.centre]}>{label}</Text>
    </View>
  );
}

function QueryError({ onRetry }: { onRetry: () => void }) {
  return (
    <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Retry loading data" style={styles.retry}>
      <Text style={font.muted}>Couldn’t load this section. Tap to retry.</Text>
    </Pressable>
  );
}

function shortDate(date: string) {
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  loader: { marginTop: spacing(16), textAlign: 'center' },
  identity: { alignItems: 'center' },
  centre: { textAlign: 'center' },
  avatar: { width: 104, height: 104, borderRadius: 52, marginBottom: spacing(3), backgroundColor: colors.cardAlt },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.accent },
  avatarText: { color: colors.accent, fontWeight: '800', fontSize: 24 },
  teamLink: { minHeight: 44, justifyContent: 'center' },
  teamLinkText: { color: colors.accent, fontSize: 15, fontWeight: '700' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing(2), marginTop: spacing(1) },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  statBox: {
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(1),
    alignItems: 'center',
    flexBasis: '22%',
    flexGrow: 1,
  },
  statValue: { color: colors.text, fontWeight: '800', fontSize: 18 },
  divider: { height: 1, backgroundColor: colors.border, marginTop: spacing(4) },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing(2), borderBottomWidth: 1, borderBottomColor: colors.border },
  matchRow: { backgroundColor: colors.card, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: spacing(3), marginBottom: spacing(2), minHeight: 92, gap: spacing(2) },
  matchTop: { flexDirection: 'row', justifyContent: 'space-between' },
  matchBottom: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing(2) },
  opponent: { flex: 1 },
  points: { color: colors.accent, fontWeight: '800', fontSize: 16 },
  retry: { minHeight: 48, justifyContent: 'center' },
});
