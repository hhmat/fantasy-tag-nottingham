// Players market — search, filter by team, sort by price/points.
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { getPlayers, getTeams } from '@/api/players';
import { Input, Screen } from '@/components/ui';
import { PlayerRow } from '@/components/PlayerRow';
import { colors, font, radius, spacing } from '@/theme';
import type { Team } from '@/types';

type SortKey = 'total_points' | 'price' | 'last_name';
type TeamFilter = Pick<Team, 'name' | 'short_name'> & { id: string | null };

export default function PlayersScreen() {
  const router = useRouter();
  const teamListRef = useRef<FlatList<TeamFilter>>(null);
  const [search, setSearch] = useState('');
  const [teamId, setTeamId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('total_points');

  const { data: teams = [] } = useQuery({ queryKey: ['teams'], queryFn: getTeams });
  const teamFilters: TeamFilter[] = [{ id: null, name: 'All', short_name: 'ALL' }, ...teams];
  const selectedTeamIndex = teamFilters.findIndex((t) => t.id === teamId);

  const goToTeam = (index: number) => {
    if (index < 0 || index >= teamFilters.length) return;
    setTeamId(teamFilters[index].id);
  };

  useEffect(() => {
    if (selectedTeamIndex < 0) return;
    const frame = requestAnimationFrame(() => {
      teamListRef.current?.scrollToIndex({ index: selectedTeamIndex, animated: true, viewPosition: 0.5 });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedTeamIndex]);

  const { data: players = [], isLoading } = useQuery({
    queryKey: ['players', search, teamId, sortBy],
    queryFn: () => getPlayers({ search: search || undefined, teamId: teamId ?? undefined, sortBy }),
  });

  return (
    <Screen scroll={false}>
      <View style={{ padding: spacing(4), paddingBottom: 0, flex: 1 }}>
        <Input placeholder="Search players…" value={search} onChangeText={setSearch} />

        {/* Team filter chips */}
        <View style={styles.teamFilterPicker}>
          <Pressable
            onPress={() => goToTeam(selectedTeamIndex - 1)}
            disabled={selectedTeamIndex <= 0}
            style={({ pressed }) => [
              styles.arrowButton,
              styles.previousButton,
              selectedTeamIndex <= 0 && styles.arrowButtonDisabled,
              pressed && styles.arrowButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Previous team"
            accessibilityState={{ disabled: selectedTeamIndex <= 0 }}
          >
            <Text style={styles.arrowText}>‹</Text>
          </Pressable>

          <FlatList
            ref={teamListRef}
            horizontal
            data={teamFilters}
            keyExtractor={(t) => t.id ?? 'all'}
            initialNumToRender={13}
            showsHorizontalScrollIndicator={false}
            style={styles.teamFilterList}
            contentContainerStyle={styles.teamFilterContent}
            onScrollToIndexFailed={({ index, averageItemLength }) => {
              teamListRef.current?.scrollToOffset({
                offset: Math.max(0, index * (averageItemLength || 140) - 120),
                animated: true,
              });
            }}
            renderItem={({ item: t, index }) => (
              <Pressable
                onPress={() => goToTeam(index)}
                style={[styles.chip, teamId === t.id && styles.chipActive]}
                accessibilityRole="tab"
                accessibilityLabel={t.id ? `Filter by ${t.name}` : 'Show all teams'}
                accessibilityState={{ selected: teamId === t.id }}
                aria-selected={teamId === t.id}
              >
                <Text style={[styles.chipText, teamId === t.id && { color: '#0B3D2E' }]}>
                  {t.id ? t.name : 'All'}
                </Text>
              </Pressable>
            )}
          />

          <Pressable
            onPress={() => goToTeam(selectedTeamIndex + 1)}
            disabled={selectedTeamIndex < 0 || selectedTeamIndex >= teamFilters.length - 1}
            style={({ pressed }) => [
              styles.arrowButton,
              styles.nextButton,
              (selectedTeamIndex < 0 || selectedTeamIndex >= teamFilters.length - 1) && styles.arrowButtonDisabled,
              pressed && styles.arrowButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Next team"
            accessibilityState={{ disabled: selectedTeamIndex < 0 || selectedTeamIndex >= teamFilters.length - 1 }}
          >
            <Text style={styles.arrowText}>›</Text>
          </Pressable>
        </View>

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
          renderItem={({ item: p, index }) => (
            <PlayerRow
              name={`${p.first_name} ${p.last_name}`}
              teamShort={p.team_short}
              teamName={p.team_name}
              position={p.position}
              price={p.price}
              points={p.total_points}
              listNumber={index + 1}
              onPress={() => router.push(`/player/${p.player_id}`)}
            />
          )}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  teamFilterPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    marginBottom: spacing(2),
  },
  teamFilterList: { flexGrow: 0, flexShrink: 1 },
  teamFilterContent: { alignItems: 'center' },
  arrowButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previousButton: { marginRight: spacing(1) },
  nextButton: { marginLeft: spacing(1) },
  arrowButtonDisabled: { opacity: 0.35 },
  arrowButtonPressed: { opacity: 0.7 },
  arrowText: { color: colors.text, fontSize: 30, lineHeight: 32, marginTop: -2 },
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
