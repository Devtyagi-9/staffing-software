import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';

interface ShiftsScreenProps {
  token: string;
  workerName: string;
  onLogout: () => void;
}

export default function ShiftsScreen({ token, workerName, onLogout }: ShiftsScreenProps) {
  const [shifts, setShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchShifts = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:4000/api/workers/my-shifts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setShifts(data);
      } else {
        Alert.alert('Error', data.error || 'Failed to fetch shifts');
      }
    } catch (err) {
      Alert.alert('Network Error', 'Could not fetch shifts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShifts();
  }, []);

  const handleClockInOut = async (shift: any, action: 'in' | 'out') => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Permission to access location was denied');
      return;
    }
    const location = await Location.getCurrentPositionAsync({});
    const lat = location.coords.latitude;
    const lng = location.coords.longitude;

    try {
      const endpoint = action === 'in' ? '/api/attendance/clock-in' : '/api/attendance/clock-out';
      const body = action === 'in'
        ? { assignment_id: shift.assignment_id, lat, lng }
        : { time_log_id: shift.time_log_id, lat, lng };

      const response = await fetch(`http://localhost:4000${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      
      if (response.ok) {
        Alert.alert('Success', `Clocked ${action} successfully!`);
        fetchShifts(); // Refresh
      } else {
        Alert.alert('Error', data.error || `Failed to clock ${action}`);
      }
    } catch (err) {
      Alert.alert('Network Error', `Could not clock ${action}`);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Welcome, {workerName}</Text>
        <TouchableOpacity onPress={onLogout}>
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={shifts}
          keyExtractor={(item) => item.assignment_id}
          contentContainerStyle={{ padding: 20 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.clientName}>{item.client_requirement.client.name}</Text>
              <Text style={styles.address}>{item.client_requirement.client.address_line}</Text>
              
              <View style={styles.timeRow}>
                <Text style={styles.timeText}>
                  {new Date(item.scheduled_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - 
                  {new Date(item.scheduled_end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
                <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
              </View>

              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.button, styles.clockInBtn]}
                  onPress={() => handleClockInOut(item, 'in')}
                >
                  <Text style={styles.buttonText}>Clock In</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.clockOutBtn]}
                  onPress={() => handleClockInOut(item, 'out')}
                >
                  <Text style={styles.buttonText}>Clock Out</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 50 }}>No shifts assigned.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    paddingTop: 60,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 3,
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#1f2937' },
  logoutText: { color: '#ef4444', fontWeight: 'bold' },
  card: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 2,
  },
  clientName: { fontSize: 18, fontWeight: 'bold', color: '#1f2937' },
  address: { fontSize: 14, color: '#6b7280', marginVertical: 6 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 10 },
  timeText: { fontSize: 16, color: '#4b5563', fontWeight: '500' },
  statusText: { fontSize: 14, color: '#10b981', fontWeight: 'bold' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  button: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
  clockInBtn: { backgroundColor: '#2563eb' },
  clockOutBtn: { backgroundColor: '#ef4444' },
  buttonText: { color: '#fff', fontWeight: 'bold' },
});
