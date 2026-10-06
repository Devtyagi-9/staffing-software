import fetch from 'node-fetch';

// ---------------------------------------------------------------------------
// Expo Push Notification Service
// Sends push notifications to workers via Expo's free push infrastructure.
// No Firebase/APNS setup required – Expo handles the routing to both
// iOS (APNs) and Android (FCM) automatically.
// ---------------------------------------------------------------------------

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
}

/**
 * Send a push notification to one Expo push token.
 * Returns true if accepted by Expo, false on failure.
 */
export async function sendPushNotification(
  expoPushToken: string | null | undefined,
  payload: PushPayload
): Promise<boolean> {
  if (!expoPushToken) return false;

  // Expo only accepts tokens starting with "ExponentPushToken[" or "ExpoPushToken["
  if (!expoPushToken.startsWith('ExponentPushToken[') && !expoPushToken.startsWith('ExpoPushToken[')) {
    console.warn(`[NotificationService] Invalid Expo push token format: ${expoPushToken}`);
    return false;
  }

  const message = {
    to: expoPushToken,
    sound: 'default',
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    priority: 'high',
  };

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json() as any;

    if (result?.data?.status === 'error') {
      console.error(`[NotificationService] Expo push error for token ${expoPushToken}:`, result.data.message);
      return false;
    }

    console.log(`[NotificationService] Push sent → ${expoPushToken} | "${payload.title}"`);
    return true;
  } catch (err) {
    console.error('[NotificationService] Failed to send push notification:', err);
    return false;
  }
}

/**
 * Send push notifications to multiple Expo push tokens in a single batch request.
 * Expo supports up to 100 messages per batch.
 */
export async function sendBatchPushNotifications(
  tokens: (string | null | undefined)[],
  payload: PushPayload
): Promise<void> {
  const validTokens = tokens.filter(
    (t): t is string =>
      typeof t === 'string' &&
      (t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['))
  );

  if (validTokens.length === 0) return;

  const messages = validTokens.map((token) => ({
    to: token,
    sound: 'default',
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    priority: 'high',
  }));

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const result = await response.json() as any;
    console.log(`[NotificationService] Batch push sent to ${validTokens.length} device(s).`, result?.data);
  } catch (err) {
    console.error('[NotificationService] Failed to send batch push notifications:', err);
  }
}
