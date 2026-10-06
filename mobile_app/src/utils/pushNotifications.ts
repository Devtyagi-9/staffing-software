import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Configure how notifications are displayed when the app is in the foreground
// ---------------------------------------------------------------------------
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const API_BASE = 'http://localhost:4000';

/**
 * Gets the Expo Project ID from app.json (extra.eas.projectId).
 *
 * Why this matters in production:
 * - The project ID is ONE value for your entire app — not per-worker.
 * - Each worker's DEVICE generates its own unique ExponentPushToken[...]
 *   using this shared project ID as a namespace.
 * - This token is what gets saved to the server per-worker.
 */
function getProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId
  );
}

/**
 * Requests push notification permission from the OS and returns the
 * Expo push token string for this specific device, or null if denied.
 *
 * The returned token is DEVICE-SPECIFIC — each worker's phone produces
 * a different token even though they all share the same Project ID.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Android: create a dedicated notification channel for shift alerts
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('shifts', {
      name: 'Shift Notifications',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2563EB',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('[Push] Permission not granted. Push notifications will not work.');
    return null;
  }

  const projectId = getProjectId();

  if (!projectId || projectId === 'REPLACE_WITH_YOUR_EXPO_PROJECT_ID') {
    console.warn(
      '[Push] Expo Project ID is not configured. ' +
      'Set extra.eas.projectId in app.json to enable push notifications in production. ' +
      'Push notifications will be skipped.'
    );
    return null;
  }

  try {
    // Explicitly pass projectId so this works in production standalone builds.
    // Expo uses this to route push tokens to the correct app on APNs/FCM.
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    console.log('[Push] Expo push token for this device:', tokenData.data);
    return tokenData.data;
  } catch (err) {
    console.error('[Push] Failed to get Expo push token:', err);
    return null;
  }
}

/**
 * Saves this device's Expo push token to the server, linked to the
 * authenticated worker's user account.
 *
 * - One token per device. If a worker logs in on a new phone, the old
 *   token is automatically overwritten with the new one.
 * - The server uses this token to send targeted push to the right device.
 */
export async function savePushTokenToServer(token: string, authToken: string): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/api/notifications/register-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ push_token: token }),
    });
    if (response.ok) {
      console.log('[Push] Token registered with server successfully.');
    } else {
      const err = await response.json();
      console.error('[Push] Failed to register token:', err);
    }
  } catch (err) {
    console.error('[Push] Network error while registering token:', err);
  }
}

/**
 * Removes the push token from the server on logout so the device
 * stops receiving notifications when the worker is not logged in.
 *
 * This is important: without this, a logged-out worker would still
 * receive shift notifications meant for whoever is next logged in on
 * a shared device.
 */
export async function clearPushTokenFromServer(authToken: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/notifications/register-token`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    console.log('[Push] Token cleared from server on logout.');
  } catch (err) {
    console.error('[Push] Failed to clear push token on logout:', err);
  }
}
