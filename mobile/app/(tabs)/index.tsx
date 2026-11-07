// Home dashboard — team snapshot, deadline, next fixtures, top scorers.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/store/AuthContext';
import { getMyFantasyTeam, getSquadTotalPoints } from '@/api/fantasy';
import { getCurrentGameweek, getNextFixtures } from '@/api/fixtures';
import { getGlobalLeaderboard } from '@/api/leagues';
import { getPlayers } from '@/api/players';
import { signOut } from '@/api/auth';
import { Card, EmptyState, Screen, SectionTitle } from '@/components/ui';
import { PlayerRow } from '@/components/PlayerRow';
import { colors, font, spacing } from '@/theme';

export default function HomeScreen() {
  const { profile, session } = useAuth();
  const router = useRouter();

  const { data: myTeam } = useQuery({
    queryKey: ['my-team', session?.user.id],
    queryFn: () => getMyFantasyTeam(session!.user.id),
    enabled: !!session,
  });
  const { data: gameweek } = useQuery({ queryKey: ['current-gw'], queryFn: getCurrentGameweek });
  const { data: totalPoints = 0 } = useQuery({
    queryKey: ['my-points', myTeam?.id],
    queryFn: () => getSquadTotalPoints(myTeam!.id),
    enabled: !!myTeam,
  });
  const { data: board = [] } = useQuery({ queryKey: ['global-board'], queryFn: () => getGlobalLeaderboard(100) });
  const { data: nextFixtures = [] } = useQuery({ queryKey: ['next-fixtures'], queryFn: () => getNextFixtures(3) });
  const { data: hotPlayers = [] } = useQuery({
    queryKey: ['hot-players'],
    queryFn: () => getPlayers({ sortBy: 'total_points' }),
    select: (rows) => rows.slice(0, 3),
  });

  const myRank = board.find((r) => r.fantasy_team_id === myTeam?.id)?.rank;
  const deadline = gameweek ? new Date(gameweek.deadline) : null;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <Text style={font.muted}>Welcome back,</Text>
          <Text style={font.h1}>{profile?.display_name ?? 'Manager'}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: spacing(1) }}>
          {profile?.is_admin ? (
            <Pressable onPress={() => router.push('/admin')}>
              <Text style={{ color: colors.accent, fontWeight: '700' }}>🛠 Admin</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => signOut()}>
            <Text style={[font.muted, { textDecorationLine: 'underline' }]}>Sign out</Text>
          </Pressable>
        </View>
      </View>

      {/* Team snapshot */}
      <Card style={{ marginTop: spacing(3) }}>
        {myTeam ? (
          <Pressable onPress={() => router.push('/(tabs)/squad')}>
            <View style={styles.rowBetween}>
              <View>
                <Text style={font.h2}>{myTeam.name}</Text>
                <Text style={font.muted}>
                  {myRank ? `Global rank #${myRank}` : 'Unranked'} · {totalPoints} pts
                </Text>
              </View>
              <Text style={{ fontSize: 32 }}>🏉</Text>
            </View>
            {gameweek && deadline ? (
              <Text style={[font.tiny, { marginTop: spacing(2) }]}>
                {gameweek.name} deadline:{' '}
                {deadline.toLocaleString('en-GB', {
                  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </Text>
            ) : null}
          </Pressable>
        ) : (
          <EmptyState
            emoji="📝"
            title="Create your fantasy team"
            subtitle="Pick 10 players within a £100m budget"
          />
        )}
      </Card>

      {!myTeam ? (
        <Pressable style={styles.cta} onPress={() => router.push('/transfers')}>
          <Text style={styles.ctaText}>Build my squad →</Text>
        </Pressable>
      ) : null}

      {/* Next fixtures */}
      <SectionTitle>Upcoming fixtures</SectionTitle>
      {nextFixtures.length === 0 ? (
        <Text style={font.muted}>No fixtures scheduled yet.</Text>
      ) : (
        nextFixtures.map((f) => (
          <Card key={f.id} style={styles.fixtureCard}>
            <Text style={styles.fixtureTeams}>
              {f.home_short} vs {f.away_short}
            </Text>
            <Text style={font.tiny}>
              {new Date(f.kickoff).toLocaleString('en-GB', {
                weekday: 'short', hour: '2-digit', minute: '2-digit',
              })}
              {f.venue ? ` · ${f.venue}` : ''}
            </Text>
          </Card>
        ))
      )}

      {/* Hot players */}
      <SectionTitle>Top scorers</SectionTitle>
      {hotPlayers.map((p) => (
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
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    padding: spacing(4),
    alignItems: 'center',
  },
  ctaText: { color: '#0B3D2E', fontWeight: '800', fontSize: 16 },
  fixtureCard: { paddingVertical: spacing(3) },
  fixtureTeams: { ...font.h3, marginBottom: 2 },
});
