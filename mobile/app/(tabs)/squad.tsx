// My Squad 3.2 — position groups, per-GW captain + vice-captain controls,
// lock chip, budget/rank strip and bottom-anchored transfers CTA.
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/store/AuthContext';
import {
  createFantasyTeam,
  getMyFantasyTeam,
  getSquad,
  getSquadTotalPoints,
  getTransfersThisGameweek,
  freeTransfersRemaining,
  renameFantasyTeam,
  setCaptaincyForGameweek,
  type CaptaincyRole,
} from '@/api/fantasy';
import { getOpenGameweek } from '@/api/fixtures';
import { getGlobalLeaderboard } from '@/api/leagues';
import { Button, Card, EmptyState, Screen } from '@/components/ui';
import { DeadlineChip, RankBadge } from '@/components/fantasy';
import { PlayerRow } from '@/components/PlayerRow';
import { formatMoney, SQUAD_RULES } from '@/lib/scoring';
import { colors, font, radius, spacing } from '@/theme';
import type { SquadPlayer } from '@/types';

const POSITION_GROUPS = ['Forward', 'Back', 'Utility'] as const;

export default function SquadScreen() {
  const { session, profile } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [captaincyPlayer, setCaptaincyPlayer] = useState<SquadPlayer | null>(null);

  const { data: team, isLoading } = useQuery({
    queryKey: ['my-team', session?.user.id],
    queryFn: () => getMyFantasyTeam(session!.user.id),
    enabled: !!session,
  });
  const { data: gameweek } = useQuery({ queryKey: ['open-gw'], queryFn: getOpenGameweek });
  const { data: squad = [] } = useQuery({
    queryKey: ['squad', team?.id, gameweek?.id],
    queryFn: () => getSquad(team!.id, gameweek?.id),
    enabled: !!team,
  });
  const { data: totalPoints = 0 } = useQuery({
    queryKey: ['my-points', team?.id],
    queryFn: () => getSquadTotalPoints(team!.id),
    enabled: !!team,
  });
  const { data: board = [] } = useQuery({ queryKey: ['global-board'], queryFn: () => getGlobalLeaderboard(100) });
  const { data: transfersUsed = [] } = useQuery({
    queryKey: ['transfers', team?.id, gameweek?.id],
    queryFn: () => getTransfersThisGameweek(team!.id, gameweek!.id),
    enabled: !!team && !!gameweek,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['squad', team?.id] });
    qc.invalidateQueries({ queryKey: ['my-team'] });
  };

  const createMut = useMutation({
    mutationFn: (name: string) => createFantasyTeam(session!.user.id, name),
    onSuccess: invalidate,
    onError: (e: any) => Alert.alert('Could not create team', e.message),
  });

  const captainMut = useMutation({
    mutationFn: ({ rowId, role, selected }: { rowId: string; role: CaptaincyRole; selected: boolean }) =>
      setCaptaincyForGameweek({
        teamId: team!.id,
        squadRowId: rowId,
        gameweekId: gameweek!.id,
        role,
        selected,
      }),
    onSuccess: () => {
      setCaptaincyPlayer(null);
      invalidate();
    },
    onError: (e: any) => Alert.alert('Captaincy change failed', e.message),
  });

  if (!isLoading && !team) {
    return (
      <Screen>
        <EmptyState emoji="🏉" title="Name your fantasy team"
          subtitle="You'll then pick 10 players within a £100m budget." />
        <TextInput
          value={newName}
          onChangeText={setNewName}
          placeholder="e.g. Tag You're It"
          placeholderTextColor={colors.textMuted}
          style={styles.nameInput}
          maxLength={40}
        />
        <Button
          title="Create team"
          loading={createMut.isPending}
          onPress={() => {
            if (newName.trim().length < 2) return Alert.alert('Name too short');
            createMut.mutate(newName.trim());
          }}
        />
      </Screen>
    );
  }

  const spend = squad.reduce((a, s) => a + s.purchase_price, 0);
  const remaining = (team?.budget ?? SQUAD_RULES.budget) - spend;
  const freeLeft = freeTransfersRemaining(transfersUsed.length);
  const myRank = board.find((r) => r.fantasy_team_id === team?.id)?.rank;
  const locked = gameweek ? Date.now() > new Date(gameweek.deadline).getTime() : false;

  const grouped = POSITION_GROUPS.map((pos) => ({
    pos,
    players: squad.filter((s) => s.player.position === pos),
  })).filter((g) => g.players.length > 0);

  function handlePlayerTap(s: SquadPlayer) {
    if (locked) {
      Alert.alert(
        `${s.player.first_name} ${s.player.last_name}`,
        'Squads are locked until results are finalised.',
        [{ text: 'View profile', onPress: () => router.push(`/player/${s.player_id}`) },
         { text: 'OK', style: 'cancel' }],
      );
      return;
    }
    if (!gameweek) return Alert.alert('Still loading', 'Try again in a moment.');
    setCaptaincyPlayer(s);
  }

  return (
    <Screen scroll={false}>
      <View style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Header: name + stats strip */}
          <View style={styles.headerRow}>
            {editingName ? (
              <TextInput
                defaultValue={team?.name}
                onSubmitEditing={async (e) => {
                  try {
                    await renameFantasyTeam(team!.id, e.nativeEvent.text.trim());
                    setEditingName(false);
                    invalidate();
                  } catch (err: any) {
                    Alert.alert('Rename failed', err.message);
                  }
                }}
                autoFocus
                style={[styles.nameInput, { flex: 1, marginTop: 0 }]}
              />
            ) : (
              <Text style={font.h1} numberOfLines={1}>{team?.name ?? '…'}</Text>
            )}
            {!editingName ? (
              <Pressable onPress={() => setEditingName(true)} accessibilityRole="button" accessibilityLabel="Rename team" hitSlop={14}>
                <Text style={{ fontSize: 18 }}>✏️</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(3) }}>
            <Text style={font.muted}>{totalPoints} pts</Text>
            <RankBadge rank={myRank} />
            <Text style={font.muted}>{formatMoney(Math.max(0, remaining))} bank</Text>
          </View>

          {/* Onboarding banner (until setup complete) */}
          {profile?.onboarding_step != null ? (
            <Pressable
              onPress={() => router.push('/onboarding')}
              accessibilityRole="button"
              accessibilityLabel={`Finish setup, ${4 - profile.onboarding_step} steps remaining`}
            >
              <Card style={styles.onboardCard}>
                <Text style={[font.h3, { color: colors.accent }]}>
                  Finish setup — {4 - profile.onboarding_step} step{profile.onboarding_step === 3 ? '' : 's'} left →
                </Text>
              </Card>
            </Pressable>
          ) : null}

          {/* Lock / transfers status */}
          {gameweek ? (
            <Card style={styles.lockCard}>
              <View style={styles.lockRow}>
                <DeadlineChip deadline={gameweek.deadline} />
                <Text style={font.muted}>
                  {locked
                    ? 'Changes reopen when results are finalised'
                    : `${freeLeft} free transfer${freeLeft === 1 ? '' : 's'} left · ${gameweek.name}`}
                </Text>
              </View>
            </Card>
          ) : null}

          {/* Captaincy panel avoids platform Alert button limits. */}
          {captaincyPlayer ? (
            <Card style={styles.captaincyCard}>
              <Text style={font.h3}>
                {captaincyPlayer.player.first_name} {captaincyPlayer.player.last_name}
              </Text>
              <Text style={[font.tiny, { marginTop: spacing(1) }]}>
                C scores 2×. V scores 2× only when C has no attended match.
              </Text>
              <View style={styles.captaincyButtons}>
                <View style={styles.flex}>
                  <Button
                    title={captaincyPlayer.is_captain ? 'Remove C' : 'Make captain'}
                    loading={captainMut.isPending && captainMut.variables?.role === 'captain'}
                    disabled={captainMut.isPending}
                    onPress={() => captainMut.mutate({
                      rowId: captaincyPlayer.id,
                      role: 'captain',
                      selected: !captaincyPlayer.is_captain,
                    })}
                  />
                </View>
                <View style={styles.flex}>
                  <Button
                    title={captaincyPlayer.is_vice_captain ? 'Remove V' : 'Make vice'}
                    variant="secondary"
                    loading={captainMut.isPending && captainMut.variables?.role === 'vice'}
                    disabled={captainMut.isPending}
                    onPress={() => captainMut.mutate({
                      rowId: captaincyPlayer.id,
                      role: 'vice',
                      selected: !captaincyPlayer.is_vice_captain,
                    })}
                  />
                </View>
              </View>
              <View style={styles.captaincyButtons}>
                <View style={styles.flex}>
                  <Button
                    title="View profile"
                    variant="ghost"
                    onPress={() => router.push(`/player/${captaincyPlayer.player_id}`)}
                  />
                </View>
                <View style={styles.flex}>
                  <Button title="Cancel" variant="ghost" onPress={() => setCaptaincyPlayer(null)} />
                </View>
              </View>
            </Card>
          ) : null}

          {/* Grouped roster */}
          {squad.length === 0 ? (
            <EmptyState emoji="🫥" title="No tags yet"
              subtitle="Open the squad builder below to pick your 10." />
          ) : (
            grouped.map((g) => (
              <View key={g.pos}>
                <Text style={styles.groupTitle}>{g.pos.toUpperCase()}S</Text>
                {g.players.map((s) => (
                  <PlayerRow
                    key={s.id}
                    name={`${s.player.first_name} ${s.player.last_name}`}
                    teamShort={s.player.team_short}
                    position={s.player.position}
                    price={s.purchase_price}
                    isCaptain={s.is_captain}
                    isViceCaptain={s.is_vice_captain}
                    onPress={() => handlePlayerTap(s)}
                  />
                ))}
              </View>
            ))
          )}

          <Text style={[font.tiny, { textAlign: 'center', marginTop: spacing(2) }]}>
            {locked
              ? '🔒 Locked — captain changes reopen after results.'
              : 'Tap a player to set C or V. Vice covers an absent captain.'}
          </Text>
        </ScrollView>

        {/* Bottom-anchored CTA */}
        <View style={styles.footer}>
          <Button
            title={
              squad.length < SQUAD_RULES.size
                ? `Pick your squad (${squad.length}/${SQUAD_RULES.size})`
                : freeLeft > 0
                  ? `Make transfers (${freeLeft} free)`
                  : 'Make transfers (−4 pts each)'
            }
            onPress={() => router.push('/transfers')}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: spacing(4), paddingBottom: spacing(4) },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing(2),
  },
  lockCard: { marginTop: spacing(3), paddingVertical: spacing(3) },
  captaincyCard: { borderColor: colors.gold },
  captaincyButtons: { flexDirection: 'row', gap: spacing(2) },
  onboardCard: { marginTop: spacing(3), borderColor: colors.accent },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  groupTitle: {
    ...font.tiny,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: spacing(4),
    marginBottom: spacing(2),
  },
  footer: {
    padding: spacing(4),
    paddingTop: spacing(2),
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  nameInput: {
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(3),
    fontSize: 16,
    marginTop: spacing(2),
  },
});
