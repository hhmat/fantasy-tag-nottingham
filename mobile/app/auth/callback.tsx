// Auth callback — landing route for OAuth sign-in, email confirmation and
// password-recovery links (web). Exchanges the PKCE code, then routes on.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, font, spacing } from '@/theme';

export default function AuthCallback() {
  const router = useRouter();
  const [message, setMessage] = useState('Signing you in…');

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      router.replace('/(tabs)');
      return;
    }

    let done = false;
    const go = (path: '/reset-password' | '/(tabs)') => {
      if (!done) {
        done = true;
        router.replace(path);
      }
    };

    // Recovery sessions surface as a dedicated auth event after exchange.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') go('/reset-password');
    });

    (async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }
        if (url.searchParams.get('type') === 'recovery') {
          go('/reset-password');
        } else {
          // Give a PASSWORD_RECOVERY event a beat to win the race.
          setTimeout(() => go('/(tabs)'), 400);
        }
      } catch (e: any) {
        setMessage(e?.message ?? 'Sign-in failed. Please go back and try again.');
      }
    })();

    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing(6),
      }}
    >
      <ActivityIndicator color={colors.accent} size="large" />
      <Text style={[font.muted, { marginTop: spacing(3), textAlign: 'center' }]}>{message}</Text>
    </View>
  );
}
