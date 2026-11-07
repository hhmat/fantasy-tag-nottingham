// Admin — enter results (score → finished) and per-player statistics.
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  adminEnterResult,
  adminGetTeamPlayers,
  adminUpdateLiveScore,
  adminUpsertStats,
  getCurrentGameweek,
  getFixtures,
} from '@/api/fixtures';
import { Button, Card, Screen, SectionTitle } from '@/components/ui';
import { colors, font, radius, spacing } from '@/theme';
import type { Fixture } from '@/types';

export default function AdminResultsScreen() {
  const qc = useQueryClient();
  const { data: currentGw } = useQuery({ queryKey: ['current-gw'], queryFn: getCurrentGameweek });
  const { data: fixtures = [] } = useQuery({
    queryKey: ['fixtures', currentGw?.id],
    queryFn: () => getFixtures(currentGw!.id),
    enabled: !!currentGw,
  });
  const [selected, setSelected] = useState<Fixture | null>(null);

  return (
    <Screen>
      {!selected ? (
        <>
          <SectionTitle>{currentGw?.name ?? 'Fixtures'}</SectionTitle>
          {fixtures.map((f) => (
            <Pressable key={f.id} onPress={() => setSelected(f)}>
              <Card>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={font.h3}>
                    {f.home_team_name} vs {f.away_team_name}
                  </Text>
                  <Text style={{ color: colors.accent, fontWeight: '800' }}>
                    {f.status === 'finished' || f.status === 'live'
                      ? `${f.home_score ?? 0}-${f.away_score ?? 0}`
                      : '—'}
                  </Text>
                </View>
                <Text style={font.tiny}>{f.status.toUpperCase()} · tap to enter data</Text>
              </Card>
            </Pressable>
          ))}
        </>
      ) : (
        <FixtureEditor
          fixture={selected}
          onDone={() => {
            setSelected(null);
            qc.invalidateQueries({ queryKey: ['fixtures'] });
          }}
        />
      )}
    </Screen>
  );
}

// ---------------------------------------------------------------------------

