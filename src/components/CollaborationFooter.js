import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { noteRepo } from '../db/noteRepo';
import { collaborationService } from '../services/collaborationService';
import {
  formatCollaborativeEdit,
  isReadOnlyCollaborativeNote,
} from '../utils/collaboration-note.mjs';
import { getNetworkAvailability } from '../utils/network-availability.mjs';
import { useTheme } from '../theme';

const LEASE_RENEW_INTERVAL_MS = 30_000;

const CollaborationFooter = ({ noteId, onRemoteNote, onEditAccessChange, onOffline }) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { session } = useAuth();
  const network = useNetInfo();
  const online = getNetworkAvailability(network);
  const [appState, setAppState] = useState(AppState.currentState);
  const [note, setNote] = useState(null);
  const [access, setAccess] = useState({ status: 'checking', canEdit: false });
  const [resolving, setResolving] = useState(false);
  const callbackRef = useRef(onRemoteNote);
  const accessCallbackRef = useRef(onEditAccessChange);
  const offlineCallbackRef = useRef(onOffline);
  const offlineNotifiedRef = useRef(false);
  const ownsLeaseRef = useRef(false);
  const onlineRef = useRef(online);
  const appStateRef = useRef(appState);
  const syncRef = useRef(() => {});
  callbackRef.current = onRemoteNote;
  accessCallbackRef.current = onEditAccessChange;
  offlineCallbackRef.current = onOffline;
  onlineRef.current = online;
  appStateRef.current = appState;

  const publishAccess = useCallback((nextAccess) => {
    setAccess(nextAccess);
    accessCallbackRef.current?.(nextAccess);
  }, []);

  const releaseLease = useCallback(() => {
    if (!ownsLeaseRef.current) return;
    ownsLeaseRef.current = false;
    collaborationService.releaseEditLease(noteId).catch(() => {});
  }, [noteId]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let mounted = true;
    let syncing = false;

    const sync = async ({ renewLease = true } = {}) => {
      if (syncing) return;
      syncing = true;
      try {
        const pauseForAvailability = () => {
          releaseLease();
          const inactiveStatus = onlineRef.current === false
            ? 'offline'
            : appStateRef.current !== 'active'
              ? 'paused'
              : 'checking';
          publishAccess({
            collaborative: true,
            status: inactiveStatus,
            canEdit: false,
          });
          if (onlineRef.current === false && !offlineNotifiedRef.current) {
            offlineNotifiedRef.current = true;
            offlineCallbackRef.current?.();
          }
        };

        const local = await noteRepo.getById(noteId);
        if (!mounted) return;
        setNote(local);
        if (!local?.cloud_id) {
          publishAccess({ collaborative: false, status: 'private', canEdit: true });
          return;
        }

        if (onlineRef.current !== true || appStateRef.current !== 'active') {
          pauseForAvailability();
          return;
        }

        offlineNotifiedRef.current = false;

        const lease = ownsLeaseRef.current && !renewLease
          ? { collaborative: true, canEdit: true, reason: 'owner', acquired: true }
          : await collaborationService.acquireEditLease(noteId);
        if (!mounted) return;
        ownsLeaseRef.current = lease.canEdit === true;
        if (onlineRef.current !== true || appStateRef.current !== 'active') {
          pauseForAvailability();
          return;
        }

        const result = await collaborationService.refreshNote(noteId);
        if (!mounted) return;
        if (onlineRef.current !== true || appStateRef.current !== 'active') {
          pauseForAvailability();
          return;
        }
        setNote(result.note);
        if (result.changed) await callbackRef.current?.(result.note);
        if (isReadOnlyCollaborativeNote(result.note)) {
          releaseLease();
          publishAccess({ collaborative: true, status: 'viewer', canEdit: false });
          return;
        }
        publishAccess({
          ...lease,
          status: lease.reason,
          canEdit: lease.canEdit === true,
        });
      } catch (error) {
        if (!mounted) return;
        ownsLeaseRef.current = false;
        publishAccess({
          collaborative: true,
          status: onlineRef.current === false ? 'offline' : 'unavailable',
          canEdit: false,
          message: error?.message || 'Shared editing is temporarily unavailable.',
        });
        noteRepo.getById(noteId).then((local) => {
          if (mounted) setNote(local);
        }).catch(() => {});
      } finally {
        syncing = false;
      }
    };

    syncRef.current = sync;
    sync();
    const unsubscribeCloud = collaborationService.subscribe((payload) => {
      const eventHasLockState = payload?.new
        && Object.prototype.hasOwnProperty.call(payload.new, 'edit_lock_user_id');
      const lockMovedElsewhere = eventHasLockState
        && payload.new.edit_lock_user_id !== session?.user?.id;
      sync({ renewLease: !ownsLeaseRef.current || lockMovedElsewhere });
    });
    const renewal = setInterval(() => sync(), LEASE_RENEW_INTERVAL_MS);
    return () => {
      mounted = false;
      syncRef.current = () => {};
      clearInterval(renewal);
      unsubscribeCloud();
      releaseLease();
    };
  }, [noteId, publishAccess, releaseLease, session?.user?.id]);

  useEffect(() => {
    if (online !== true || appState !== 'active') releaseLease();
    syncRef.current();
  }, [appState, online, releaseLease]);

  const refreshLocal = () => noteRepo.getById(noteId).then(setNote).catch(() => {});
  const message = formatCollaborativeEdit(note, session?.user?.email);
  if (!note?.cloud_id) return null;

  const isRoleReadOnly = isReadOnlyCollaborativeNote(note);
  const lockHolder = access.lock_user_email || 'Another collaborator';
  const statusMessage = access.status === 'offline'
    ? 'Connect to the internet to access shared editing'
    : access.status === 'paused'
      ? 'Shared editing is paused while LockNote is in the background'
      : access.status === 'locked'
        ? `${lockHolder} is editing · View only`
        : access.status === 'checking'
          ? 'Checking shared edit access'
          : access.status === 'unavailable'
            ? access.message
            : note.sync_status === 'conflict'
              ? 'This note also changed elsewhere · Your draft is preserved'
              : note.sync_status === 'pending'
                ? 'Waiting to sync'
                : `${isRoleReadOnly ? 'View only · ' : ''}${message || 'Shared note · Waiting for the first synced edit'}`;

  const resolve = async (strategy) => {
    setResolving(true);
    try {
      const resolved = await collaborationService.resolveConflict(noteId, strategy);
      setNote(resolved);
      await callbackRef.current?.(resolved);
    } catch {
      refreshLocal();
    } finally {
      setResolving(false);
    }
  };

  const statusIcon = access.status === 'offline' || note.sync_status === 'pending'
    ? 'cloud-offline-outline'
    : access.status === 'locked'
      ? 'lock-closed-outline'
      : 'people-outline';

  return (
    <View style={styles.container}>
      <View style={styles.statusRow}>
        <Ionicons
          name={statusIcon}
          size={14}
          color={note.sync_status === 'conflict' ? colors.danger : colors.textTertiary}
        />
        <Text
          style={[styles.text, note.sync_status === 'conflict' && { color: colors.danger }]}
          numberOfLines={2}
          accessibilityLiveRegion="polite"
        >
          {statusMessage}
        </Text>
      </View>
      {note.sync_status === 'conflict' && online === true && (
        <View style={styles.actions}>
          <Pressable
            style={styles.actionButton}
            disabled={resolving}
            onPress={() => resolve('remote')}
            accessibilityRole="button"
            accessibilityLabel="Use latest shared note"
          >
            <Text style={styles.actionText}>Use latest</Text>
          </Pressable>
          {!isRoleReadOnly && access.canEdit && (
            <Pressable
              style={styles.actionButton}
              disabled={resolving}
              onPress={() => resolve('local')}
              accessibilityRole="button"
              accessibilityLabel="Keep my shared note draft"
            >
              <Text style={styles.actionText}>Keep mine</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
};

const makeStyles = (colors) => StyleSheet.create({
  container: {
    minHeight: 38,
    paddingHorizontal: 16,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  text: { color: colors.textTertiary, fontSize: 12, textAlign: 'center' },
  actions: { marginTop: 7, flexDirection: 'row', gap: 22 },
  actionButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  actionText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
});

export default CollaborationFooter;
