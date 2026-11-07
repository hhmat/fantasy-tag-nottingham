// Private league table.
import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getPrivateLeagueTable, leavePrivateLeague } from '@/api/leagues';
import { getMyFantasyTeam } from '@/api/fantasy';
import { useAuth } from '@/store/AuthContext';
import { Button, Screen } from '@/components/ui';
import { colors, font, radius, spacing } from '@/theme';

export default function PrivateLeagueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const qc = useQueryClient();

  const { data: myTeam } = useQuery({
    queryKey: ['my-team', session?.user.id],
    queryFn: () => getMyFantasyTeam(session!.user.id),
    enabled: !!session,
  });
  const { data: table = [] } = useQuery({
    queryKey: ['league-table', id],
    queryFn: () => getPrivateLeagueTable(id!),
  });

  const leaveMut = useMutation({
    mutationFn: () => leavePrivateLeague(id!, myTeam!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-leagues'] });
    },
    onError: (e: any) => Alert.alert('Could not leave', e.message),
  });

  return (
    <Screen>
      {table.length === 0 ? (
        <Text style={font.muted}>No members yet — share the league code!</Text>
      ) : (
        table.map((r) => {
          const isMe = r.fantasy_team_id === myTeam?.id;
          return (
            <View key={r.fantasy_team_id} style={[styles.row, isMe && styles.rowMe]}>
              <Text style={styles.rank}>{r.rank}</Text>
              <View style={{ flex: 1 }}>
                <Text style={font.h3}>{r.team_name}</Text>
                <Text style={font.tiny}>{r.manager}</Text>
              </View>
              <Text style={styles.points}>{r.total_points}</Text>
            </View>
          );
        })
      )}
      <Button title="Leave league" variant="danger" onPress={() => leaveMut.mutate()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(3),
    marginBottom: spacing(2),
  },
  rowMe: { borderColor: colors.accent, borderWidth: 2 },
  rank: { color: colors.accent, fontWeight: '800', fontSize: 16, width: 32, textAlign: 'center' },
  points: { color: colors.text, fontWeight: '800', fontSize: 18 },
});
