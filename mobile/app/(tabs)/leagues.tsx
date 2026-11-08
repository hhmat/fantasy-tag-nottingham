// Leagues — global / weekly / private leaderboards with rank movement.
import React, { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/store/AuthContext';
import {
  createPrivateLeague,
  getGlobalLeaderboard,
  getMyPrivateLeagues,
  getPrivateLeagueTable,
  getWeeklyLeaderboard,
  joinPrivateLeagueByCode,
} from '@/api/leagues';
import { getMyFantasyTeam } from '@/api/fantasy';
import { getLastFinishedGameweek, getOpenGameweek } from '@/api/fixtures';
import { RankBadge } from '@/components/fantasy';
import { Button, Card, Input, Screen, SectionTitle } from '@/components/ui';
import { colors, font, radius, spacing } from '@/theme';
import type { LeaderboardRow, PrivateLeague, WeeklyRow } from '@/types';

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
  const { data: currentGw } = useQuery({ queryKey: ['open-gw'], queryFn: getOpenGameweek });
  const { data: lastGw } = useQuery({ queryKey: ['last-gw'], queryFn: getLastFinishedGameweek });
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
  const { data: lastGwRows = [] } = useQuery({
    queryKey: ['weekly-board', lastGw?.id],
    queryFn: () => getWeeklyLeaderboard(lastGw!.id),
    enabled: !!lastGw,
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
  const globalMovement = rankMovements(global, lastGwRows);

  return (
    <Screen scroll={false}>
      <View style={styles.content}>
        <View style={styles.modeRow}>
          {(['global', 'weekly', 'private'] as Mode[]).map((m) => {
            const label = m === 'global' ? '🌍 Global' : m === 'weekly' ? '📅 Weekly' : '🔒 Private';
            return (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                style={[styles.chip, mode === m && styles.chipActive]}
                accessibilityRole="tab"
                accessibilityLabel={`${m} leaderboard`}
                accessibilityState={{ selected: mode === m }}
              >
                <Text style={[styles.chipText, mode === m && { color: '#0B3D2E' }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {mode === 'private' ? (
          <View style={styles.flex}>
            <View style={styles.actionRow}>
              <View style={styles.flex}>
                <Button title="Create league" variant="secondary" onPress={() => { setShowCreate((v) => !v); setShowJoin(false); }} />
              </View>
              <View style={styles.flex}>
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
              style={styles.leagueList}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  You haven't joined any private leagues yet.
                </Text>
              }
              renderItem={({ item }) => (
                <PrivateLeagueCard
                  league={item}
                  myTeamId={myTeam!.id}
                  lastGwRows={lastGwRows}
                  onPress={() => router.push(`/league/${item.id}`)}
                />
              )}
            />
          </View>
        ) : (
          <>
            {mode === 'weekly' && currentGw ? <SectionTitle>{currentGw.name}</SectionTitle> : null}
            <FlatList
              data={rows}
              keyExtractor={(r: any) => r.fantasy_team_id}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={<Text style={styles.emptyText}>No points on the board yet.</Text>}
              renderItem={({ item: r, index }: { item: any; index: number }) => {
                const isMe = r.fantasy_team_id === myTeam?.id;
                const rank = r.rank ?? index + 1;
                const movement = mode === 'global' ? globalMovement.get(r.fantasy_team_id) : null;
                const points = r.total_points ?? r.points ?? 0;
                return (
                  <View
                    style={[styles.boardRow, isMe && styles.boardRowMe]}
                    accessible
                    accessibilityLabel={`${r.team_name}, ${r.manager}, rank ${rank}${movement ? `, ${movement > 0 ? 'up' : 'down'} ${Math.abs(movement)} places` : ''}, ${points} points${isMe ? ', your team' : ''}`}
                  >
                    <View style={styles.rankSlot}>
                      <RankBadge rank={rank} movement={movement} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={font.h3} numberOfLines={1}>{r.team_name}</Text>
                      <Text style={font.tiny}>{r.manager}</Text>
                    </View>
                    <Text style={styles.points}>{points}</Text>
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

function PrivateLeagueCard({ league, myTeamId, lastGwRows, onPress }: {
  league: PrivateLeague;
  myTeamId: string;
  lastGwRows: WeeklyRow[];
  onPress: () => void;
}) {
  const { data: table = [] } = useQuery({
    queryKey: ['league-table', league.id],
    queryFn: () => getPrivateLeagueTable(league.id),
  });
  const myRow = table.find((r) => r.fantasy_team_id === myTeamId);
  const movement = myRow ? rankMovements(table, lastGwRows).get(myTeamId) : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => pressed && { opacity: 0.7 }}
      accessibilityRole="button"
      accessibilityLabel={`Open ${league.name}. ${myRow ? `Your rank is ${myRow.rank} of ${table.length}` : 'Unranked'}. Invite code ${league.code}`}
    >
      <Card>
        <View style={styles.privateRow}>
          <View style={styles.flex}>
            <Text style={font.h3}>{league.name}</Text>
            <Text style={font.tiny}>{table.length || 'No'} manager{table.length === 1 ? '' : 's'} · Code: {league.code}</Text>
          </View>
          <RankBadge rank={myRow?.rank} movement={movement} />
        </View>
      </Card>
    </Pressable>
  );
}

/** Current overall rank minus each team's rank before the last finished GW. */
function rankMovements(rows: LeaderboardRow[], lastGwRows: WeeklyRow[]) {
  const movements = new Map<string, number | null>();
  if (!lastGwRows.length) {
    rows.forEach((r) => movements.set(r.fantasy_team_id, null));
    return movements;
  }
  const lastByTeam = new Map(lastGwRows.map((r) => [r.fantasy_team_id, r.points]));
  const previous = rows
    .map((r) => ({
      id: r.fantasy_team_id,
      points: r.total_points - (lastByTeam.get(r.fantasy_team_id) ?? 0),
    }))
    .sort((a, b) => b.points - a.points);
  rows.forEach((r) => {
    const previousRank = previous.findIndex((p) => p.id === r.fantasy_team_id) + 1;
    movements.set(r.fantasy_team_id, previousRank > 0 ? previousRank - r.rank : null);
  });
  return movements;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing(4), paddingBottom: 0, flex: 1 },
  modeRow: { flexDirection: 'row', gap: spacing(2), marginBottom: spacing(3) },
  actionRow: { flexDirection: 'row', gap: spacing(2) },
  leagueList: { marginTop: spacing(3) },
  privateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  emptyText: { ...font.muted, textAlign: 'center', marginTop: 40 },
  chip: {
    backgroundColor: colors.card,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
    minHeight: 44,
    justifyContent: 'center',
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
    minHeight: 64,
  },
  boardRowMe: { borderColor: colors.accent, borderWidth: 2 },
  rankSlot: { minWidth: 64 },
  points: { color: colors.text, fontWeight: '800', fontSize: 18 },
});
