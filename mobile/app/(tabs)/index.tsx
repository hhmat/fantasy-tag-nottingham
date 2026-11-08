// Home — the Gameweek Hub: deadline hero, team snapshot with rank movement,
// live strip, upcoming fixtures, hot players. (UX redesign step 2.2)
import React, { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/store/AuthContext';
import { getMyFantasyTeam, getSquadGameweekPoints, getSquadTotalPoints } from '@/api/fantasy';
import {
  getLastFinishedGameweek,
  getLiveFixtures,
  getNextFixtures,
  getOpenGameweek,
  getPriceChanges,
  subscribeToLiveScores,
} from '@/api/fixtures';
import { getGlobalLeaderboard, getWeeklyLeaderboard } from '@/api/leagues';
import { getPlayers } from '@/api/players';
import { signOut } from '@/api/auth';
import { Badge, Card, EmptyState, Screen, SectionTitle } from '@/components/ui';
import { DeadlineChip, PriceArrow, RankBadge } from '@/components/fantasy';
import { PlayerRow } from '@/components/PlayerRow';
import { Avatar } from '@/components/ProfileImage';
import { colors, font, spacing } from '@/theme';

export default function HomeScreen() {
  const { profile, session } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: myTeam } = useQuery({
    queryKey: ['my-team', session?.user.id],
    queryFn: () => getMyFantasyTeam(session!.user.id),
    enabled: !!session,
  });
  const { data: gameweek } = useQuery({ queryKey: ['open-gw'], queryFn: getOpenGameweek });
  const { data: lastGw } = useQuery({ queryKey: ['last-gw'], queryFn: getLastFinishedGameweek });
  const { data: totalPoints = 0 } = useQuery({
    queryKey: ['my-points', myTeam?.id],
    queryFn: () => getSquadTotalPoints(myTeam!.id),
    enabled: !!myTeam,
  });
  const { data: myGwPoints } = useQuery({
    queryKey: ['my-gw-points', myTeam?.id, lastGw?.id],
    queryFn: () => getSquadGameweekPoints(myTeam!.id, lastGw!.id),
    enabled: !!myTeam && !!lastGw,
  });
  const { data: board = [] } = useQuery({ queryKey: ['global-board'], queryFn: () => getGlobalLeaderboard(100) });
  const { data: lastGwRows = [] } = useQuery({
    queryKey: ['weekly-board', lastGw?.id],
    queryFn: () => getWeeklyLeaderboard(lastGw!.id),
    enabled: !!lastGw,
  });
  const { data: liveFixtures = [] } = useQuery({ queryKey: ['live-fixtures'], queryFn: getLiveFixtures });
  const { data: nextFixtures = [] } = useQuery({ queryKey: ['next-fixtures'], queryFn: () => getNextFixtures(3) });
  const { data: priceChanges = {} } = useQuery({
    queryKey: ['price-changes', lastGw?.id],
    queryFn: () => getPriceChanges(lastGw!.id),
    enabled: !!lastGw,
  });
  const { data: hotPlayers = [] } = useQuery({
    queryKey: ['hot-players'],
    queryFn: () => getPlayers({ sortBy: 'total_points' }),
    select: (rows) => rows.slice(0, 3),
  });

  // Realtime: refresh the live strip as scores come in.
  useEffect(() => {
    if (gameweek?.id == null) return;
    return subscribeToLiveScores(gameweek.id, () => {
      qc.invalidateQueries({ queryKey: ['live-fixtures'] });
      qc.invalidateQueries({ queryKey: ['next-fixtures'] });
    });
  }, [gameweek?.id]);

  const myRow = board.find((r) => r.fantasy_team_id === myTeam?.id);

  // Rank movement = current rank vs rank computed without the last finished GW.
  const movement = useMemo(() => {
    if (!myRow || lastGwRows.length === 0) return null;
    const lastByTeam = new Map(lastGwRows.map((r) => [r.fantasy_team_id, r.points]));
    const prev = board
      .map((r) => ({
        id: r.fantasy_team_id,
        pts: r.total_points - (lastByTeam.get(r.fantasy_team_id) ?? 0),
      }))
      .sort((a, b) => b.pts - a.pts);
    const prevRank = prev.findIndex((p) => p.id === myRow.fantasy_team_id) + 1;
    return prevRank > 0 ? prevRank - myRow.rank : null;
  }, [board, lastGwRows, myRow]);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Pressable
          onPress={() => router.push('/profile')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(2), flex: 1, minHeight: 56 }}
          accessibilityRole="button"
          accessibilityLabel="Edit manager and team profile"
        >
          <Avatar value={profile?.avatar_url} name={profile?.display_name ?? 'Manager'} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={font.muted}>Welcome back,</Text>
            <Text style={font.h1} numberOfLines={1}>{profile?.display_name ?? 'Manager'}</Text>
          </View>
        </Pressable>
        <View style={{ alignItems: 'flex-end', gap: spacing(1) }}>
          {profile?.is_admin ? (
            <Pressable
              onPress={() => router.push('/admin')}
              style={styles.headerAction}
              accessibilityRole="button"
              accessibilityLabel="Open admin dashboard"
            >
              <Text style={{ color: colors.accent, fontWeight: '700' }}>🛠 Admin</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => signOut()}
            style={styles.headerAction}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            <Text style={[font.muted, { textDecorationLine: 'underline' }]}>Sign out</Text>
          </Pressable>
        </View>
      </View>

      {/* Gameweek hero */}
      {gameweek ? (
        <Card style={styles.heroCard}>
          <View style={styles.rowBetween}>
            <View>
              <Text style={font.h2}>{gameweek.name}</Text>
              <Text style={font.tiny}>
                Deadline{' '}
                {new Date(gameweek.deadline).toLocaleString('en-GB', {
                  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </Text>
            </View>
            <DeadlineChip deadline={gameweek.deadline} />
          </View>
        </Card>
      ) : null}

      {/* Team snapshot */}
      <Card>
        {myTeam ? (
          <Pressable
            onPress={() => router.push('/(tabs)/squad')}
            accessibilityRole="button"
            accessibilityLabel={`Open my squad, ${myTeam.name}, ${totalPoints} points${myRow ? `, rank ${myRow.rank}` : ''}`}
          >
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={font.h2}>{myTeam.name}</Text>
                <View style={{ marginTop: 2 }}>
                  <RankBadge rank={myRow?.rank} movement={movement} />
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={font.hero}>{totalPoints}</Text>
                <Text style={font.tiny}>
                  {lastGw && myGwPoints != null ? `GW${lastGw.id}: ${myGwPoints} pts` : 'total pts'}
                </Text>
              </View>
            </View>
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
        <Pressable
          style={styles.cta}
          onPress={() => router.push('/transfers')}
          accessibilityRole="button"
          accessibilityLabel="Build my squad"
        >
          <Text style={styles.ctaText}>Build my squad →</Text>
        </Pressable>
      ) : null}

      {/* Live strip */}
      {liveFixtures.length > 0 ? (
        <>
          <SectionTitle>Happening now</SectionTitle>
          {liveFixtures.map((f) => (
            <Card key={f.id} style={styles.liveCard}>
              <View style={styles.rowBetween}>
                <Badge text="LIVE" color={colors.live} />
                <Text style={font.tiny}>updates automatically</Text>
              </View>
              <Text style={[font.h3, { marginTop: spacing(2), textAlign: 'center' }]}>
                {f.home_short}{' '}
                <Text style={{ color: colors.accent, fontWeight: '800' }}>
                  {f.home_score ?? 0} – {f.away_score ?? 0}
                </Text>{' '}
                {f.away_short}
              </Text>
            </Card>
          ))}
        </>
      ) : null}

      {/* Up next */}
      <SectionTitle>Up next</SectionTitle>
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
      <SectionTitle>Top scorers 🔥</SectionTitle>
      {hotPlayers.map((p) => (
        <PlayerRow
          key={p.player_id}
          name={`${p.first_name} ${p.last_name}`}
          teamShort={p.team_short}
          position={p.position}
          price={p.price}
          priceDelta={priceChanges[p.player_id] ?? null}
          points={p.total_points}
          onPress={() => router.push(`/player/${p.player_id}`)}
        />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerAction: { minHeight: 44, justifyContent: 'center' },
  heroCard: { marginTop: spacing(3), backgroundColor: colors.bgAlt },
  liveCard: { borderColor: colors.live },
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
