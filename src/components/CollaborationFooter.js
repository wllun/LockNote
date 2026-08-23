import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { noteRepo } from '../db/noteRepo';
import { collaborationService } from '../services/collaborationService';
import { formatCollaborativeEdit } from '../utils/collaboration-note.mjs';
import { useTheme } from '../theme';

const CollaborationFooter = ({ noteId, onRemoteNote }) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { session } = useAuth();
  const [note, setNote] = useState(null);
  const [resolving, setResolving] = useState(false);
  const callbackRef = useRef(onRemoteNote);
  callbackRef.current = onRemoteNote;
  const refresh = () => noteRepo.getById(noteId).then(setNote).catch(() => {});
  useEffect(() => {
    collaborationService.refreshNote(noteId).then((result) => setNote(result.note)).catch(refresh);
    return collaborationService.subscribe(async () => {
      try {
        const result = await collaborationService.refreshNote(noteId);
        setNote(result.note);
        if (result.changed) callbackRef.current?.(result.note);
      } catch { refresh(); }
    });
  }, [noteId]);
  const message = formatCollaborativeEdit(note, session?.user?.email);
  if (!note?.cloud_id) return null;
  const statusMessage = note.sync_status === 'conflict'
    ? 'This note also changed elsewhere'
    : note.sync_status === 'pending'
      ? 'Saved on this device · waiting to sync'
      : message || 'Shared note · Waiting for the first synced edit';
  const resolve = async (strategy) => {
    setResolving(true);
    try {
      const resolved = await collaborationService.resolveConflict(noteId, strategy);
      setNote(resolved);
      callbackRef.current?.(resolved);
    } catch { /* Keep the conflict visible so the user can retry. */ }
    finally { setResolving(false); }
  };
  return <View style={styles.container}>
    <View style={styles.statusRow}><Ionicons name={note.sync_status === 'pending' ? 'cloud-offline-outline' : 'people-outline'} size={14} color={note.sync_status === 'conflict' ? colors.danger : colors.textTertiary} /><Text style={[styles.text, note.sync_status === 'conflict' && { color: colors.danger }]} numberOfLines={2}>{statusMessage}</Text></View>
    {note.sync_status === 'conflict' && <View style={styles.actions}><Pressable disabled={resolving} onPress={() => resolve('remote')}><Text style={styles.actionText}>Use latest</Text></Pressable><Pressable disabled={resolving} onPress={() => resolve('local')}><Text style={styles.actionText}>Keep mine</Text></Pressable></View>}
  </View>;
};
const makeStyles = (colors) => StyleSheet.create({ container: { minHeight: 38, paddingHorizontal: 16, paddingVertical: 9, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card }, statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, text: { color: colors.textTertiary, fontSize: 12, textAlign: 'center' }, actions: { marginTop: 7, flexDirection: 'row', gap: 22 }, actionText: { color: colors.primary, fontSize: 12, fontWeight: '800' } });
export default CollaborationFooter;
