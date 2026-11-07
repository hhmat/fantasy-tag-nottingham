// Leagues — global / weekly / private leaderboards, create & join leagues.
import React, { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/store/AuthContext';
import {
  createPrivateLeague,
  getGlobalLeaderboard,
  getMyPrivateLeagues,
  getWeeklyLeaderboard,
  joinPrivateLeagueByCode,
} from '@/api/leagues';
import { getMyFantasyTeam } from '@/api/fantasy';
import { getCurrentGameweek } from '@/api/fixtures';
import { Button, Card, Input, Screen, SectionTitle } from '@/components/ui';
import { colors, font, radius, spacing } from '@/theme';

type Mode = 'global' | 'weekly' | 'private';

export default function LeaguesScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>('global');
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [leagueName, setLeagueName] = useState('');
  const [joinCode, setJoinCode] = useState('');

  const { data: myTeam } = useQuery({
    queryKey: ['my-team', session?.user.id],
    queryFn: () => getMyFantasyTeam(session!.user.id),
    enabled: !!session,
  });
  const { data: currentGw } = useQuery({ queryKey: ['current-gw'], queryFn: getCurrentGameweek });
  const { data: global = [] } = useQuery({
    queryKey: ['global-board'],
    queryFn: () => getGlobalLeaderboard(100),
    enabled: mode === 'global',
  });
  const { data: weekly = [] } = useQuery({
    queryKey: ['weekly-board', currentGw?.id],
    queryFn: () => getWeeklyLeaderboard(currentGw!.id),
    enabled: mode === 'weekly' && !!currentGw,
  });
  const { data: myLeagues = [] } = useQuery({
    queryKey: ['my-leagues', myTeam?.id],
    queryFn: () => getMyPrivateLeagues(myTeam!.id),
    enabled: !!myTeam,
  });

  const createMut = useMutation({
    mutationFn: () => createPrivateLeague(leagueName.trim(), session!.user.id, myTeam!.id),
    onSuccess: (league) => {
      setShowCreate(false);
      setLeagueName('');
      qc.invalidateQueries({ queryKey: ['my-leagues'] });
      Alert.alert('League created', `Share code: ${league.code}`);
    },
    onError: (e: any) => Alert.alert('Could not create league', e.message),
  });

  const joinMut = useMutation({
    mutationFn: () => joinPrivateLeagueByCode(joinCode, myTeam!.id),
    onSuccess: () => {
      setShowJoin(false);
      setJoinCode('');
      qc.invalidateQueries({ queryKey: ['my-leagues'] });
      Alert.alert('Joined!', 'Welcome to the league.');
    },
    onError: (e: any) => Alert.alert('Could not join', e.message),
  });

  const rows = mode === 'global' ? global : mode === 'weekly' ? weekly : [];

  return (
    <Screen scroll={false}>
      <View style={{ padding: spacing(4), paddingBottom: 0, flex: 1 }}>
        {/* Mode chips */}
        <View style={{ flexDirection: 'row', gap: spacing(2), marginBottom: spacing(3) }}>
          {(['global', 'weekly', 'private'] as Mode[]).map((m) => (
            <Pressable key={m} onPress={() => setMode(m)} style={[styles.chip, mode === m && styles.chipActive]}>
              <Text style={[styles.chipText, mode === m && { color: '#0B3D2E' }]}>
                {m === 'global' ? '🌍 Global' : m === 'weekly' ? '📅 Weekly' : '🔒 Private'}
              </Text>
            </Pressable>
          ))}
        </View>

        {mode === 'private' ? (
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', gap: spacing(2) }}>
              <View style={{ flex: 1 }}>
                <Button title="Create league" variant="secondary" onPress={() => { setShowCreate((v) => !v); setShowJoin(false); }} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Join with code" variant="ghost" onPress={() => { setShowJoin((v) => !v); setShowCreate(false); }} />
              </View>
            </View>

            {showCreate ? (
              <Card>
                <Input label="LEAGUE NAME" value={leagueName} onChangeText={setLeagueName} placeholder="Workmates League" />
                <Button title="Create" loading={createMut.isPending}
                  onPress={() => (myTeam ? createMut.mutate() : Alert.alert('Create a fantasy team first'))} />
              </Card>
            ) : null}
            {showJoin ? (
              <Card>
                <Input label="LEAGUE CODE" value={joinCode} onChangeText={setJoinCode}
                  autoCapitalize="characters" placeholder="ABC123" maxLength={6} />
                <Button title="Join" loading={joinMut.isPending}
                  onPress={() => (myTeam ? joinMut.mutate() : Alert.alert('Create a fantasy team first'))} />
              </Card>
            ) : null}

            <FlatList
              data={myLeagues}
              keyExtractor={(l) => l.id}
              style={{ marginTop: spacing(3) }}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <Text style={[font.muted, { textAlign: 'center', marginTop: 40 }]}>
                  You haven't joined any private leagues yet.
                </Text>
              }
              renderItem={({ item: l }) => (
                <Pressable onPress={() => router.push(`/league/${l.id}`)}>
                  <Card>
                    <Text style={font.h3}>{l.name}</Text>
                    <Text style={font.tiny}>Code: {l.code}</Text>
                  </Card>
                </Pressable>
              )}
            />
          </View>
        ) : (
          <>
            {mode === 'weekly' && currentGw ? (
              <SectionTitle>{currentGw.name}</SectionTitle>
            ) : null}
            <FlatList
              data={rows}
              keyExtractor={(r: any) => r.fantasy_team_id}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <Text style={[font.muted, { textAlign: 'center', marginTop: 40 }]}>
                  No points on the board yet.
                </Text>
              }
              renderItem={({ item: r, index }: { item: any; index: number }) => {
                const isMe = r.fantasy_team_id === myTeam?.id;
                return (
                  <View style={[styles.boardRow, isMe && styles.boardRowMe]}>
                    <Text style={styles.rank}>{r.rank ?? index + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={font.h3} numberOfLines={1}>{r.team_name}</Text>
                      <Text style={font.tiny}>{r.manager}</Text>
                    </View>
                    <Text style={styles.points}>{r.total_points ?? r.points}</Text>
                  </View>
                );
              }}
            />
          </>
        )}
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
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  boardRow: {
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
  boardRowMe: { borderColor: colors.accent, borderWidth: 2 },
  rank: { color: colors.accent, fontWeight: '800', fontSize: 16, width: 32, textAlign: 'center' },
  points: { color: colors.text, fontWeight: '800', fontSize: 18 },
});
