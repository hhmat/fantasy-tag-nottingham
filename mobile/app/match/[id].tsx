// Match Centre — live score, team comparison, timeline and player performances.
import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getFixture, getMatchEvents, getMatchPerformances, subscribeToMatch } from '@/api/matches';
import { computePoints } from '@/lib/scoring';
import { Badge, Button, Card, Screen, SectionTitle } from '@/components/ui';
import { colors, font, radius, spacing } from '@/theme';
import type { MatchEvent, MatchPerformance } from '@/types';

export default function MatchCentreScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const fixtureQuery = useQuery({ queryKey: ['match', id], queryFn: () => getFixture(id!), enabled: !!id });
  const eventsQuery = useQuery({ queryKey: ['match-events', id], queryFn: () => getMatchEvents(id!), enabled: !!id });
  const performancesQuery = useQuery({ queryKey: ['match-performances', id], queryFn: () => getMatchPerformances(id!), enabled: !!id });

  useEffect(() => {
    if (!id) return;
    return subscribeToMatch(id, () => {
      qc.invalidateQueries({ queryKey: ['match', id] });
      qc.invalidateQueries({ queryKey: ['match-events', id] });
      qc.invalidateQueries({ queryKey: ['match-performances', id] });
      qc.invalidateQueries({ queryKey: ['fixtures'] });
    });
  }, [id, qc]);

  if (fixtureQuery.isPending) return <Screen><ActivityIndicator color={colors.accent} style={styles.loader} /></Screen>;
  if (fixtureQuery.isError || !fixtureQuery.data) {
    return <Screen><Text style={[font.h2, styles.loader]}>We couldn’t load this match.</Text><Button title="Try again" onPress={() => fixtureQuery.refetch()} /></Screen>;
  }

  const fixture = fixtureQuery.data;
  const events = eventsQuery.data ?? [];
  const performances = performancesQuery.data ?? [];
  const scored = fixture.status === 'live' || fixture.status === 'finished';
  const homePerformances = performances.filter((p) => p.players.team_id === fixture.home_team_id);
  const awayPerformances = performances.filter((p) => p.players.team_id === fixture.away_team_id);

  return (
    <Screen>
      <Card style={styles.scoreCard}>
        <View style={styles.statusRow}>
          <Text style={font.tiny}>GAMEWEEK {fixture.gameweek_id}</Text>
          {fixture.status === 'live' ? <Badge text="● LIVE" color={colors.live} /> : <Badge text={fixture.status.toUpperCase()} color={colors.textMuted} />}
        </View>
        <View style={styles.scoreRow}>
          <TeamLink name={fixture.home_team_name} short={fixture.home_short} onPress={() => router.push(`/team/${fixture.home_team_id}`)} />
          <View style={styles.scoreBox}>
            <Text style={styles.score}>{scored ? `${fixture.home_score ?? 0} – ${fixture.away_score ?? 0}` : 'vs'}</Text>
            <Text style={font.tiny}>{fixture.status === 'finished' ? 'FULL TIME' : fixture.status === 'live' ? 'LIVE SCORE' : 'KICK OFF'}</Text>
          </View>
          <TeamLink name={fixture.away_team_name} short={fixture.away_short} onPress={() => router.push(`/team/${fixture.away_team_id}`)} />
        </View>
        <Text style={[font.muted, styles.matchMeta]}>
          {formatKickoff(fixture.kickoff)}{fixture.venue ? `\n${fixture.venue}` : ''}
        </Text>
        {fixture.status === 'live' ? <Text style={styles.liveNote}>Updates automatically when scores, events or statistics change.</Text> : null}
      </Card>

      <SectionTitle>Match statistics</SectionTitle>
      <Card>
        {performancesQuery.isPending ? <ActivityIndicator color={colors.accent} /> : null}
        {performancesQuery.isError ? <InlineError onRetry={performancesQuery.refetch} /> : null}
        {!performancesQuery.isPending && !performancesQuery.isError && performances.length === 0 ? (
          <Text style={font.muted}>Team statistics will appear when player performances are entered.</Text>
        ) : null}
        {!performancesQuery.isError && performances.length > 0 ? (
          <TeamComparison home={homePerformances} away={awayPerformances} homeShort={fixture.home_short} awayShort={fixture.away_short} />
        ) : null}
      </Card>

      <SectionTitle>Match events</SectionTitle>
      <Card>
        {eventsQuery.isPending ? <ActivityIndicator color={colors.accent} /> : null}
        {eventsQuery.isError ? <InlineError onRetry={eventsQuery.refetch} label="Timeline unavailable. Apply migration 0015, then retry." /> : null}
        {!eventsQuery.isPending && !eventsQuery.isError && events.length === 0 ? (
          <Text style={font.muted}>No timeline events yet. Scores and fantasy points are still shown above.</Text>
        ) : null}
        {!eventsQuery.isError ? events.map((event, index) => (
          <EventRow key={event.id} event={event} isHome={event.team_id === fixture.home_team_id} last={index === events.length - 1} onPress={() => router.push(`/player/${event.player_id}`)} />
        )) : null}
      </Card>

      <SectionTitle>Player performances</SectionTitle>
      {performancesQuery.isError ? <InlineError onRetry={performancesQuery.refetch} /> : null}
      {!performancesQuery.isPending && !performancesQuery.isError && performances.length === 0 ? (
        <Card><Text style={font.muted}>No player statistics have been entered for this match.</Text></Card>
      ) : null}
      <PerformanceTable title={fixture.home_team_name} performances={homePerformances} onPlayer={(playerId) => router.push(`/player/${playerId}`)} />
      <PerformanceTable title={fixture.away_team_name} performances={awayPerformances} onPlayer={(playerId) => router.push(`/player/${playerId}`)} />
      <Text style={[font.tiny, styles.scoringNote]}>Fantasy points: try 5 · assist 3 · conversion 2 · POTM 10 · win 5 · attendance 1.</Text>
    </Screen>
  );
}

