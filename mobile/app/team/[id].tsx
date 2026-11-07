// Real team profile — roster with prices and season points.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { getPlayers, getTeam } from '@/api/players';
import { Screen } from '@/components/ui';
import { PlayerRow } from '@/components/PlayerRow';
import { colors, font, spacing } from '@/theme';

export default function TeamProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: team } = useQuery({ queryKey: ['team', id], queryFn: () => getTeam(id!) });
  const { data: roster = [] } = useQuery({
    queryKey: ['team-roster', id],
    queryFn: () => getPlayers({ teamId: id, sortBy: 'total_points' }),
  });

  if (!team) return <Screen>{null}</Screen>;

  return (
    <Screen>
      <View style={[styles.header, { backgroundColor: team.primary_color }]}>
        <Text style={styles.short}>{team.short_name}</Text>
        <Text style={[font.h1, { marginTop: spacing(1) }]}>{team.name}</Text>
        <Text style={[font.muted, { color: team.secondary_color }]}>
          {roster.length} players
        </Text>
      </View>

      {roster.map((p) => (
        <PlayerRow
          key={p.player_id}
          name={`${p.first_name} ${p.last_name}`}
          teamShort={p.team_short}
          position={p.position}
          price={p.price}
          points={p.total_points}
          onPress={() => router.push(`/player/${p.player_id}`)}
        />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    borderRadius: 12,
    padding: spacing(5),
    marginBottom: spacing(4),
  },
  short: {
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 2,
  },
});
