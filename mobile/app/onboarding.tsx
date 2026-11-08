// Onboarding — 4 resumable steps: name team → rules → build squad → join league.
// Progress persists in profiles.onboarding_step; the Squad tab shows a
// "finish setup" banner until it's null. (UX redesign step 2.5)
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/store/AuthContext';
import { setOnboardingStep } from '@/api/auth';
import { createFantasyTeam, getMyFantasyTeam, getSquad } from '@/api/fantasy';
import { getOpenGameweek } from '@/api/fixtures';
import { joinPrivateLeagueByCode } from '@/api/leagues';
import { Button, Input, Screen } from '@/components/ui';
import { SQUAD_RULES } from '@/lib/scoring';
import { colors, font, radius, spacing } from '@/theme';

const TOTAL_STEPS = 4;

export default function OnboardingScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [step, setStep] = useState(() =>
    Math.min(Math.max(profile?.onboarding_step ?? 0, 0), TOTAL_STEPS - 1),
  );
  const [teamName, setTeamName] = useState('');
  const [leagueCode, setLeagueCode] = useState('');

  const { data: team } = useQuery({
    queryKey: ['my-team', session?.user.id],
    queryFn: () => getMyFantasyTeam(session!.user.id),
    enabled: !!session,
  });
  const { data: gameweek } = useQuery({ queryKey: ['open-gw'], queryFn: getOpenGameweek });
  const { data: squad = [] } = useQuery({
    queryKey: ['squad', team?.id, gameweek?.id],
    queryFn: () => getSquad(team!.id, gameweek?.id),
    enabled: !!team,
    refetchInterval: 3000, // pick up squad-builder progress while open
  });

  const persist = useMutation({
    mutationFn: (s: number | null) => setOnboardingStep(session!.user.id, s),
    onSuccess: () => refreshProfile(),
  });

  function goTo(next: number | null) {
    persist.mutate(next);
    if (next === null) {
      router.replace('/(tabs)');
    } else {
      setStep(next);
    }
  }

  const createTeam = useMutation({
    mutationFn: (name: string) => createFantasyTeam(session!.user.id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-team'] });
      goTo(1);
    },
    onError: (e: any) => Alert.alert('Could not create team', e.message),
  });

  const joinLeague = useMutation({
    mutationFn: () => joinPrivateLeagueByCode(leagueCode, team!.id),
    onSuccess: () => goTo(null),
    onError: (e: any) => Alert.alert('Could not join', e.message),
  });

  const squadComplete = squad.length >= SQUAD_RULES.size;

  return (
    <Screen>
      <StepDots current={step} total={TOTAL_STEPS} />

      {step === 0 ? (
        <View>
          <Text style={styles.title}>Name your team</Text>
          <Text style={styles.body}>
            Welcome aboard{profile?.display_name ? `, ${profile.display_name}` : ''}! First things
            first — every great tag rugby dynasty starts with a great pun.
          </Text>
          {team ? (
            <>
              <Text style={[styles.body, { marginBottom: spacing(3) }]}>
                You're managing <Text style={{ color: colors.accent, fontWeight: '700' }}>{team.name}</Text>.
              </Text>
              <Button title="Continue →" onPress={() => goTo(1)} />
            </>
          ) : (
            <>
              <Input
                label="TEAM NAME"
                value={teamName}
                onChangeText={setTeamName}
                placeholder="e.g. Tag You're It"
                maxLength={40}
              />
              <Button
                title="Continue →"
                loading={createTeam.isPending}
                onPress={() => {
                  if (teamName.trim().length < 2) return Alert.alert('Name too short');
                  createTeam.mutate(teamName.trim());
                }}
              />
            </>
          )}
        </View>
      ) : null}

      {step === 1 ? (
        <View>
          <Text style={styles.title}>The rules in 20 seconds</Text>
          <RuleRow emoji="💷" text={`£${SQUAD_RULES.budget}m budget — spend it on ${SQUAD_RULES.size} players`} />
          <RuleRow emoji="🏉" text={`Max ${SQUAD_RULES.maxPerTeam} players from each real team`} />
          <RuleRow emoji="©" text="Your captain scores DOUBLE points" />
          <RuleRow emoji="⭐" text="Try 5 · Assist 3 · Conversion 2 · POTM 10 · Win 5" />
          <RuleRow emoji="⏱" text="Squads lock at Monday 18:30, every gameweek" />
          <Button title="Got it →" onPress={() => goTo(2)} />
        </View>
      ) : null}

      {step === 2 ? (
        <View>
          <Text style={styles.title}>Pick your {SQUAD_RULES.size}</Text>
          <Text style={styles.body}>
            {squadComplete
              ? 'Squad complete! 💪'
              : `You've picked ${squad.length}/${SQUAD_RULES.size}. The Squad Builder shows form,
                 ownership and your budget as you go.`}
          </Text>
          <Button
            title={squadComplete ? 'Review my squad' : `Open Squad Builder (${squad.length}/${SQUAD_RULES.size})`}
            onPress={() => router.push('/transfers')}
          />
          <Button
            title={squadComplete ? 'Continue →' : 'Skip for now'}
            variant={squadComplete ? 'primary' : 'ghost'}
            onPress={() => goTo(3)}
          />
        </View>
      ) : null}

      {step === 3 ? (
        <View>
          <Text style={styles.title}>Join your mates</Text>
          <Text style={styles.body}>
            Got a league code from your team or work? Pop it in — or skip and join later from the
            Leagues tab.
          </Text>
          <Input
            label="LEAGUE CODE"
            value={leagueCode}
            onChangeText={setLeagueCode}
            placeholder="e.g. AB12CD"
            autoCapitalize="characters"
            maxLength={8}
          />
          <Button
            title="Join league"
            loading={joinLeague.isPending}
            disabled={!leagueCode.trim()}
            onPress={() => joinLeague.mutate()}
          />
          <Button title="Finish 🏉" variant="secondary" onPress={() => goTo(null)} />
        </View>
      ) : null}

      <Pressable onPress={() => goTo(null)} style={styles.skipAll} accessibilityRole="button">
        <Text style={font.tiny}>Skip setup — I'll explore on my own</Text>
      </Pressable>
    </Screen>
  );
}

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <View style={styles.dots}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[styles.dot, i <= current && { backgroundColor: colors.accent }]}
        />
      ))}
    </View>
  );
}

function RuleRow({ emoji, text }: { emoji: string; text: string }) {
  return (
    <View style={styles.ruleRow}>
      <Text style={{ fontSize: 22 }}>{emoji}</Text>
      <Text style={[font.body, { flex: 1 }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dots: {
    flexDirection: 'row',
    gap: spacing(2),
    justifyContent: 'center',
    marginTop: spacing(4),
    marginBottom: spacing(6),
  },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.cardAlt },
  title: { ...font.h1, marginBottom: spacing(3) },
  body: { ...font.muted, marginBottom: spacing(4), lineHeight: 20 },
  ruleRow: {
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
  skipAll: { alignItems: 'center', marginTop: spacing(6) },
});