function TeamLink({ name, short, onPress }: { name: string; short: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.teamLink} accessibilityRole="button" accessibilityLabel={`Open ${name} team page`}>
      <View style={styles.teamBadge}><Text style={styles.teamShort}>{short}</Text></View>
      <Text style={[font.h3, styles.teamName]}>{name}</Text>
    </Pressable>
  );
}

function TeamComparison({ home, away, homeShort, awayShort }: { home: MatchPerformance[]; away: MatchPerformance[]; homeShort: string; awayShort: string }) {
  const total = (rows: MatchPerformance[], key: 'tries' | 'assists' | 'conversions') => rows.reduce((sum, row) => sum + row[key], 0);
  const points = (rows: MatchPerformance[]) => rows.reduce((sum, row) => sum + computePoints(row), 0);
  const rows = [
    { label: 'Tries', home: total(home, 'tries'), away: total(away, 'tries') },
    { label: 'Assists', home: total(home, 'assists'), away: total(away, 'assists') },
    { label: 'Conversions', home: total(home, 'conversions'), away: total(away, 'conversions') },
    { label: 'Fantasy points', home: points(home), away: points(away) },
  ];
  return (
    <View>
      <View style={styles.comparisonRow}><Text style={styles.comparisonHead}>{homeShort}</Text><Text style={font.tiny}>TEAM TOTALS</Text><Text style={styles.comparisonHead}>{awayShort}</Text></View>
      {rows.map((row) => <View key={row.label} style={styles.comparisonRow}><Text style={styles.comparisonValue}>{row.home}</Text><Text style={font.muted}>{row.label}</Text><Text style={styles.comparisonValue}>{row.away}</Text></View>)}
    </View>
  );
}

function EventRow({ event, isHome, last, onPress }: { event: MatchEvent; isHome: boolean; last: boolean; onPress: () => void }) {
  const label = event.event_type === 'player_of_match' ? 'Player of the Match' : event.event_type === 'try' ? 'Try' : event.event_type === 'assist' ? 'Assist' : 'Conversion';
  return (
    <Pressable onPress={onPress} style={[styles.eventRow, !last && styles.eventBorder]} accessibilityRole="button" accessibilityLabel={`${label}, ${event.players.first_name} ${event.players.last_name}. View player.`}>
      <View style={styles.minute}><Text style={styles.minuteText}>{event.minute != null ? `${event.minute}′` : '•'}</Text></View>
      <View style={styles.eventCopy}>
        <Text style={font.h3}>{label} · {isHome ? 'Home' : 'Away'}</Text>
        <Text style={font.muted}>{event.players.first_name} {event.players.last_name}</Text>
      </View>
      <Text style={styles.eventArrow}>›</Text>
    </Pressable>
  );
}

