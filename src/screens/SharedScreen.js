import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { noteRepo } from '../db/noteRepo';
import { collaborationService } from '../services/collaborationService';
import { isSupabaseConfigured } from '../services/supabaseClient';
import NoteItem from '../components/NoteItem';
import { CHECKLIST_NOTE_TYPE } from '../utils/checklist-note.mjs';
import { EXPENSE_NOTE_TYPE } from '../utils/expense-record.mjs';
import { REMINDER_NOTE_TYPE } from '../utils/reminder-note.mjs';
import { radius, useTheme } from '../theme';
import { noteColorPreference } from '../utils/note-color-preference';

const routeFor = (note) => note.note_type === EXPENSE_NOTE_TYPE ? 'ExpenseRecordEditor' : note.note_type === CHECKLIST_NOTE_TYPE ? 'ChecklistEditor' : note.note_type === REMINDER_NOTE_TYPE ? 'ReminderEditor' : 'NoteEditor';

const SharedScreen = ({ navigation }) => {
  const colors = useTheme(); const styles = useMemo(() => makeStyles(colors), [colors]);
  const { session, loading: authLoading } = useAuth();
  const [notes, setNotes] = useState([]); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [message, setMessage] = useState('');
  const load = useCallback(async ({ refresh = true } = {}) => {
    const cached = await noteRepo.getSharedWithMe(); setNotes(await noteColorPreference.applyToNotes(cached)); setLoading(false);
    if (!refresh || !session || !isSupabaseConfigured) return;
    try { const next = await collaborationService.refreshSharedWithMe(); setNotes(await noteColorPreference.applyToNotes(next)); setMessage(''); }
    catch (error) { setMessage(cached.length ? 'Offline · showing saved shared notes' : (error.message || 'Could not load shared notes.')); }
  }, [session?.user?.id]);
  useEffect(() => { load(); const unsubscribeFocus = navigation.addListener('focus', load); const unsubscribeCloud = collaborationService.subscribe(load); return () => { unsubscribeFocus(); unsubscribeCloud(); }; }, [load, navigation]);
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  if (authLoading || loading) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  if (!isSupabaseConfigured || !session) return <View style={styles.center}><View style={styles.emptyIcon}><Ionicons name="people-outline" size={34} color={colors.primary} /></View><Text style={styles.emptyTitle}>Shared with me</Text><Text style={styles.emptyText}>Please log in to your account.</Text></View>;
  return <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}>
    {!!message && <View style={styles.banner}><Ionicons name="cloud-offline-outline" size={16} color={colors.textSecondary} /><Text style={styles.bannerText}>{message}</Text></View>}
    {notes.length ? notes.map((note, index) => <NoteItem key={note.id} note={note} index={index} onPress={() => navigation.navigate(routeFor(note), { noteId: note.id, shared: true })} />) : <View style={styles.centerInner}><View style={styles.emptyIcon}><Ionicons name="mail-open-outline" size={34} color={colors.primary} /></View><Text style={styles.emptyTitle}>Nothing shared yet</Text><Text style={styles.emptyText}>Notes shared to your account email will appear here.</Text></View>}
  </ScrollView>;
};
const makeStyles = (colors) => StyleSheet.create({ container: { flex: 1, backgroundColor: colors.background }, content: { flexGrow: 1, padding: 16 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: colors.background }, centerInner: { flex: 1, minHeight: 360, alignItems: 'center', justifyContent: 'center' }, emptyIcon: { width: 70, height: 70, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft, marginBottom: 14 }, emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '800' }, emptyText: { color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginTop: 7, maxWidth: 320 }, banner: { flexDirection: 'row', gap: 8, padding: 11, marginBottom: 12, borderRadius: radius.sm, backgroundColor: colors.inputBg }, bannerText: { color: colors.textSecondary, fontSize: 13 }, });
export default SharedScreen;
