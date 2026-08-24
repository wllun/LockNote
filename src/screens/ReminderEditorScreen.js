import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { AppAlert as Alert } from '../utils/app-alert';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { noteRepo } from '../db/noteRepo';
import EditorUndoButton from '../components/editor-undo-button';
import KeyboardAwareModalContent from '../components/keyboard-aware-modal-content';
import NoteExportModal from '../components/NoteExportModal';
import NoteShareModal from '../components/NoteShareModal';
import CollaborationFooter from '../components/CollaborationFooter';
import { collaborationService } from '../services/collaborationService';
import PasswordModal from '../components/PasswordModal';
import ReminderScheduleModal from '../components/reminder-schedule-modal';
import { verifyPassword } from '../utils/crypto';
import { confirmDestructiveAction } from '../utils/confirm-action';
import { useEditorUndo } from '../utils/use-editor-undo';
import {
  constrainNormalNoteContent,
  NORMAL_NOTE_CONTENT_MAX_CHARACTERS,
} from '../utils/note-limits.mjs';
import {
  formatReminderSchedule, isReminderNoteEmpty, normalizeReminder,
  parseReminderNote, serializeReminderNote,
} from '../utils/reminder-note.mjs';
import {
  cancelReminderNotifications, scheduleReminderNotification,
} from '../utils/reminder-notifications';
import { radius, shadow, useTheme } from '../theme';
import { useAwaitedEditorExit } from '../utils/use-awaited-editor-exit';

