// Admin layout — guards on profiles.is_admin, then renders a simple stack.
import React from 'react';
import { Stack, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { useAuth } from '@/store/AuthContext';
import { Button, Screen } from '@/components/ui';
import { colors, font } from '@/theme';

export default function AdminLayout() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  if (loading) return null;

  if (!profile?.is_admin) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 44 }}>🔒</Text>
          <Text style={[font.h2, { marginTop: 12 }]}>Admins only</Text>
          <Button title="Back" variant="ghost" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Admin' }} />
      <Stack.Screen name="players" options={{ title: 'Manage Players & Teams' }} />
      <Stack.Screen name="fixtures" options={{ title: 'Manage Fixtures' }} />
      <Stack.Screen name="results" options={{ title: 'Enter Results & Stats' }} />
    </Stack>
  );
}
