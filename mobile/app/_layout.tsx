// Root layout — providers + guarded navigation + push-notification routing.
import React from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/store/AuthContext';
import { routeFromResponse } from '@/lib/notificationRouter';
import { colors } from '@/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 2 },
  },
});

function RootNavigator() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  React.useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, loading, segments]);

  // Push-notification tap routing (requires a signed-in session)
  React.useEffect(() => {
    if (loading || !session) return;

    // Warm start: app was open/backgrounded when the user tapped
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = routeFromResponse(response);
      if (route) router.push(route as any);
    });

    // Cold start: app launched by tapping a notification
    Notifications.getLastNotificationResponseAsync().then((response) => {
      const route = routeFromResponse(response);
      if (route) router.push(route as any);
    });

    return () => sub.remove();
  }, [session, loading]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="player/[id]" options={{ title: 'Player' }} />
      <Stack.Screen name="team/[id]" options={{ title: 'Team' }} />
      <Stack.Screen name="league/[id]" options={{ title: 'League' }} />
      <Stack.Screen name="transfers" options={{ title: 'Squad Builder', presentation: 'modal' }} />
      <Stack.Screen name="admin" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </AuthProvider>
    </QueryClientProvider>
  );
}
