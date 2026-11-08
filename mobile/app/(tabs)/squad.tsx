// My Squad — roster, captain selection, budget, points, transfer entry point.
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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
  setCaptainForGameweek,
} from '@/api/fantasy';
import { getCurrentGameweek } from '@/api/fixtures';
import { Button, EmptyState, Screen, SectionTitle } from '@/components/ui';
import { PlayerRow } from '@/components/PlayerRow';
import { formatMoney, SQUAD_RULES } from '@/lib/scoring';
import { colors, font, radius, spacing } from '@/theme';

export default function SquadScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [editingName, setEditingName] = useState(false);

  const { data: team, isLoading } = useQuery({
    queryKey: ['my-team', session?.user.id],
    queryFn: () => getMyFantasyTeam(session!.user.id),
    enabled: !!session,
  });
  const { data: gameweek } = useQuery({ queryKey: ['current-gw'], queryFn: getCurrentGameweek });
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
    mutationFn: ({ rowId, isCaptain }: { rowId: string; isCaptain: boolean }) =>
      setCaptainForGameweek({
        teamId: team!.id,
        squadRowId: rowId,
        gameweekId: gameweek!.id,
        makeCaptain: isCaptain,
      }),
    onSuccess: invalidate,
    onError: (e: any) => Alert.alert('Captain change failed', e.message),
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

  return (
    <Screen>
      <Pressable onLongPress={() => setEditingName(true)}>
        <Text style={font.h1}>{team?.name ?? '…'}</Text>
      </Pressable>
      {editingName ? (
        <View style={{ flexDirection: 'row', gap: spacing(2), alignItems: 'center' }}>
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
            style={[styles.nameInput, { flex: 1, marginTop: spacing(2) }]}
          />
        </View>
      ) : null}

      {/* Summary strip */}
      <View style={styles.strip}>
        <Stat label="Total pts" value={String(totalPoints)} />
        <Stat label="Squad" value={`${squad.length}/${SQUAD_RULES.size}`} />
        <Stat label="In the bank" value={formatMoney(Math.max(0, remaining))} />
        <Stat label="Free transfers" value={String(freeTransfersRemaining(transfersUsed.length))} />
      </View>

      <Button title="Manage squad / transfers" variant="secondary" onPress={() => router.push('/transfers')} />

      <SectionTitle>Starting squad</SectionTitle>
      {squad.length === 0 ? (
        <EmptyState emoji="🫥" title="No players yet" subtitle="Open the squad builder to pick your 10." />
      ) : (
        squad.map((s) => (
          <PlayerRow
            key={s.id}
            name={`${s.player.first_name} ${s.player.last_name}`}
            teamShort={s.player.team_short}
            position={s.player.position}
            price={s.purchase_price}
            isCaptain={s.is_captain}
            onPress={() =>
              Alert.alert(
                `${s.player.first_name} ${s.player.last_name}`,
                s.is_captain ? 'Remove captaincy?' : 'Make captain? (double points)',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: s.is_captain ? 'Remove C' : 'Make captain',
                    onPress: () => {
                      if (!gameweek) return Alert.alert('Still loading', 'Try again in a moment.');
                      captainMut.mutate({ rowId: s.id, isCaptain: !s.is_captain });
                    },
                  },
                  {
                    text: 'View profile',
                    onPress: () => router.push(`/player/${s.player_id}`),
                  },
                ],
              )
            }
          />
        ))
      )}
      <Text style={[font.tiny, { textAlign: 'center', marginTop: spacing(2) }]}>
        Tap a player to set the captain (scores double). Long-press the team name to rename.
      </Text>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 18 }}>{value}</Text>
      <Text style={font.tiny}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(3),
    marginTop: spacing(3),
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
  },
});
