// Login — email + Google.
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { signInWithEmail, signInWithGoogle, resetPassword } from '@/api/auth';
import { Button, Input, Screen } from '@/components/ui';
import { colors, font, spacing } from '@/theme';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'email' | 'google' | null>(null);

  async function handleEmail() {
    if (!email || !password) return Alert.alert('Missing details', 'Enter your email and password.');
    setBusy('email');
    try {
      await signInWithEmail(email.trim(), password);
      // navigation handled by the root auth guard
    } catch (e: any) {
      Alert.alert('Sign-in failed', e.message);
    } finally {
      setBusy(null);
    }
  }

  async function handleGoogle() {
    setBusy('google');
    try {
      await signInWithGoogle();
    } catch (e: any) {
      if (e.message !== 'Sign-in cancelled') Alert.alert('Google sign-in failed', e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={{ fontSize: 56 }}>🏉</Text>
        <Text style={[font.h1, { textAlign: 'center' }]}>Fantasy Tag{'\n'}Nottingham</Text>
        <Text style={[font.muted, { textAlign: 'center', marginTop: spacing(1) }]}>
          Build your dream tag rugby squad
        </Text>
      </View>

      <Input label="EMAIL" value={email} onChangeText={setEmail} autoCapitalize="none"
        keyboardType="email-address" placeholder="you@example.com" />
      <Input label="PASSWORD" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />

      <Button title="Sign in" onPress={handleEmail} loading={busy === 'email'} />
      <Button title="Continue with Google" onPress={handleGoogle} variant="secondary" loading={busy === 'google'} />
      <Button
        title="Forgot password?"
        variant="ghost"
        onPress={() => {
          if (!email) return Alert.alert('Enter your email first');
          resetPassword(email.trim())
            .then(() => Alert.alert('Reset email sent'))
            .catch((e) => Alert.alert('Error', e.message));
        }}
      />

      <View style={styles.footer}>
        <Text style={font.muted}>New here? </Text>
        <Link href="/(auth)/register" style={{ color: colors.accent, fontWeight: '700' }}>
          Create an account
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginTop: spacing(8), marginBottom: spacing(6) },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing(5) },
});
