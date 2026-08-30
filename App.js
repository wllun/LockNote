import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initDB } from './src/db/sqlite';
import AppNavigator from './src/navigation/AppNavigator';
import { ThemeProvider, useTheme, useThemeMode } from './src/theme';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AppDialogHost from './src/components/AppDialogHost';
import LockPasswordResetModal from './src/components/lock-password-reset-modal';
import AppUpdateGate from './src/components/app-update-gate';
import { trashService } from './src/services/trashService';
import { useAppUpdate } from './src/hooks/use-app-update';

function AppRoot() {
  const colors = useTheme();
  const { scheme } = useThemeMode();
  const { recoveringLockPassword } = useAuth();
  const [ready, setReady] = useState(false);
  const appUpdate = useAppUpdate();

  useEffect(() => {
    initDB()
      .then(async () => {
        try {
          await trashService.purgeExpired();
        } catch (error) {
          console.warn('Failed to clean expired trash:', error);
        }
        setReady(true);
      })
      .catch((err) => {
        console.error('Failed to initialize database:', err);
      });
  }, []);

  if (!ready || !appUpdate.checked) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (appUpdate.required) {
    return (
      <SafeAreaProvider>
        <AppUpdateGate update={appUpdate} onRetry={appUpdate.refresh} />
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <AppNavigator />
      <LockPasswordResetModal visible={recoveringLockPassword} />
      <AppDialogHost />
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <ThemeProvider>
        <AuthProvider>
          <AppRoot />
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
