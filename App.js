import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { initDB } from './src/db/sqlite';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initDB()
      .then(() => setReady(true))
      .catch((err) => {
        console.error('Failed to initialize database:', err);
      });
  }, []);

  if (!ready) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <>
      <AppNavigator />
      <StatusBar style="auto" />
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
