// Admin — create fixtures and flip matches to live.
import React, { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getTeams } from '@/api/players';
import {
  adminCreateFixture,
  adminSetFixtureStatus,
  getCurrentGameweek,
  getFixtures,
  getGameweeks,
} from '@/api/fixtures';
import { Badge, Button, Card, Input, Screen, SectionTitle } from '@/components/ui';
import { colors, font, radius, spacing } from '@/theme';

export default function AdminFixturesScreen() {
  const qc = useQueryClient();
  const { data: teams = [] } = useQuery({ queryKey: ['teams'], queryFn: getTeams });
  const { data: gameweeks = [] } = useQuery({ queryKey: ['gameweeks'], queryFn: getGameweeks });
  const { data: currentGw } = useQuery({ queryKey: ['current-gw'], queryFn: getCurrentGameweek });

  const [gwId, setGwId] = useState<number | null>(null);
  const [homeId, setHomeId] = useState<string | null>(null);
  const [awayId, setAwayId] = useState<string | null>(null);
  const [date, setDate] = useState('');   // YYYY-MM-DD
  const [time, setTime] = useState('19:30');
  const [venue, setVenue] = useState('');

  const { data: fixtures = [] } = useQuery({
    queryKey: ['fixtures', currentGw?.id],
    queryFn: () => getFixtures(currentGw!.id),
    enabled: !!currentGw,
  });

  const createMut = useMutation({
    mutationFn: () =>
      adminCreateFixture({
        gameweek_id: gwId!,
        home_team_id: homeId!,
        away_team_id: awayId!,
        kickoff: new Date(`${date}T${time}:00`).toISOString(),
        venue: venue.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fixtures'] });
      Alert.alert('Fixture created');
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'live' | 'postponed' }) =>
      adminSetFixtureStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fixtures'] }),
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  return (
    <Screen>
      <SectionTitle>Create fixture</SectionTitle>
      <Card>
        <Text style={font.tiny}>GAMEWEEK</Text>
        <FlatList horizontal data={gameweeks} keyExtractor={(g) => String(g.id)}
          showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginVertical: spacing(2) }}
          renderItem={({ item: g }) => (
            <Pressable
              onPress={() => setGwId(g.id)}
              style={[styles.chip, gwId === g.id && styles.chipActive]}
              accessibilityRole="tab"
              accessibilityLabel={`Create fixture in gameweek ${g.id}`}
              accessibilityState={{ selected: gwId === g.id }}
            >
              <Text style={[styles.chipText, gwId === g.id && { color: '#0B3D2E' }]}>GW{g.id}</Text>
            </Pressable>
          )} />

        <Text style={font.tiny}>HOME</Text>
        <TeamPicker teams={teams} selected={homeId} other={awayId} onSelect={setHomeId} />
        <Text style={font.tiny}>AWAY</Text>
        <TeamPicker teams={teams} selected={awayId} other={homeId} onSelect={setAwayId} />

        <Input label="DATE (YYYY-MM-DD)" value={date} onChangeText={setDate} placeholder="2026-02-17" />
        <Input label="KICK-OFF (HH:MM)" value={time} onChangeText={setTime} placeholder="19:30" />
        <Input label="VENUE (optional)" value={venue} onChangeText={setVenue} placeholder="The Forest Rec" />
        <Button title="Create fixture" loading={createMut.isPending}
          onPress={() => {
            if (!gwId || !homeId || !awayId || homeId === awayId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
              return Alert.alert('Check the form', 'Gameweek, two different teams and a valid date are required.');
            }
            createMut.mutate();
          }} />
      </Card>

      <SectionTitle>Current gameweek fixtures</SectionTitle>
      {fixtures.map((f) => (
        <Card key={f.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={font.h3}>
              {f.home_short} vs {f.away_short}
            </Text>
            <Badge
              text={f.status.toUpperCase()}
              color={f.status === 'live' ? colors.danger : f.status === 'finished' ? colors.textMuted : colors.accent}
            />
          </View>
          {f.status === 'scheduled' ? (
            <View style={{ flexDirection: 'row', gap: spacing(2) }}>
              <View style={{ flex: 1 }}>
                <Button title="Set LIVE" variant="secondary"
                  onPress={() => statusMut.mutate({ id: f.id, status: 'live' })} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Postpone" variant="ghost"
                  onPress={() => statusMut.mutate({ id: f.id, status: 'postponed' })} />
              </View>
            </View>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}

function TeamPicker({ teams, selected, other, onSelect }: {
  teams: { id: string; short_name: string }[];
  selected: string | null;
  other: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <FlatList horizontal data={teams.filter((t) => t.id !== other)} keyExtractor={(t) => t.id}
      showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginVertical: spacing(2) }}
      renderItem={({ item: t }) => (
        <Pressable
          onPress={() => onSelect(t.id)}
          style={[styles.chip, selected === t.id && styles.chipActive]}
          accessibilityRole="tab"
          accessibilityLabel={`Select ${t.short_name}`}
          accessibilityState={{ selected: selected === t.id }}
        >
          <Text style={[styles.chipText, selected === t.id && { color: '#0B3D2E' }]}>{t.short_name}</Text>
        </Pressable>
      )} />
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: colors.cardAlt,
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
});
