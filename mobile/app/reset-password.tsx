// Reset password — landed from a recovery email (via /auth/callback).
// The recovery session is already active; updateUser sets the new password.
import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Button, Input, Screen } from '@/components/ui';
import { font, spacing } from '@/theme';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleUpdate() {
    if (password.length < 6) {
      return Alert.alert('Too short', 'Password must be at least 6 characters.');
    }
    if (password !== confirm) {
      return Alert.alert('Mismatch', 'Passwords do not match.');
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      Alert.alert('Password updated', 'You are now signed in with your new password.');
      router.replace('/(tabs)');
    } catch (e: any) {
      Alert.alert('Could not update password', e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ marginTop: spacing(8), marginBottom: spacing(6) }}>
        <Text style={[font.h1, { textAlign: 'center' }]}>Choose a new password</Text>
        <Text style={[font.muted, { textAlign: 'center', marginTop: spacing(1) }]}>
          You arrived here from a password-reset email.
        </Text>
      </View>

      <Input
        label="NEW PASSWORD"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="At least 6 characters"
      />
      <Input
        label="CONFIRM PASSWORD"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        placeholder="Repeat it"
      />

      <Button title="Update password" onPress={handleUpdate} loading={busy} />
      <Button title="Back to sign in" variant="ghost" onPress={() => router.replace('/(auth)/login')} />
    </Screen>
  );
}
