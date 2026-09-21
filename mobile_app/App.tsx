import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import LoginScreen from './src/screens/LoginScreen';
import ShiftsScreen from './src/screens/ShiftsScreen';

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [workerName, setWorkerName] = useState<string>('');

  const handleLoginSuccess = (newToken: string, name: string) => {
    setToken(newToken);
    setWorkerName(name);
  };

  const handleLogout = () => {
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

