// Squad builder 2.0 — budget bar, position filters, form dots, ownership %,
// and an inline swap panel instead of the old 10-button alert.
// (UX redesign step 2.4)
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
import { getGameweeks, getOpenGameweek } from '@/api/fixtures';
import { getOwnership, getPlayers, getRecentForm } from '@/api/players';
import { Button, Card, Input, Screen } from '@/components/ui';
import { BudgetBar } from '@/components/fantasy';
import { PlayerRow } from '@/components/PlayerRow';
import { formatMoney, SQUAD_RULES } from '@/lib/scoring';
import { colors, font, radius, spacing } from '@/theme';
import type { PlayerSeasonStats, SquadPlayer } from '@/types';

const POS_FILTERS = ['All', 'Forward', 'Back', 'Utility'] as const;

export default function TransfersScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState<(typeof POS_FILTERS)[number]>('All');
  const [pendingIn, setPendingIn] = useState<PlayerSeasonStats | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: team } = useQuery({
    queryKey: ['my-team', session?.user.id],
    queryFn: () => getMyFantasyTeam(session!.user.id),
    enabled: !!session,
  });
  const { data: gameweek } = useQuery({ queryKey: ['open-gw'], queryFn: getOpenGameweek });
  const { data: gameweeks = [] } = useQuery({ queryKey: ['gameweeks'], queryFn: getGameweeks });
  const { data: squad = [] } = useQuery({
    queryKey: ['squad', team?.id, gameweek?.id],
    queryFn: () => getSquad(team!.id, gameweek?.id),
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

  // Form dots: points from the last 3 finished gameweeks.
  const lastFinishedIds = useMemo(
    () => gameweeks.filter((g) => g.is_finished).slice(-3).map((g) => g.id),
    [gameweeks],
  );
  const { data: formMap = {} } = useQuery({
    queryKey: ['form', lastFinishedIds],
    queryFn: () => getRecentForm(lastFinishedIds),
    enabled: lastFinishedIds.length > 0,
  });
  const { data: ownership = {} } = useQuery({ queryKey: ['ownership'], queryFn: getOwnership });

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

  const visibleMarket = useMemo(
    () => (posFilter === 'All' ? market : market.filter((p) => p.position === posFilter)),
    [market, posFilter],
  );

  const createTeamMut = useMutation({
    mutationFn: () => createFantasyTeam(session!.user.id, 'My Tag Team'),
  });

  async function doAdd(p: PlayerSeasonStats, replacing: SquadPlayer | undefined) {
    let fantasyTeamId = team?.id;
    if (!fantasyTeamId) {
      const t = await createTeamMut.mutateAsync();
      fantasyTeamId = t.id;
    }
    setBusy(true);
    try {
      await addPlayerToSquad({
        fantasyTeamId,
        playerId: p.player_id,
        gameweekId: gameweek!.id,
        playerOutRowId: replacing?.id,
      });
      setPendingIn(null);
      qc.invalidateQueries({ queryKey: ['squad'] });
      qc.invalidateQueries({ queryKey: ['transfers'] });
      qc.invalidateQueries({ queryKey: ['my-team'] });
      qc.invalidateQueries({ queryKey: ['ownership'] });
    } catch (e: any) {
      Alert.alert('Could not add player', e.message);
    } finally {
      setBusy(false);
    }
  }

  /** Tap on [+]: validate, then either add directly or enter swap mode. */
  async function beginAdd(p: PlayerSeasonStats) {
    if (!gameweek) return Alert.alert('Season not started', 'No open gameweek found.');
    if (squadIds.has(p.player_id)) return;

    if ((perTeamCount.get(p.team_id) ?? 0) >= SQUAD_RULES.maxPerTeam) {
      return Alert.alert('Team limit', `You already have ${SQUAD_RULES.maxPerTeam} ${p.team_name} players.`);
    }

    if (squad.length >= SQUAD_RULES.size) {
      setPendingIn(p); // swap mode — context bar lists who can go out
      return;
    }
    if (p.price > remaining) {
      return Alert.alert('Over budget', `${formatMoney(p.price)} is more than your remaining ${formatMoney(Math.max(0, remaining))}.`);
    }
    await doAdd(p, undefined);
  }

  /** Swap mode: user picked who goes out. */
  async function completeSwap(out: SquadPlayer) {
    const p = pendingIn;
    if (!p) return;

    const newSpend = spend - out.purchase_price + p.price;
    if (newSpend > SQUAD_RULES.budget) {
      return Alert.alert('Over budget', `That swap would take you to ${formatMoney(newSpend)}.`);
    }
    const teamCountAfterOut =
      (perTeamCount.get(out.player.team_id) ?? 1) - 1 +
      (out.player.team_id === p.team_id ? 1 : 0);
    if (teamCountAfterOut > SQUAD_RULES.maxPerTeam) {
      return Alert.alert('Team limit', 'That swap breaks the 2-per-team rule.');
    }
    if (freeLeft === 0) {
      const proceed = await confirm(
        'No free transfers left',
        `This transfer costs −${SQUAD_RULES.extraTransferHit} points. Continue?`,
      );
      if (!proceed) return;
    }
    await doAdd(p, out);
  }

  return (
    <Screen scroll={false}>
      <View style={{ padding: spacing(4), paddingBottom: 0, flex: 1 }}>
        {/* Budget header */}
        <View style={styles.budgetHeader}>
          <View style={styles.budgetRow}>
            <Text style={font.h3}>
              {formatMoney(Math.max(0, remaining))} <Text style={font.tiny}>left</Text>
            </Text>
            <Text style={font.muted}>
              {squad.length}/{SQUAD_RULES.size} picked
              {isInitialBuild ? '' : ` · ${freeLeft} free`}
            </Text>
          </View>
          <BudgetBar spend={spend} budget={SQUAD_RULES.budget} />
        </View>

        <Input placeholder="Search players…" value={search} onChangeText={setSearch} />

        {/* Position filter chips */}
        <View style={styles.chips}>
          {POS_FILTERS.map((f) => (
            <Pressable
              key={f}
              onPress={() => setPosFilter(f)}
              style={[styles.chip, posFilter === f && styles.chipActive]}
              accessibilityRole="tab"
              accessibilityLabel={`Filter ${f === 'All' ? 'all positions' : f}`}
              accessibilityState={{ selected: posFilter === f }}
            >
              <Text style={[styles.chipText, posFilter === f && { color: '#0B3D2E' }]}>
                {f === 'All' ? 'All' : f === 'Utility' ? 'Uti' : f.slice(0, 3)}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Swap-context panel */}
        {pendingIn ? (
          <Card style={styles.swapCard}>
            <Text style={font.h3}>
              Bringing in {pendingIn.first_name} {pendingIn.last_name} ({formatMoney(pendingIn.price)})
            </Text>
            <Text style={[font.tiny, { marginTop: 2, marginBottom: spacing(2) }]}>
              Squad full — tap who goes out:
            </Text>
            {squad.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => completeSwap(s)}
                disabled={busy}
                style={({ pressed }) => [styles.swapRow, pressed && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel={`Transfer out ${s.player.first_name} ${s.player.last_name}`}
              >
                <Text style={[font.body, { flex: 1 }]} numberOfLines={1}>
                  {s.player.first_name} {s.player.last_name}
                </Text>
                <Text style={font.tiny}>{formatMoney(s.purchase_price)}</Text>
                <Text style={styles.swapOut}>OUT →</Text>
              </Pressable>
            ))}
            <Button title="Cancel swap" variant="ghost" onPress={() => setPendingIn(null)} />
          </Card>
        ) : null}

        <FlatList
          data={visibleMarket}
          keyExtractor={(p) => p.player_id}
          initialNumToRender={20}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: p }) => {
            const inSquad = squadIds.has(p.player_id);
            const teamFull = (perTeamCount.get(p.team_id) ?? 0) >= SQUAD_RULES.maxPerTeam;
            const tooExpensive = p.price > remaining && squad.length < SQUAD_RULES.size;
            const disabled = inSquad || teamFull || tooExpensive || busy;
            return (
              <PlayerRow
                name={`${p.first_name} ${p.last_name}`}
                teamShort={p.team_short}
                position={p.position}
                price={p.price}
                points={p.total_points}
                form={formMap[p.player_id]}
                ownership={ownership[p.player_id] ?? null}
                right={
                  <Pressable
                    disabled={disabled}
                    onPress={() => beginAdd(p)}
                    style={[styles.addBtn, disabled && { opacity: 0.35 }]}
                    accessibilityRole="button"
                    accessibilityLabel={inSquad ? `${p.first_name} ${p.last_name} already in squad` : `Add ${p.first_name} ${p.last_name}`}
                    hitSlop={6}
                  >
                    <Text style={{ color: '#0B3D2E', fontWeight: '800' }}>
                      {inSquad ? '✓' : '+'}
                    </Text>
                  </Pressable>
                }
              />
            );
          }}
        />

        <Button title="Done" onPress={() => router.back()} />
      </View>
    </Screen>
  );
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
  budgetHeader: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(3),
    marginBottom: spacing(3),
  },
  budgetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing(2),
  },
  chips: { flexDirection: 'row', gap: spacing(2), marginBottom: spacing(3) },
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
  swapCard: { borderColor: colors.accent },
  swapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    backgroundColor: colors.cardAlt,
    borderRadius: radius.sm,
    padding: spacing(2.5),
    marginBottom: spacing(1.5),
    minHeight: 44,
  },
  swapOut: { color: colors.fall, fontWeight: '800', fontSize: 12 },
  addBtn: {
    backgroundColor: colors.accent,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