function FixtureEditor({ fixture, onDone }: { fixture: Fixture; onDone: () => void }) {
  const qc = useQueryClient();
  const [homeScore, setHomeScore] = useState(String(fixture.home_score ?? ''));
  const [awayScore, setAwayScore] = useState(String(fixture.away_score ?? ''));

  const { data: homePlayers = [] } = useQuery({
    queryKey: ['team-players', fixture.home_team_id],
    queryFn: () => adminGetTeamPlayers(fixture.home_team_id),
  });
  const { data: awayPlayers = [] } = useQuery({
    queryKey: ['team-players', fixture.away_team_id],
    queryFn: () => adminGetTeamPlayers(fixture.away_team_id),
  });

  const liveMut = useMutation({
    mutationFn: () =>
      adminUpdateLiveScore(fixture.id, parseInt(homeScore || '0', 10), parseInt(awayScore || '0', 10)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fixtures'] });
      Alert.alert('Live score updated');
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const finishMut = useMutation({
    mutationFn: () =>
      adminEnterResult(fixture.id, parseInt(homeScore || '0', 10), parseInt(awayScore || '0', 10)),
    onSuccess: () => {
      Alert.alert('Result saved', 'Win bonuses have been applied.');
      onDone();
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  return (
    <View>
      <Text style={font.h2}>
        {fixture.home_short} vs {fixture.away_short}
      </Text>

      {/* Scoreline */}
      <Card>
        <View style={{ flexDirection: 'row', gap: spacing(3), alignItems: 'center' }}>
          <ScoreInput label={fixture.home_short} value={homeScore} onChange={setHomeScore} />
          <Text style={[font.h1, { marginTop: spacing(4) }]}>—</Text>
          <ScoreInput label={fixture.away_short} value={awayScore} onChange={setAwayScore} />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing(2) }}>
          <View style={{ flex: 1 }}>
            <Button title="Save as LIVE" variant="secondary" loading={liveMut.isPending}
              onPress={() => liveMut.mutate()} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Final result" loading={finishMut.isPending}
              onPress={() => finishMut.mutate()} />
          </View>
        </View>
      </Card>

      <SectionTitle>{fixture.home_team_name}</SectionTitle>
      {homePlayers.map((p: any) => (
        <PlayerStatRow key={p.id} fixtureId={fixture.id} player={p} />
      ))}

      <SectionTitle>{fixture.away_team_name}</SectionTitle>
      {awayPlayers.map((p: any) => (
        <PlayerStatRow key={p.id} fixtureId={fixture.id} player={p} />
      ))}

      <Button title="← Back to fixtures" variant="ghost" onPress={onDone} />
    </View>
  );
}

function ScoreInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={font.tiny}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        maxLength={2}
        style={styles.scoreInput}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------

function PlayerStatRow({ fixtureId, player }: { fixtureId: string; player: any }) {
  const qc = useQueryClient();
  const [tries, setTries] = useState('0');
  const [assists, setAssists] = useState('0');
  const [convs, setConvs] = useState('0');
  const [pom, setPom] = useState(false);
  const [attended, setAttended] = useState(true);

  const saveMut = useMutation({
    mutationFn: () =>
      adminUpsertStats({
        fixture_id: fixtureId,
        player_id: player.id,
        tries: parseInt(tries || '0', 10),
        assists: parseInt(assists || '0', 10),
        conversions: parseInt(convs || '0', 10),
        player_of_match: pom,
        attended,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['players'] });
      qc.invalidateQueries({ queryKey: ['global-board'] });
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  return (
    <View style={styles.statRow}>
      <Text style={[font.body, { flex: 1 }]} numberOfLines={1}>
        {player.first_name} {player.last_name}
      </Text>
      <MiniCounter label="T" value={tries} onChange={setTries} />
      <MiniCounter label="A" value={assists} onChange={setAssists} />
      <MiniCounter label="C" value={convs} onChange={setConvs} />
      <Pressable onPress={() => setPom((v) => !v)} style={[styles.toggle, pom && styles.toggleOn]}>
        <Text style={styles.toggleText}>⭐</Text>
      </Pressable>
      <Pressable onPress={() => setAttended((v) => !v)} style={[styles.toggle, attended && styles.toggleOn]}>
        <Text style={styles.toggleText}>✓</Text>
      </Pressable>
      <Pressable onPress={() => saveMut.mutate()} style={styles.saveBtn}>
        <Text style={{ color: '#0B3D2E', fontWeight: '800', fontSize: 12 }}>
          {saveMut.isPending ? '…' : saveMut.isSuccess ? '✓' : 'Save'}
        </Text>
      </Pressable>
    </View>
  );
}

function MiniCounter({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ alignItems: 'center', marginRight: spacing(1) }}>
      <Text style={[font.tiny, { fontSize: 9 }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        maxLength={2}
        style={styles.miniInput}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scoreInput: {
    backgroundColor: colors.cardAlt,
    color: colors.accent,
    fontSize: 28,
    fontWeight: '800',
    borderRadius: radius.sm,
    width: 72,
    textAlign: 'center',
    paddingVertical: spacing(2),
    marginTop: spacing(1),
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(2),
    marginBottom: spacing(1.5),
    gap: spacing(1),
  },
  miniInput: {
    backgroundColor: colors.cardAlt,
    color: colors.text,
    borderRadius: 6,
    width: 34,
    textAlign: 'center',
    paddingVertical: 4,
    fontWeight: '700',
  },
  toggle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.5,
  },
  toggleOn: { opacity: 1, backgroundColor: colors.accent },
  toggleText: { fontSize: 13 },
  saveBtn: {
    backgroundColor: colors.accent,
    borderRadius: 6,
    paddingHorizontal: spacing(2),
    paddingVertical: 6,
  },
});
