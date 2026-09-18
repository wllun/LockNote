import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AppAlert as Alert } from '../utils/app-alert';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { syncService } from '../services/syncService';
import { syncErrorMessage } from '../utils/private-sync.mjs';
import { radius, shadow, useTheme } from '../theme';
import { useAutomaticSync } from '../context/AutomaticSyncContext';
import { subscribeSyncEvents } from '../services/syncActivity.mjs';

const automaticStatusText = (sync) => {
  if (!sync.loaded) return 'Loading sync preference…';
  if (!sync.enabled) return 'Off — tap to enable with Plus or Pro';
  const labels = {
    loading: 'Waiting for account readiness…', syncing: 'Syncing notes and folders…',
    offline: 'Offline — will sync when connected', 'paused-plan': 'Paused — requires active Plus or Pro',
    'waiting-editor': 'Waiting until you close the note editor', background: 'Waiting for background execution or app resume',
    'recovery-only': 'Cloud downloaded; uploads paused by your plan or storage limit',
  };
  if (sync.state.status === 'retrying') return `Sync failed — retry scheduled. ${syncErrorMessage(sync.state.error)}`;
  return labels[sync.state.status] ?? 'On — syncs automatically when connected';
};

const formatDate = (dateString) => {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatSyncDate = (dateString) => {
  if (!dateString) return 'Not synced yet';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Not synced yet';
  return `Last synced ${date.toLocaleString()}`;
};

const ProfileScreen = () => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { session } = useAuth();
  const user = session?.user;
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const automaticSync = useAutomaticSync();
  const syncBusy = syncing || automaticSync.busy;

  useEffect(() => {
    let active = true;
    syncService.getLastSyncAt(user?.id)
      .then((value) => { if (active) setLastSyncAt(value); })
      .catch(() => { if (active) setLastSyncAt(null); });
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => subscribeSyncEvents((event) => {
    if (event.userId === user?.id && event.type === 'success') setLastSyncAt(event.result.syncedAt);
  }), [user?.id]);

  const toggleAutomaticSync = async () => {
    try { await automaticSync.setEnabled(!automaticSync.enabled); }
    catch (error) { Alert.alert('Automatic sync unavailable', error?.message || 'Please try again.'); }
  };

  const handleSync = async () => {
    if (syncBusy) return;
    setSyncing(true);
    try {
      const result = await syncService.syncAll();
      setLastSyncAt(result.syncedAt);
      Alert.alert(
        result.recoveryOnly ? 'Cloud notes recovered' : 'Sync complete',
        result.recoveryOnly
          ? 'Cloud notes were downloaded. Your local changes are safe but were not uploaded because of your plan or storage limit. See Premium to resume full sync.'
          : `${result.notes} ${result.notes === 1 ? 'note' : 'notes'} and ${result.folders} ${result.folders === 1 ? 'folder' : 'folders'} are up to date.`,
      );
    } catch (error) {
      Alert.alert('Sync failed', syncErrorMessage(error));
    } finally {
      setSyncing(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => supabase.auth.signOut(),
      },
    ], {
      variant: 'danger',
      iconName: 'log-out-outline',
      details: [{ label: 'Account', value: user?.email || 'Current account' }],
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={36} color={colors.primary} />
        </View>
        <Text style={styles.email}>{user?.email}</Text>
        <Text style={styles.memberSince}>Member since {formatDate(user?.created_at)}</Text>
      </View>

      <View style={styles.card}>
        <TouchableOpacity
          style={[styles.item, syncBusy && styles.itemDisabled]}
          activeOpacity={0.7}
          onPress={handleSync}
          disabled={syncBusy}
          accessibilityRole="button"
          accessibilityLabel="Sync notes and folders"
          accessibilityState={{ busy: syncBusy, disabled: syncBusy }}
        >
          <View style={[styles.iconCircle, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="cloud-upload-outline" size={19} color={colors.primary} />
          </View>
          <View style={styles.itemContent}>
            <Text style={styles.itemLabel}>Sync Notes</Text>
            <Text style={styles.itemDescription} numberOfLines={1}>
              {syncBusy ? 'Merging local and cloud changes…' : formatSyncDate(automaticSync.lastSyncAt || lastSyncAt)}
            </Text>
          </View>
          {syncBusy
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <Ionicons name="cloud-upload-outline" size={20} color={colors.textTertiary} />}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.item, styles.automaticItem, (!automaticSync.loaded || automaticSync.changing) && styles.itemDisabled]}
          onPress={toggleAutomaticSync}
          activeOpacity={0.7}
          disabled={!automaticSync.loaded || automaticSync.changing}
          accessibilityRole="switch"
          accessibilityLabel="Automatic sync"
          accessibilityHint="Syncs note and folder data to your account with Plus or Pro. Tap to turn on or off."
          accessibilityState={{ checked: automaticSync.enabled, disabled: !automaticSync.loaded || automaticSync.changing }}
        >
          <View style={[styles.iconCircle, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="sync-outline" size={19} color={colors.primary} />
          </View>
          <View style={styles.itemContent}>
            <Text style={styles.itemLabel}>Automatic Sync</Text>
            <Text style={styles.itemDescription}>{automaticStatusText(automaticSync)}</Text>
          </View>
          {automaticSync.changing ? <ActivityIndicator size="small" color={colors.primary} />
            : <Text style={styles.syncToggleLabel}>{automaticSync.enabled ? 'On' : 'Off'}</Text>}
        </TouchableOpacity>
      </View>

      {automaticSync.enabled && (
        <Text style={styles.syncNotice}>
          Notes and folders sync on app resume, reconnect, and periodically while no note editor is open.
          Background timing is controlled by Android/iOS. Images sync when you open a note or use Sync Notes.
          {automaticSync.backgroundStatus === 'unavailable' || automaticSync.backgroundStatus === 'restricted'
            ? ' OS background sync is unavailable here; automatic sync still works while the app is open.' : ''}
        </Text>
      )}

      <Text style={styles.syncNotice}>
        Sync stores note and folder data in your LockNote account. LockNote does not
        end-to-end encrypt note content before upload. Reminder notifications stay on
        the device where they were scheduled.
      </Text>

      <TouchableOpacity
        style={styles.signOutButton}
        activeOpacity={0.7}
        onPress={handleSignOut}
        disabled={syncBusy}
      >
        <Ionicons name="log-out-outline" size={18} color={colors.danger} />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const makeStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: { padding: 16, paddingBottom: 32 },
    automaticItem: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    syncToggleLabel: { marginLeft: 8, fontSize: 14, fontWeight: '600', color: colors.primary },
    header: {
      alignItems: 'center',
      marginTop: 24,
      marginBottom: 24,
    },
    avatar: {
      width: 76,
      height: 76,
      borderRadius: radius.full,
      backgroundColor: colors.primarySoft,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
    },
    email: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    memberSince: {
      fontSize: 13,
      color: colors.textTertiary,
      marginTop: 4,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      overflow: 'hidden',
      ...shadow.card,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
    },
    itemDisabled: {
      opacity: 0.7,
    },
    iconCircle: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    itemContent: {
      flex: 1,
      marginLeft: 12,
    },
    itemLabel: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
    },
    itemDescription: {
      fontSize: 13,
      color: colors.textTertiary,
      marginTop: 2,
    },
    syncNotice: {
      color: colors.textTertiary,
      fontSize: 12,
      lineHeight: 17,
      marginHorizontal: 4,
      marginTop: 12,
    },
    signOutButton: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      padding: 16,
      marginTop: 24,
    },
    signOutText: {
      color: colors.danger,
      fontSize: 16,
      fontWeight: '600',
    },
  });

export default ProfileScreen;
