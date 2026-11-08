// Real team profile — identity, record, squad, upcoming fixtures and results.
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { getPlayers, getTeam } from '@/api/players';
import { getTeamFixtures } from '@/api/matches';
import { Button, Card, Screen, SectionTitle } from '@/components/ui';
import { PlayerRow } from '@/components/PlayerRow';
import { TeamBadge } from '@/components/ProfileImage';
import { FixtureList } from '@/components/FixtureList';
import { colors, font, radius, spacing } from '@/theme';
import type { Fixture } from '@/types';

export default function TeamProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const teamQuery = useQuery({ queryKey: ['team', id], queryFn: () => getTeam(id!), enabled: !!id });
  const rosterQuery = useQuery({ queryKey: ['team-roster', id], queryFn: () => getPlayers({ teamId: id, sortBy: 'total_points' }), enabled: !!id });
  const fixturesQuery = useQuery({ queryKey: ['team-fixtures', id], queryFn: () => getTeamFixtures(id!), enabled: !!id });

  if (teamQuery.isPending) return <Screen><ActivityIndicator color={colors.accent} style={styles.loader} /></Screen>;
  if (teamQuery.isError || !teamQuery.data) {
    return <Screen><Text style={[font.h2, styles.loader]}>We couldn’t load this team.</Text><Button title="Try again" onPress={() => teamQuery.refetch()} /></Screen>;
  }

  const team = teamQuery.data;
  const roster = rosterQuery.data ?? [];
  const fixtures = fixturesQuery.data ?? [];
  const results = fixtures.filter((f) => f.status === 'finished').reverse();
  const upcoming = fixtures.filter((f) => f.status === 'scheduled' || f.status === 'live');
  const record = getRecord(fixtures, id);

  return (
    <Screen>
      <Card style={[styles.header, { borderLeftColor: team.primary_color }]}>
        <TeamBadge value={team.crest_url} name={team.name} primaryColor={team.primary_color} secondaryColor={team.secondary_color} size={88} />
        <View style={styles.identity}>
          <Text style={styles.short}>{team.short_name}</Text>
          <Text style={font.h1}>{team.name}</Text>
          <Text style={font.muted}>{roster.length} players · Nottingham league</Text>
        </View>
      </Card>

      <View style={styles.recordGrid}>
        <RecordBox label="Played" value={record.played} />
        <RecordBox label="Won" value={record.won} />
        <RecordBox label="Drawn" value={record.drawn} />
        <RecordBox label="Lost" value={record.lost} />
      </View>
      <Card style={styles.formCard}>
        <Text style={font.tiny}>RECENT FORM · OLDEST TO NEWEST</Text>
        <View style={styles.formRow}>
          {record.form.length ? record.form.map((result, index) => (
            <View key={`${result}-${index}`} style={[styles.formBadge, result === 'W' && styles.win, result === 'L' && styles.loss]}>
              <Text style={styles.formText}>{result}</Text>
            </View>
          )) : <Text style={font.muted}>No completed matches yet.</Text>}
        </View>
      </Card>

      <SectionTitle>Squad</SectionTitle>
      {rosterQuery.isPending ? <ActivityIndicator color={colors.accent} /> : null}
      {rosterQuery.isError ? <Text style={font.muted}>Squad unavailable. Pull down later to retry.</Text> : null}
      {!rosterQuery.isPending && !rosterQuery.isError && roster.length === 0 ? <Text style={font.muted}>No active players listed.</Text> : null}
      {roster.map((player) => (
        <PlayerRow
          key={player.player_id}
          name={`${player.first_name} ${player.last_name}`}
          teamShort={player.team_short}
          position={player.position}
          price={player.price}
          points={player.total_points}
          onPress={() => router.push(`/player/${player.player_id}`)}
        />
      ))}

      <SectionTitle>Upcoming fixtures</SectionTitle>
      {fixturesQuery.isError ? <Button title="Retry fixtures" variant="ghost" onPress={() => fixturesQuery.refetch()} /> : (
        <FixtureList fixtures={upcoming.slice(0, 6)} emptyLabel="No upcoming fixtures scheduled." />
      )}

      <SectionTitle>Results</SectionTitle>
      {!fixturesQuery.isError ? <FixtureList fixtures={results.slice(0, 8)} emptyLabel="No results yet." /> : null}
    </Screen>
  );
}

function getRecord(fixtures: Fixture[], teamId: string) {
  const record = { played: 0, won: 0, drawn: 0, lost: 0, form: [] as Array<'W' | 'D' | 'L'> };
  for (const fixture of fixtures) {
    if (fixture.status !== 'finished' || fixture.home_score == null || fixture.away_score == null) continue;
    const home = fixture.home_team_id === teamId;
    const own = home ? fixture.home_score : fixture.away_score;
    const opposition = home ? fixture.away_score : fixture.home_score;
    const result = own > opposition ? 'W' : own < opposition ? 'L' : 'D';
    record.played += 1;
    if (result === 'W') record.won += 1;
    if (result === 'D') record.drawn += 1;
    if (result === 'L') record.lost += 1;
    record.form.push(result);
  }
  record.form = record.form.slice(-5);
  return record;
}

function RecordBox({ label, value }: { label: string; value: number }) {
  return <View style={styles.recordBox}><Text style={styles.recordValue}>{value}</Text><Text style={font.tiny}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  loader: { marginTop: spacing(16), textAlign: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing(4), borderLeftWidth: 5 },
  identity: { flex: 1, minWidth: 0 },
  short: { color: colors.accent, fontWeight: '800', fontSize: 12, letterSpacing: 2, marginBottom: spacing(1) },
  recordGrid: { flexDirection: 'row', gap: spacing(2) },
  recordBox: { flex: 1, alignItems: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: spacing(3) },
  recordValue: { color: colors.text, fontWeight: '800', fontSize: 20 },
  formCard: { marginTop: spacing(2) },
  formRow: { flexDirection: 'row', gap: spacing(2), marginTop: spacing(2), minHeight: 32, alignItems: 'center' },
  formBadge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardAlt },
  win: { backgroundColor: colors.success },
  loss: { backgroundColor: colors.danger },
  formText: { color: '#FFFFFF', fontWeight: '800' },
});
