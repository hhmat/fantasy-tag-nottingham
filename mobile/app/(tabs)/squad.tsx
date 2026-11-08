// My Squad 4.0 — interactive tag pitch, per-GW formations and captaincy,
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
} from '@/api/fantasy';
import { getOpenGameweek } from '@/api/fixtures';
import { getGlobalLeaderboard } from '@/api/leagues';
import { Button, Card, EmptyState, Screen } from '@/components/ui';
import { DeadlineChip, RankBadge } from '@/components/fantasy';
import { SquadPitch } from '@/components/SquadPitch';
import { formatMoney, SQUAD_RULES } from '@/lib/scoring';
import { colors, font, radius, spacing } from '@/theme';

export default function SquadScreen() {
  const { session, profile } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [editingName, setEditingName] = useState(false);

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

          {/* Phase 4 interactive starting 7, substitutes and player cards. */}
          {squad.length === 0 ? (
            <EmptyState emoji="🫥" title="No tags yet"
              subtitle="Open the squad builder below to pick your 10." />
          ) : team && gameweek ? (
            <SquadPitch
              fantasyTeamId={team.id}
              gameweekId={gameweek.id}
              gameweekName={gameweek.name}
              squad={squad}
              locked={locked}
            />
          ) : (
            <Text style={[font.muted, { textAlign: 'center', marginTop: spacing(4) }]}>
              Loading the next gameweek…
            </Text>
          )}
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
  onboardCard: { marginTop: spacing(3), borderColor: colors.accent },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
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