function PerformanceTable({ title, performances, onPlayer }: { title: string; performances: MatchPerformance[]; onPlayer: (id: string) => void }) {
  if (!performances.length) return null;
  return (
    <View style={styles.performanceGroup}>
      <Text style={[font.h3, styles.performanceTitle]}>{title}</Text>
      <View style={styles.performanceHeader}>
        <Text style={[font.tiny, styles.playerColumn]}>PLAYER</Text><Text style={styles.statHead}>T</Text><Text style={styles.statHead}>A</Text><Text style={styles.statHead}>C</Text><Text style={styles.statHead}>PTS</Text>
      </View>
      {performances.map((performance) => (
        <Pressable key={performance.id} onPress={() => onPlayer(performance.player_id)} style={styles.performanceRow} accessibilityRole="button" accessibilityLabel={`${performance.players.first_name} ${performance.players.last_name}, ${computePoints(performance)} fantasy points. View player.`}>
          <View style={styles.playerColumn}>
            <Text style={font.body} numberOfLines={1}>{performance.players.first_name} {performance.players.last_name}{performance.player_of_match ? ' ⭐' : ''}</Text>
            <Text style={font.tiny}>{performance.players.position}{performance.attended ? ' · Attended' : ' · No attendance'}{performance.win ? ' · Win bonus' : ''}</Text>
          </View>
          <Text style={styles.statValue}>{performance.tries}</Text><Text style={styles.statValue}>{performance.assists}</Text><Text style={styles.statValue}>{performance.conversions}</Text><Text style={styles.points}>{computePoints(performance)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function InlineError({ onRetry, label = 'Couldn’t load this section. Tap to retry.' }: { onRetry: () => void; label?: string }) {
  return <Pressable onPress={onRetry} style={styles.retry} accessibilityRole="button" accessibilityLabel={label}><Text style={font.muted}>{label}</Text></Pressable>;
}

function formatKickoff(kickoff: string) {
  return new Date(kickoff).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  loader: { marginTop: spacing(16), textAlign: 'center' },
  scoreCard: { paddingHorizontal: spacing(3) },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing(4), gap: spacing(1) },
  teamLink: { flex: 1, alignItems: 'center', minHeight: 96, gap: spacing(2) },
  teamBadge: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  teamShort: { color: colors.accent, fontWeight: '800', fontSize: 12 },
  teamName: { textAlign: 'center', fontSize: 14 },
  scoreBox: { minWidth: 86, alignItems: 'center' },
  score: { color: colors.accent, fontWeight: '900', fontSize: 30 },
  matchMeta: { textAlign: 'center', marginTop: spacing(4), lineHeight: 20 },
  liveNote: { color: colors.accent, fontSize: 11, textAlign: 'center', marginTop: spacing(2) },
  comparisonRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 40, borderBottomWidth: 1, borderBottomColor: colors.border },
  comparisonHead: { color: colors.accent, fontWeight: '800', width: 60, textAlign: 'center' },
  comparisonValue: { color: colors.text, fontWeight: '800', width: 60, textAlign: 'center', fontSize: 16 },
  eventRow: { flexDirection: 'row', alignItems: 'center', minHeight: 68, paddingVertical: spacing(2), gap: spacing(3) },
  eventBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  minute: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  minuteText: { color: colors.accent, fontWeight: '800' },
  eventCopy: { flex: 1 },
  eventArrow: { color: colors.accent, fontSize: 24 },
  performanceGroup: { marginBottom: spacing(3) },
  performanceTitle: { marginBottom: spacing(2) },
  performanceHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing(2), minHeight: 28 },
  performanceRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: spacing(2), marginBottom: spacing(1), minHeight: 60 },
  playerColumn: { flex: 1, minWidth: 0, paddingRight: spacing(1) },
  statHead: { width: 28, textAlign: 'center', color: colors.textMuted, fontSize: 10, fontWeight: '700' },
  statValue: { width: 28, textAlign: 'center', color: colors.text, fontSize: 13 },
  points: { width: 28, textAlign: 'center', color: colors.accent, fontWeight: '800' },
  scoringNote: { textAlign: 'center', lineHeight: 17 },
  retry: { minHeight: 48, justifyContent: 'center' },
});
