// Admin — add players (with team picker) and add teams.
import React, { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminAddPlayer, adminAddTeam, getTeams } from '@/api/players';
import { Button, Card, Input, Screen, SectionTitle } from '@/components/ui';
import { colors, font, radius, spacing } from '@/theme';
import type { Position } from '@/types';

const POSITIONS: Position[] = ['Forward', 'Back', 'Utility'];

export default function AdminPlayersScreen() {
  const qc = useQueryClient();
  const { data: teams = [] } = useQuery({ queryKey: ['teams'], queryFn: getTeams });

  // Player form
  const [teamId, setTeamId] = useState<string | null>(null);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [position, setPosition] = useState<Position>('Utility');
  const [price, setPrice] = useState('6.0');

  // Team form
  const [teamName, setTeamName] = useState('');
  const [teamShort, setTeamShort] = useState('');

  const addPlayerMut = useMutation({
    mutationFn: () =>
      adminAddPlayer({
        team_id: teamId!,
        first_name: first.trim(),
        last_name: last.trim(),
        position,
        price: parseFloat(price),
      }),
    onSuccess: () => {
      setFirst(''); setLast('');
      qc.invalidateQueries({ queryKey: ['players'] });
      Alert.alert('Player added');
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const addTeamMut = useMutation({
    mutationFn: () =>
      adminAddTeam({
        name: teamName.trim(),
        short_name: teamShort.trim().toUpperCase(),
        primary_color: '#1E88E5',
        secondary_color: '#FFFFFF',
      }),
    onSuccess: () => {
      setTeamName(''); setTeamShort('');
      qc.invalidateQueries({ queryKey: ['teams'] });
      Alert.alert('Team added');
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  return (
    <Screen>
      <SectionTitle>Add player</SectionTitle>
      <Card>
        <Text style={font.tiny}>TEAM</Text>
        <FlatList
          horizontal
          data={teams}
          keyExtractor={(t) => t.id}
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, marginVertical: spacing(2) }}
          renderItem={({ item: t }) => (
            <Pressable onPress={() => setTeamId(t.id)} style={[styles.chip, teamId === t.id && styles.chipActive]}>
              <Text style={[styles.chipText, teamId === t.id && { color: '#0B3D2E' }]}>{t.short_name}</Text>
            </Pressable>
          )}
        />
        <Input label="FIRST NAME" value={first} onChangeText={setFirst} />
        <Input label="LAST NAME" value={last} onChangeText={setLast} />
        <Text style={font.tiny}>POSITION</Text>
        <View style={{ flexDirection: 'row', gap: spacing(2), marginVertical: spacing(2) }}>
          {POSITIONS.map((p) => (
            <Pressable key={p} onPress={() => setPosition(p)} style={[styles.chip, position === p && styles.chipActive]}>
              <Text style={[styles.chipText, position === p && { color: '#0B3D2E' }]}>{p}</Text>
            </Pressable>
          ))}
        </View>
        <Input label="PRICE (£m)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
        <Button
          title="Add player"
          loading={addPlayerMut.isPending}
          onPress={() => {
            const p = parseFloat(price);
            if (!teamId || !first.trim() || !last.trim() || isNaN(p) || p < 3 || p > 15) {
              return Alert.alert('Check the form', 'Team, name and a price between 3.0 and 15.0 are required.');
            }
            addPlayerMut.mutate();
          }}
        />
      </Card>

      <SectionTitle>Add team</SectionTitle>
      <Card>
        <Input label="TEAM NAME" value={teamName} onChangeText={setTeamName} placeholder="Clifton Colts" />
        <Input label="SHORT NAME (3 letters)" value={teamShort} onChangeText={setTeamShort}
          autoCapitalize="characters" maxLength={3} placeholder="CLI" />
        <Button title="Add team" variant="secondary" loading={addTeamMut.isPending}
          onPress={() => {
            if (teamName.trim().length < 2 || teamShort.trim().length !== 3) {
              return Alert.alert('Name + 3-letter short code required.');
            }
            addTeamMut.mutate();
          }} />
      </Card>
    </Screen>
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
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontWeight: '700', fontSize: 12 },
});
