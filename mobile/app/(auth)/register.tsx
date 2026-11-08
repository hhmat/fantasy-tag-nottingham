// Register — email sign-up (+ Google via the login screen).
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { signUpWithEmail } from '@/api/auth';
import { Button, Input, Screen } from '@/components/ui';
import { colors, font, spacing } from '@/theme';

export default function RegisterScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleRegister() {
    if (!name.trim() || !email || password.length < 6) {
      return Alert.alert('Check details', 'Name, valid email and a 6+ character password are required.');
    }
    setBusy(true);
    try {
      const data = await signUpWithEmail(email.trim(), password, name.trim());
      if (data.session) {
        // Email confirmation off — signed in already, start onboarding.
        router.replace('/onboarding');
      } else {
        Alert.alert('Welcome!', 'Check your inbox to confirm your email, then sign in.');
      }
    } catch (e: any) {
      Alert.alert('Registration failed', e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text style={[font.h1, { marginTop: spacing(6), marginBottom: spacing(4) }]}>Create account</Text>
      <Input label="DISPLAY NAME" value={name} onChangeText={setName} placeholder="Tag Legend" />
      <Input label="EMAIL" value={email} onChangeText={setEmail} autoCapitalize="none"
        keyboardType="email-address" placeholder="you@example.com" />
      <Input label="PASSWORD" value={password} onChangeText={setPassword} secureTextEntry
        placeholder="Min. 6 characters" />
      <Button title="Create account" onPress={handleRegister} loading={busy} />
      <View style={styles.footer}>
        <Text style={font.muted}>Already registered? </Text>
        <Link href="/(auth)/login" style={{ color: colors.accent, fontWeight: '700' }}>
          Sign in
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing(5) },
});
