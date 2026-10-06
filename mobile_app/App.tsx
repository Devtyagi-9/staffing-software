import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import LoginScreen from './src/screens/LoginScreen';
import ShiftsScreen from './src/screens/ShiftsScreen';
import {
  registerForPushNotificationsAsync,
  savePushTokenToServer,
  clearPushTokenFromServer,
} from './src/utils/pushNotifications';

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [workerName, setWorkerName] = useState<string>('');

  // Refs for notification listeners (must be cleaned up on unmount)
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    // Listen for incoming push notifications (while app is in foreground)
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log('[Push] Notification received in foreground:', notification);
    });

    // Listen for when user taps a notification (foreground or background)
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as any;
      console.log('[Push] Notification tapped. Data:', data);
      // You can navigate to a specific screen here based on data.type
      // e.g., if (data.type === 'NEW_SHIFT') navigate to ShiftsScreen
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  const handleLoginSuccess = async (newToken: string, name: string) => {
    setToken(newToken);
    setWorkerName(name);

    // Request push permission and register token with server
    const pushToken = await registerForPushNotificationsAsync();
    if (pushToken) {
      await savePushTokenToServer(pushToken, newToken);
    }
  };

  const handleLogout = async () => {
    // Remove push token from server before clearing local state
    if (token) {
      await clearPushTokenFromServer(token);
    }
    setToken(null);
    setWorkerName('');
  };

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      {token ? (
        <ShiftsScreen token={token} workerName={workerName} onLogout={handleLogout} />
      ) : (
        <LoginScreen onLoginSuccess={handleLoginSuccess} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
