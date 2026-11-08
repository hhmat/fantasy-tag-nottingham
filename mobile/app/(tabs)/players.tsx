// Players market — search, filter by team, sort by price/points.
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { getPlayers, getTeams } from '@/api/players';
import { Input, Screen } from '@/components/ui';
import { PlayerRow } from '@/components/PlayerRow';
import { colors, font, radius, spacing } from '@/theme';

type SortKey = 'total_points' | 'price' | 'last_name';

export default function PlayersScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [teamId, setTeamId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('total_points');

  const { data: teams = [] } = useQuery({ queryKey: ['teams'], queryFn: getTeams });
  const { data: players = [], isLoading } = useQuery({
    queryKey: ['players', search, teamId, sortBy],
    queryFn: () => getPlayers({ search: search || undefined, teamId: teamId ?? undefined, sortBy }),
  });

  return (
    <Screen scroll={false}>
      <View style={{ padding: spacing(4), paddingBottom: 0, flex: 1 }}>
        <Input placeholder="Search players…" value={search} onChangeText={setSearch} />

        {/* Team filter chips */}
        <FlatList
          horizontal
          data={[{ id: null, short_name: 'ALL' } as any, ...teams]}
          keyExtractor={(t) => t.id ?? 'all'}
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, marginBottom: spacing(2) }}
          renderItem={({ item: t }) => (
            <Pressable
              onPress={() => setTeamId(t.id)}
              style={[styles.chip, teamId === t.id && styles.chipActive]}
              accessibilityRole="tab"
              accessibilityLabel={t.id ? `Filter by ${t.short_name}` : 'Show all teams'}
              accessibilityState={{ selected: teamId === t.id }}
            >
              <Text style={[styles.chipText, teamId === t.id && { color: '#0B3D2E' }]}>
                {t.short_name}
              </Text>
            </Pressable>
          )}
        />

        {/* Sort chips */}
        <View style={{ flexDirection: 'row', gap: spacing(2), marginBottom: spacing(2) }}>
          {([
            ['total_points', 'Points'],
            ['price', 'Price'],
            ['last_name', 'Name'],
          ] as [SortKey, string][]).map(([key, label]) => (
            <Pressable
              key={key}
              onPress={() => setSortBy(key)}
              style={[styles.chip, sortBy === key && styles.chipActive]}
              accessibilityRole="tab"
              accessibilityLabel={`Sort players by ${label}`}
              accessibilityState={{ selected: sortBy === key }}
            >
              <Text style={[styles.chipText, sortBy === key && { color: '#0B3D2E' }]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <FlatList
          data={players}
          keyExtractor={(p) => p.player_id}
          refreshing={isLoading}
          initialNumToRender={20}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Text style={[font.muted, { textAlign: 'center', marginTop: 40 }]}>No players found.</Text>}
          renderItem={({ item: p }) => (
            <PlayerRow
              name={`${p.first_name} ${p.last_name}`}
              teamShort={p.team_short}
              position={p.position}
              price={p.price}
              points={p.total_points}
              onPress={() => router.push(`/player/${p.player_id}`)}
            />
          )}
        />
      </View>
    </Screen>
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
});
