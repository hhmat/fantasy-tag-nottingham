// Maps push-notification data payloads to app routes.
// Payloads are set by the edge functions:
//   weekly-reminders → { screen, gameweek }
//   spawtz-sync      → { screen: '/admin' }
import * as Notifications from 'expo-notifications';

// Only routes on this list may be pushed to — guards against bad payloads.
const ALLOWED_ROUTES = new Set([
  '/(tabs)',
  '/(tabs)/squad',
  '/(tabs)/players',
  '/(tabs)/fixtures',
  '/(tabs)/leagues',
  '/transfers',
  '/admin',
]);

export function routeForNotification(
  data: Record<string, unknown> | undefined,
): string | null {
  if (!data) return null;

  if (typeof data.screen === 'string' && ALLOWED_ROUTES.has(data.screen)) {
    return data.screen;
  }
  // Legacy payloads that only carry a gameweek → open that week's fixtures
  if (typeof data.gameweek === 'number') return '/(tabs)/fixtures';
  return null;
}

export function routeFromResponse(
  response: Notifications.NotificationResponse | null,
): string | null {
  if (!response) return null;
  const data = response.notification.request.content.data as
    | Record<string, unknown>
    | undefined;
  return routeForNotification(data);
}
