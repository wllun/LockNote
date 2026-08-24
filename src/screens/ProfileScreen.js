import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AppAlert as Alert } from '../utils/app-alert';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { syncService } from '../services/syncService';
import { syncErrorMessage } from '../utils/private-sync.mjs';
import { radius, shadow, useTheme } from '../theme';

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

  useEffect(() => {
    let active = true;
    syncService.getLastSyncAt(user?.id)
      .then((value) => { if (active) setLastSyncAt(value); })
      .catch(() => { if (active) setLastSyncAt(null); });
    return () => { active = false; };
  }, [user?.id]);

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await syncService.syncAll();
      setLastSyncAt(result.syncedAt);
      Alert.alert(
        'Sync complete',
        `${result.notes} ${result.notes === 1 ? 'note' : 'notes'} and ${result.folders} ${result.folders === 1 ? 'folder' : 'folders'} are up to date.`,
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
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={36} color={colors.primary} />
        </View>
        <Text style={styles.email}>{user?.email}</Text>
        <Text style={styles.memberSince}>Member since {formatDate(user?.created_at)}</Text>
      </View>

      <View style={styles.card}>
        <TouchableOpacity
          style={[styles.item, syncing && styles.itemDisabled]}
          activeOpacity={0.7}
          onPress={handleSync}
          disabled={syncing}
          accessibilityRole="button"
          accessibilityLabel="Sync notes and folders"
          accessibilityState={{ busy: syncing, disabled: syncing }}
        >
          <View style={[styles.iconCircle, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="cloud-upload-outline" size={19} color={colors.primary} />
          </View>
          <View style={styles.itemContent}>
            <Text style={styles.itemLabel}>Sync Notes</Text>
            <Text style={styles.itemDescription} numberOfLines={1}>
              {syncing ? 'Merging local and cloud changes…' : formatSyncDate(lastSyncAt)}
            </Text>
          </View>
          {syncing
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <Ionicons name="cloud-upload-outline" size={20} color={colors.textTertiary} />}
        </TouchableOpacity>
      </View>

      <Text style={styles.syncNotice}>
        Sync stores note and folder data in your LockNote account. LockNote does not
        end-to-end encrypt note content before upload. Reminder notifications stay on
        the device where they were scheduled.
      </Text>

      <TouchableOpacity
        style={styles.signOutButton}
        activeOpacity={0.7}
        onPress={handleSignOut}
        disabled={syncing}
      >
        <Ionicons name="log-out-outline" size={18} color={colors.danger} />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
};

const makeStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      padding: 16,
    },
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