const ReminderEditorScreen = ({ route, navigation }) => {
  const { noteId } = route.params;
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [reminder, setReminder] = useState(() => normalizeReminder());
  const [hasPassword, setHasPassword] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showLock, setShowLock] = useState(false);
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [lockPassword, setLockPassword] = useState('');
  const [isTitleFocused, setIsTitleFocused] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const saveTimeout = useRef(null);
  const bodyRef = useRef(null);
  const bodyLimitDialogShown = useRef(false);
  const latest = useRef({ title: '', body: '', reminder: normalizeReminder(), hasPassword: false, isPinned: false, cloudId: null, deleted: false });
  const { canUndo, remember, takeUndo, clearUndo } = useEditorUndo();

  const contentFor = (nextBody, nextReminder) => serializeReminderNote({ body: nextBody, reminder: nextReminder });

  const flushSave = useCallback(async (next = latest.current) => {
    if (saveTimeout.current) {
      clearTimeout(saveTimeout.current);
      saveTimeout.current = null;
    }
    await collaborationService.save(noteId, {
      title: next.title,
      content: contentFor(next.body, next.reminder),
    });
  }, [noteId]);

  const autoSave = useCallback(() => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      saveTimeout.current = null;
      const next = latest.current;
      collaborationService.save(noteId, { title: next.title, content: contentFor(next.body, next.reminder) })
        .catch((error) => console.error('Reminder auto-save failed:', error));
    }, 800);
  }, [noteId]);

  const applyLoadedNote = useCallback((note) => {
      if (!note) return;
      const parsed = parseReminderNote(note.content);
      const next = {
        ...latest.current,
        title: note.title,
        body: parsed.body,
        reminder: parsed.reminder,
        hasPassword: !!note.password,
        isPinned: !!note.is_pinned,
        cloudId: note.cloud_id,
      };
      latest.current = next;
      setTitle(next.title); setBody(next.body); setReminder(next.reminder);
      setHasPassword(next.hasPassword); setIsPinned(next.isPinned); clearUndo();
  }, [clearUndo]);

  useEffect(() => {
    noteRepo.getById(noteId).then(applyLoadedNote)
      .catch(() => Alert.alert('Error', 'Failed to load reminder'));
  }, [noteId, applyLoadedNote]);

  const needsExitCleanup = useCallback(() => {
    const draft = latest.current;
    const empty = !draft.cloudId && isReminderNoteEmpty(draft);
    return !draft.deleted && (empty || !!saveTimeout.current);
  }, []);

  const finalizeExit = useCallback(async () => {
    const pending = saveTimeout.current;
    if (pending) clearTimeout(pending);
    saveTimeout.current = null;

    const draft = latest.current;
    if (draft.deleted) return;
    if (!draft.cloudId && isReminderNoteEmpty(draft)) {
      await cancelReminderNotifications(draft.reminder.notificationIds);
      await noteRepo.hardDelete(noteId);
    } else if (pending) {
      await collaborationService.save(noteId, {
        title: draft.title,
        content: contentFor(draft.body, draft.reminder),
      });
    }
  }, [noteId]);

  useAwaitedEditorExit({ navigation, needsCleanup: needsExitCleanup, cleanup: finalizeExit });

  const snapshot = () => ({ title: latest.current.title, body: latest.current.body, reminder: latest.current.reminder });

  const handleTitleChange = (text) => {
    remember(snapshot(), 'title');
    latest.current.title = text; setTitle(text); autoSave();
  };

  const handleBodyChange = (text) => {
    const limited = constrainNormalNoteContent(text);
    if (limited.limitReached && !bodyLimitDialogShown.current) {
      bodyLimitDialogShown.current = true;
      Alert.alert(
        'Character limit reached',
        'This reminder note can contain up to 100,000 characters. Additional typed or pasted text cannot be added.'
      );
    } else if (!limited.limitReached) {
      bodyLimitDialogShown.current = false;
    }
    if (limited.value === latest.current.body) return;

    remember(snapshot(), 'body');
    latest.current.body = limited.value; setBody(limited.value); autoSave();
  };

  const scheduleAndSave = async (nextReminder, { recordUndo = true } = {}) => {
    if (scheduling) return false;
    setScheduling(true);
    let createdIds = [];
    const previousSnapshot = snapshot();
    const previousReminder = latest.current.reminder;
    try {
      const result = await scheduleReminderNotification({
        noteId,
        title: latest.current.title,
        body: latest.current.body,
        hasPassword: latest.current.hasPassword,
        reminder: nextReminder,
        previousIds: previousReminder.notificationIds,
      });
      if (result.permissionDenied) {
        Alert.alert('Notifications are off', 'Allow notifications for LockNote in your device settings, then try again.');
        return false;
      }
      createdIds = result.notificationIds;
      const saved = { ...normalizeReminder(nextReminder), enabled: true, notificationIds: result.notificationIds };
      latest.current.reminder = saved; setReminder(saved);
      await flushSave(latest.current);
      await cancelReminderNotifications(
        previousReminder.notificationIds.filter((id) => !result.notificationIds.includes(id))
      );
      if (recordUndo) remember(previousSnapshot, 'reminder');
      if (!result.supported) Alert.alert('Saved in note', 'Browser reminders cannot trigger a device notification. Use the Android or iOS app for notifications.');
      return true;
    } catch (error) {
      await cancelReminderNotifications(createdIds);
      latest.current.reminder = previousReminder;
      setReminder(previousReminder);
      Alert.alert('Could not set reminder', error?.message || 'Please check the date and notification permission.');
      return false;
    } finally {
      setScheduling(false);
    }
  };

  const handleScheduleSave = async (next) => {
    const success = await scheduleAndSave(next);
    if (success) setShowSchedule(false);
  };

  const handleToggleReminder = async (enabled) => {
    if (enabled) {
      if (!reminder.scheduledAt || (reminder.repeat === 'none' && new Date(reminder.scheduledAt) <= new Date())) {
        setShowSchedule(true);
        return;
      }
      await scheduleAndSave({ ...reminder, enabled: true });
      return;
    }
    remember(snapshot(), 'reminder');
    await cancelReminderNotifications(reminder.notificationIds);
    const next = { ...reminder, enabled: false, notificationIds: [] };
    latest.current.reminder = next; setReminder(next); await flushSave(latest.current);
  };

  const handleUndo = async () => {
    const previous = takeUndo();
    if (!previous) return;
    const currentIds = latest.current.reminder.notificationIds;
    await cancelReminderNotifications(currentIds);
    let nextReminder = normalizeReminder(previous.reminder);
    nextReminder.notificationIds = [];
    latest.current = { ...latest.current, title: previous.title, body: previous.body, reminder: nextReminder };
    setTitle(previous.title); setBody(previous.body); setReminder(nextReminder);
    if (nextReminder.enabled) await scheduleAndSave(nextReminder, { recordUndo: false });
    else await flushSave(latest.current);
  };

  const rescheduleForPrivacy = async (nextHasPassword) => {
    if (!latest.current.reminder.enabled) return;
    const previousIds = latest.current.reminder.notificationIds;
    let createdIds = [];
    try {
      const result = await scheduleReminderNotification({
        noteId, title: latest.current.title, body: latest.current.body,
        hasPassword: nextHasPassword, reminder: latest.current.reminder,
        previousIds,
      });
      if (result.permissionDenied) return;
      createdIds = result.notificationIds;
      latest.current.reminder = { ...latest.current.reminder, notificationIds: result.notificationIds };
      setReminder(latest.current.reminder);
      await flushSave(latest.current);
      await cancelReminderNotifications(previousIds.filter((id) => !result.notificationIds.includes(id)));
    } catch (error) {
      await cancelReminderNotifications(createdIds);
      latest.current.reminder = { ...latest.current.reminder, notificationIds: previousIds };
      setReminder(latest.current.reminder);
      throw error;
    }
  };

  const handleSetPassword = async () => {
    if (!lockPassword.trim()) return Alert.alert('Error', 'Please enter a password');
    try {
      await noteRepo.update(noteId, { password: lockPassword });
      latest.current.hasPassword = true; setHasPassword(true); setShowLock(false); setLockPassword('');
    } catch { Alert.alert('Error', 'Failed to set password'); return; }
    try { await rescheduleForPrivacy(true); }
    catch {
      await cancelReminderNotifications(latest.current.reminder.notificationIds);
      latest.current.reminder = { ...latest.current.reminder, enabled: false, notificationIds: [] };
      setReminder(latest.current.reminder);
      await flushSave(latest.current).catch(() => {});
      Alert.alert('Password set', 'The note is locked. Its reminder was turned off because the private notification could not be refreshed.');
    }
  };

  const handleRemovePassword = async () => {
    try {
      await noteRepo.update(noteId, { password: null });
      latest.current.hasPassword = false; setHasPassword(false); setShowLock(false);
    } catch { Alert.alert('Error', 'Failed to remove password'); return; }
    try { await rescheduleForPrivacy(false); }
    catch { Alert.alert('Password removed', 'The note is unlocked, but its reminder notification could not be refreshed. Open reminder settings and set it again.'); }
  };

  const handleTogglePin = async () => {
    const next = !isPinned;
    try { await noteRepo.update(noteId, { is_pinned: next }); latest.current.isPinned = next; setIsPinned(next); }
    catch { Alert.alert('Error', 'Failed to update pin'); }
  };

  const deleteReminder = async () => {
    try {
      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current);
        saveTimeout.current = null;
      }
      latest.current.deleted = true;
      await cancelReminderNotifications(latest.current.reminder.notificationIds);
      await collaborationService.delete(noteId);
      navigation.goBack();
    } catch {
      latest.current.deleted = false;
      Alert.alert('Error', 'Failed to delete reminder');
    }
  };

  const confirmDelete = () => confirmDestructiveAction({
    title: 'Delete this reminder?',
    message: 'The reminder note will be removed and its scheduled notification will be cancelled.',
    details: [
      {
        label: 'Reminder',
        value: title.trim() || 'Untitled reminder',
        iconName: 'notifications-outline',
      },
    ],
    confirmLabel: 'Delete reminder',
    onConfirm: deleteReminder,
  });

  const handleDelete = () => hasPassword ? setShowDeletePassword(true) : confirmDelete();
  return (
    <KeyboardAvoidingView style={[styles.container, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Go back"><Ionicons name="chevron-back" size={24} color={colors.text} /></TouchableOpacity>
        <View style={[styles.titleField, isTitleFocused && styles.titleFieldFocused]}>
          <Ionicons name="alarm-outline" size={18} color={colors.primary} />
          <TextInput style={styles.titleInput} placeholder="Reminder title" placeholderTextColor={colors.textTertiary} value={title} onChangeText={handleTitleChange} onFocus={() => setIsTitleFocused(true)} onBlur={() => setIsTitleFocused(false)} onSubmitEditing={() => bodyRef.current?.focus()} accessibilityLabel="Reminder title" />
        </View>
        <EditorUndoButton canUndo={canUndo} colors={colors} disabledStyle={styles.disabled} onUndo={handleUndo} style={styles.headerButton} />
        <TouchableOpacity onPress={() => setShowActions(true)} style={styles.headerButton} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="More reminder actions"><Ionicons name="ellipsis-vertical" size={22} color={colors.text} /></TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(20, insets.bottom + 12) }]} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
        <TextInput ref={bodyRef} style={styles.bodyInput} placeholder="... ..." placeholderTextColor={colors.textTertiary} value={body} onChangeText={handleBodyChange} maxLength={NORMAL_NOTE_CONTENT_MAX_CHARACTERS} multiline textAlignVertical="top" accessibilityLabel="Reminder note content" />

        <View style={[styles.reminderCard, reminder.enabled && styles.reminderCardEnabled]}>
          <View style={styles.reminderTop}>
            <View style={[styles.reminderIcon, reminder.enabled && styles.reminderIconEnabled]}><Ionicons name={reminder.enabled ? 'notifications' : 'notifications-outline'} size={22} color={colors.primary} /></View>
            <View style={styles.reminderInfo}>
              <Text style={styles.reminderLabel}>Reminder</Text>
              <Text style={styles.reminderSchedule}>{reminder.enabled ? formatReminderSchedule(reminder) : 'No notification scheduled'}</Text>
            </View>
            <Switch value={reminder.enabled} onValueChange={handleToggleReminder} disabled={scheduling} trackColor={{ false: colors.border, true: colors.primarySoft }} thumbColor={reminder.enabled ? colors.primary : colors.textTertiary} accessibilityLabel="Enable reminder notification" />
          </View>
          <Pressable style={({ pressed }) => [styles.editReminder, pressed && styles.pressed]} onPress={() => setShowSchedule(true)} accessibilityRole="button" accessibilityLabel="Edit reminder date and repeat">
            <Ionicons name="calendar-outline" size={18} color={colors.primary} />
            <Text style={styles.editReminderText}>{reminder.enabled ? 'Edit reminder' : 'Choose date and time'}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </Pressable>
        </View>
      </ScrollView>

      <CollaborationFooter noteId={noteId} onRemoteNote={applyLoadedNote} />

      <Modal visible={showActions} animationType="fade" transparent onRequestClose={() => setShowActions(false)}>
        <View style={styles.actionOverlay}><Pressable style={StyleSheet.absoluteFill} onPress={() => setShowActions(false)} accessible={false} /><View style={[styles.actionMenu, { top: insets.top + 60 }]}>
          {[
            { icon: 'people-outline', text: 'Share with people', action: () => setShowShare(true) },
            { icon: 'share-outline', text: 'Export PDF or image', action: () => setShowExport(true) },
            { icon: isPinned ? 'pin' : 'pin-outline', text: isPinned ? 'Unpin' : 'Pin', action: handleTogglePin },
            { icon: hasPassword ? 'lock-closed' : 'lock-open-outline', text: hasPassword ? 'Password protection' : 'Lock', action: () => setShowLock(true) },
            { icon: 'trash-outline', text: 'Delete', danger: true, action: handleDelete },
          ].map((item) => <Pressable key={item.text} style={({ pressed }) => [styles.actionItem, item.danger && styles.actionDelete, pressed && styles.pressed]} onPress={() => { setShowActions(false); item.action(); }} accessibilityRole="button"><Ionicons name={item.icon} size={20} color={item.danger ? colors.danger : colors.textSecondary} /><Text style={[styles.actionText, item.danger && { color: colors.danger }]}>{item.text}</Text></Pressable>)}
        </View></View>
      </Modal>

      <ReminderScheduleModal visible={showSchedule} reminder={reminder} onClose={() => setShowSchedule(false)} onSave={handleScheduleSave} saving={scheduling} />
      <NoteExportModal visible={showExport} onClose={() => setShowExport(false)} title={title} content={body} type="reminder" reminder={reminder} />
      <NoteShareModal visible={showShare} noteId={noteId} onClose={() => setShowShare(false)} onLeft={() => navigation.goBack()} />
      <PasswordModal
        visible={showDeletePassword}
        onClose={() => setShowDeletePassword(false)}
        onVerify={async (password) => {
          const note = await noteRepo.getById(noteId);
          return !!note?.password && verifyPassword(password, note.password);
        }}
        onVerified={async () => {
          setShowDeletePassword(false);
          await deleteReminder();
        }}
        title="Delete this locked reminder?"
        subtitle="Enter its password to confirm deletion. The reminder note and its scheduled notification will be removed."
        verifyLabel="Delete reminder"
        variant="danger"
        details={[
          {
            label: 'Reminder',
            value: title.trim() || 'Untitled reminder',
            iconName: 'notifications-outline',
          },
        ]}
      />

      <Modal visible={showLock} animationType="fade" transparent onRequestClose={() => setShowLock(false)}>
        <KeyboardAwareModalContent><View style={styles.lockCard}><View style={styles.lockIcon}><Ionicons name={hasPassword ? 'lock-closed' : 'lock-open-outline'} size={26} color={colors.primary} /></View><Text style={styles.lockTitle}>{hasPassword ? 'Password Protection' : 'Set Password'}</Text>{hasPassword ? <Text style={styles.lockDescription}>This reminder is password protected. Notification content is hidden.</Text> : <TextInput style={styles.lockInput} placeholder="Enter password" placeholderTextColor={colors.textTertiary} value={lockPassword} onChangeText={setLockPassword} secureTextEntry autoFocus accessibilityLabel="Reminder password" />}<View style={styles.lockButtons}><TouchableOpacity style={[styles.lockButton, { backgroundColor: colors.inputBg }]} onPress={() => { setShowLock(false); setLockPassword(''); }}><Text style={styles.lockButtonText}>Cancel</Text></TouchableOpacity><TouchableOpacity style={[styles.lockButton, { backgroundColor: hasPassword ? colors.dangerSoft : colors.primary }]} onPress={hasPassword ? handleRemovePassword : handleSetPassword}><Text style={[styles.lockButtonText, { color: hasPassword ? colors.danger : colors.card }]}>{hasPassword ? 'Remove Lock' : 'Set Lock'}</Text></TouchableOpacity></View></View></KeyboardAwareModalContent>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const makeStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerButton: { width: 44, height: 44, borderRadius: radius.full, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.38 },
  titleField: { flex: 1, minWidth: 0, height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.inputBg },
  titleFieldFocused: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  titleInput: { flex: 1, minWidth: 0, height: 42, paddingVertical: 0, fontSize: 16, fontWeight: '700', color: colors.text, outlineStyle: 'none' },
  scroll: { flex: 1 }, scrollContent: { flexGrow: 1, padding: 20, gap: 18 },
  bodyInput: { minHeight: 220, fontSize: 16, lineHeight: 25, color: colors.text, padding: 0, outlineStyle: 'none' },
  reminderCard: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.inputBg, overflow: 'hidden' },
  reminderCardEnabled: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  reminderTop: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  reminderIcon: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  reminderIconEnabled: { backgroundColor: colors.card }, reminderInfo: { flex: 1, minWidth: 0 },
  reminderLabel: { color: colors.text, fontSize: 16, fontWeight: '800' }, reminderSchedule: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 3 },
  editReminder: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 15, borderTopWidth: 1, borderTopColor: colors.border }, editReminderText: { flex: 1, color: colors.primary, fontSize: 14, fontWeight: '700' }, pressed: { opacity: 0.7 },
  actionOverlay: { flex: 1, backgroundColor: colors.backdropSoft }, actionMenu: { position: 'absolute', right: 12, width: 250, overflow: 'hidden', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, ...shadow.card },
  actionItem: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 }, actionDelete: { borderTopWidth: 1, borderTopColor: colors.border }, actionText: { flex: 1, color: colors.text, fontSize: 16 },
  lockCard: { width: '100%', maxWidth: 400, padding: 24, alignItems: 'center', borderRadius: radius.lg, backgroundColor: colors.card, ...shadow.card }, lockIcon: { width: 56, height: 56, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft, marginBottom: 14 }, lockTitle: { color: colors.text, fontSize: 19, fontWeight: '700', marginBottom: 8 }, lockDescription: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 14 }, lockInput: { alignSelf: 'stretch', padding: 14, borderRadius: radius.md, backgroundColor: colors.inputBg, color: colors.text, fontSize: 16 }, lockButtons: { alignSelf: 'stretch', flexDirection: 'row', gap: 12, marginTop: 16 }, lockButton: { flex: 1, minHeight: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, lockButtonText: { color: colors.text, fontSize: 15, fontWeight: '700' },
});

export default ReminderEditorScreen;
