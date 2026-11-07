// Admin dashboard — entry points.
import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { adminRunSpawtzSync, getSyncHistory } from '@/api/fixtures';
import { Button, Card, Screen, SectionTitle } from '@/components/ui';
import { colors, font, spacing } from '@/theme';

export default function AdminHome() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: counts } = useQuery({
    queryKey: ['admin-counts'],
    queryFn: async () => {
      const [players, teams, fixtures, users] = await Promise.all([
        supabase.from('players').select('id', { count: 'exact', head: true }),
        supabase.from('teams').select('id', { count: 'exact', head: true }),
        supabase.from('fixtures').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
      ]);
      return {
        players: players.count ?? 0,
        teams: teams.count ?? 0,
        fixtures: fixtures.count ?? 0,
        users: users.count ?? 0,
      };
    },
  });

  const syncMut = useMutation({
    mutationFn: () => adminRunSpawtzSync(),
    onSuccess: (s) => {
      // Everything the sync touches becomes stale
      ['fixtures', 'players', 'teams', 'gameweeks', 'current-gw', 'next-fixtures',
        'global-board', 'weekly-board', 'admin-counts', 'price-history', 'match-log',
        'sync-history']
        .forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      Alert.alert(
        'Spawtz sync complete',
        [
          `Fixtures scraped: ${s.fixtures_scraped}`,
          `Fixtures updated: ${s.fixtures_upserted}`,
          `New teams: ${s.teams_created}`,
          `POTM players: ${s.pom_players}`,
          `POTM awards applied: ${s.pom_awards_applied}`,
          s.errors.length ? `\n${s.errors.length} error(s):\n${s.errors.slice(0, 3).join('\n')}` : '',
        ].join('\n'),
      );
    },
    onError: (e: any) => Alert.alert('Sync failed', e.message),
  });

  const { data: syncHistory = [] } = useQuery({
    queryKey: ['sync-history'],
    queryFn: () => getSyncHistory(5),
  });

  return (
    <Screen>
      <View style={styles.grid}>
        <StatCard label="Players" value={counts?.players} />
        <StatCard label="Teams" value={counts?.teams} />
        <StatCard label="Fixtures" value={counts?.fixtures} />
        <StatCard label="Users" value={counts?.users} />
      </View>

      <SectionTitle>Manage</SectionTitle>
      <MenuCard emoji="👤" title="Players & Teams"
        subtitle="Add players, edit prices, create teams"
        onPress={() => router.push('/admin/players')} />
      <MenuCard emoji="📅" title="Fixtures"
        subtitle="Schedule matches, set live status"
        onPress={() => router.push('/admin/fixtures')} />
      <MenuCard emoji="✅" title="Results & Statistics"
        subtitle="Enter scores, tries, assists, POTM"
        onPress={() => router.push('/admin/results')} />

      <SectionTitle>Data sync</SectionTitle>
      <Card>
        <Text style={font.h3}>🔄 Spawtz sync</Text>
        <Text style={[font.muted, { marginTop: spacing(1) }]}>
          Pulls the latest fixtures, results and Player-of-the-Match awards from the
          official Try Tag Rugby pages. Runs automatically every Monday night; use
          this to sync on demand.
        </Text>
        <Button
          title={syncMut.isPending ? 'Syncing…' : 'Sync now'}
          variant="secondary"
          loading={syncMut.isPending}
          onPress={() => syncMut.mutate()}
        />
        {syncHistory.length > 0 ? (
          <View style={{ marginTop: spacing(3) }}>
            <Text style={[font.tiny, { marginBottom: spacing(1) }]}>RECENT RUNS</Text>
            {syncHistory.map((run) => (
              <View key={run.id} style={styles.syncRow}>
                <Text style={font.tiny}>
                  {new Date(run.ran_at).toLocaleString('en-GB', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                  {run.triggered_by ? ' · manual' : ' · auto'}
                </Text>
                <Text style={font.tiny}>
                  {run.fixtures_upserted} fixtures · {run.pom_awards_applied} POTM
                  {run.error_count > 0 ? ` · ⚠️ ${run.error_count}` : ''}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}

function StatCard({ label, value }: { label: string; value?: number }) {
  return (
    <Card style={{ flexBasis: '46%', flexGrow: 1, alignItems: 'center' }}>
      <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 24 }}>{value ?? '—'}</Text>
      <Text style={font.tiny}>{label}</Text>
    </Card>
  );
}

function MenuCard({ emoji, title, subtitle, onPress }: { emoji: string; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Card>
      <Text style={font.h3} onPress={onPress}>
        {emoji} {title}
      </Text>
      <Text style={font.muted} onPress={onPress}>{subtitle}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  syncRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing(1.5),
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
