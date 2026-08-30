import React, { useEffect, useMemo, useState } from 'react';
import {
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { openAppUpdatePage } from '../services/app-update-service';
import { radius, useTheme } from '../theme';

const AppUpdateGate = ({ update, onRetry }) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState('');

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, []);

  const handleUpdate = async () => {
    setOpening(true);
    setOpenError('');
    const opened = await openAppUpdatePage(update.updateUrl);
    if (!opened) {
      setOpenError('The update page could not be opened. Check your connection and try again.');
    }
    setOpening(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.iconCircle}>
            <Ionicons name="cloud-download-outline" size={34} color={colors.primary} />
          </View>

          <Text style={styles.title} accessibilityRole="header">
            Update required
          </Text>
          <Text style={styles.message} selectable>
            {update.message}
          </Text>
          <Text style={styles.reassurance} selectable>
            Updating LockNote will not delete the notes stored on this device.
          </Text>

          <View style={styles.versionCard}>
            <Text style={styles.versionLabel}>Installed build</Text>
            <Text style={styles.versionValue}>{update.currentBuildVersion}</Text>
            <Ionicons name="arrow-forward" size={17} color={colors.textTertiary} />
            <Text style={styles.versionLabel}>Required build</Text>
            <Text style={styles.versionValue}>{update.minimumVersionCode}</Text>
          </View>

          {!!openError && (
            <Text style={styles.error} accessibilityRole="alert" selectable>
              {openError}
            </Text>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressed,
              opening && styles.disabled,
            ]}
            onPress={handleUpdate}
            disabled={opening}
            accessibilityRole="button"
            accessibilityLabel="Update LockNote"
            accessibilityState={{ disabled: opening, busy: opening }}
          >
            <Ionicons name="download-outline" size={20} color={colors.card} />
            <Text style={styles.primaryButtonText}>
              {opening ? 'Opening update…' : 'Update LockNote'}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            onPress={() => onRetry({ force: true })}
            disabled={update.checking}
            accessibilityRole="button"
            accessibilityState={{ disabled: update.checking, busy: update.checking }}
          >
            <Text style={styles.retryButtonText}>
              {update.checking ? 'Checking…' : 'I updated — check again'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const makeStyles = (colors) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    alignItems: 'center',
    gap: 14,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
  },
  iconCircle: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  reassurance: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  versionCard: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 13,
    borderRadius: radius.md,
    backgroundColor: colors.inputBg,
  },
  versionLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  versionValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  primaryButton: {
    width: '100%',
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    color: colors.card,
    fontSize: 16,
    fontWeight: '700',
  },
  retryButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  retryButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.55 },
});

export default AppUpdateGate;
