// Squad builder / transfers — pick 10 players within £100m, max 2 per team.
// Works for both initial squad creation and gameweek transfers:
//   - empty slot → adding costs nothing (initial pick)
//   - replacing a player → logged as a transfer (1 free/GW, −4 per extra)
import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/store/AuthContext';
import {
  addPlayerToSquad,
  createFantasyTeam,
  getMyFantasyTeam,
  getSquad,
  getTransfersThisGameweek,
  freeTransfersRemaining,
} from '@/api/fantasy';
import { getCurrentGameweek } from '@/api/fixtures';
import { getPlayers } from '@/api/players';
import { Button, Input, Screen } from '@/components/ui';
import { formatMoney, SQUAD_RULES } from '@/lib/scoring';
import { colors, font, radius, spacing } from '@/theme';
import type { PlayerSeasonStats, SquadPlayer } from '@/types';

export default function TransfersScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: team } = useQuery({
    queryKey: ['my-team', session?.user.id],
    queryFn: () => getMyFantasyTeam(session!.user.id),
    enabled: !!session,
  });
  const { data: gameweek } = useQuery({ queryKey: ['current-gw'], queryFn: getCurrentGameweek });
  const { data: squad = [] } = useQuery({
    queryKey: ['squad', team?.id],
    queryFn: () => getSquad(team!.id),
    enabled: !!team,
  });
  const { data: market = [] } = useQuery({
    queryKey: ['players', search],
    queryFn: () => getPlayers({ search: search || undefined, sortBy: 'total_points' }),
  });
  const { data: transfersUsed = [] } = useQuery({
    queryKey: ['transfers', team?.id, gameweek?.id],
    queryFn: () => getTransfersThisGameweek(team!.id, gameweek!.id),
    enabled: !!team && !!gameweek,
  });

  const isInitialBuild = squad.length < SQUAD_RULES.size && transfersUsed.length === 0;

  const spend = squad.reduce((a, s) => a + s.purchase_price, 0);
  const remaining = SQUAD_RULES.budget - spend;
  const freeLeft = freeTransfersRemaining(transfersUsed.length);
  const squadIds = useMemo(() => new Set(squad.map((s) => s.player_id)), [squad]);

  const perTeamCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of squad) m.set(s.player.team_id, (m.get(s.player.team_id) ?? 0) + 1);
    return m;
  }, [squad]);

  const createTeamMut = useMutation({
    mutationFn: () => createFantasyTeam(session!.user.id, 'My Tag Team'),
  });

  async function handleAdd(p: PlayerSeasonStats) {
    if (!gameweek) return Alert.alert('Season not started', 'No open gameweek found.');
    if (squadIds.has(p.player_id)) return;

    // Client-side pre-validation (Postgres re-checks everything)
    if ((perTeamCount.get(p.team_id) ?? 0) >= SQUAD_RULES.maxPerTeam) {
      return Alert.alert('Team limit', `You already have ${SQUAD_RULES.maxPerTeam} ${p.team_name} players.`);
    }

    let fantasyTeamId = team?.id;
    if (!fantasyTeamId) {
      const t = await createTeamMut.mutateAsync();
      fantasyTeamId = t.id;
    }

    const replacing: SquadPlayer | undefined =
      squad.length >= SQUAD_RULES.size ? await pickPlayerToRemove(squad) : undefined;
    if (squad.length >= SQUAD_RULES.size && !replacing) return; // user cancelled

    const newSpend = spend - (replacing?.purchase_price ?? 0) + p.price;
    if (newSpend > SQUAD_RULES.budget) {
      return Alert.alert('Over budget', `That would take you to ${formatMoney(newSpend)}.`);
    }
    if (replacing) {
      const teamCountAfterOut =
        (perTeamCount.get(replacing.player.team_id) ?? 1) - 1 +
        (replacing.player.team_id === p.team_id ? 1 : 0);
      if (teamCountAfterOut > SQUAD_RULES.maxPerTeam) {
        return Alert.alert('Team limit', 'That replacement breaks the 2-per-team rule.');
      }
      if (freeLeft === 0) {
        const proceed = await confirm(
          'No free transfers left',
          `This transfer costs −${SQUAD_RULES.extraTransferHit} points. Continue?`,
        );
        if (!proceed) return;
      }
    }

    setBusy(true);
    try {
      await addPlayerToSquad({
        fantasyTeamId,
        playerId: p.player_id,
        gameweekId: gameweek.id,
        playerOutRowId: replacing?.id,
      });
      qc.invalidateQueries({ queryKey: ['squad'] });
      qc.invalidateQueries({ queryKey: ['transfers'] });
      qc.invalidateQueries({ queryKey: ['my-team'] });
    } catch (e: any) {
      Alert.alert('Could not add player', e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll={false}>
      <View style={{ padding: spacing(4), paddingBottom: 0, flex: 1 }}>
        {/* Budget strip */}
        <View style={styles.strip}>
          <StripStat label="Squad" value={`${squad.length}/${SQUAD_RULES.size}`} />
          <StripStat label="Remaining" value={formatMoney(Math.max(0, remaining))} />
          <StripStat
            label={isInitialBuild ? 'Mode' : 'Free transfers'}
            value={isInitialBuild ? 'Initial picks' : String(freeLeft)}
          />
        </View>

        <Input placeholder="Search players…" value={search} onChangeText={setSearch} />

        <FlatList
          data={market}
          keyExtractor={(p) => p.player_id}
          initialNumToRender={20}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: p }) => {
            const inSquad = squadIds.has(p.player_id);
            const teamFull = (perTeamCount.get(p.team_id) ?? 0) >= SQUAD_RULES.maxPerTeam;
            const tooExpensive = p.price > remaining && squad.length < SQUAD_RULES.size;
            const disabled = inSquad || teamFull || tooExpensive || busy;
            return (
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={font.h3} numberOfLines={1}>
                    {p.first_name} {p.last_name}
                  </Text>
                  <Text style={font.tiny}>
                    {p.position} · {p.team_short} · {p.total_points} pts
                  </Text>
                </View>
                <Text style={styles.price}>{formatMoney(p.price)}</Text>
                <Pressable
                  disabled={disabled}
                  onPress={() => handleAdd(p)}
                  style={[styles.addBtn, disabled && { opacity: 0.35 }]}
                >
                  <Text style={{ color: '#0B3D2E', fontWeight: '800' }}>
                    {inSquad ? '✓' : '+'}
                  </Text>
                </Pressable>
              </View>
            );
          }}
        />

        <Button title="Done" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

function StripStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 16 }}>{value}</Text>
      <Text style={font.tiny}>{label}</Text>
    </View>
  );
}

function pickPlayerToRemove(squad: SquadPlayer[]): Promise<SquadPlayer | undefined> {
  return new Promise((resolve) => {
    Alert.alert('Squad full', 'Choose a player to transfer out:', [
      ...squad.map((s) => ({
        text: `${s.player.first_name} ${s.player.last_name} (${formatMoney(s.purchase_price)})`,
        onPress: () => resolve(s),
      })),
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(undefined) },
    ] as any);
  });
}

function confirm(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Continue', onPress: () => resolve(true) },
    ]);
  });
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(3),
    marginBottom: spacing(3),
  },
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
  price: { color: colors.accent, fontWeight: '700' },
  addBtn: {
    backgroundColor: colors.accent,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
