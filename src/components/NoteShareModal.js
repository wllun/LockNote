import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { noteRepo } from '../db/noteRepo';
import { collaborationService } from '../services/collaborationService';
import { isSupabaseConfigured } from '../services/supabaseClient';
import { radius, shadow, useTheme } from '../theme';
import KeyboardAwareModalContent from './keyboard-aware-modal-content';

const NoteShareModal = ({ visible, noteId, onClose, onChanged, onLeft }) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [note, setNote] = useState(null);
  const [members, setMembers] = useState([]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const local = await noteRepo.getById(noteId);
    setNote(local);
    if (local?.cloud_id && session) setMembers(await collaborationService.getMembers(noteId));
  };

  useEffect(() => {
    if (!visible) return;
    setError('');
    setEmail('');
    setMembers([]);
    load().catch((e) => setError(e.message || 'Could not load sharing details.'));
  }, [visible, noteId, session?.user?.id]);

  const share = async () => {
    if (!email.trim()) return setError('Enter an account email.');
    setBusy(true); setError('');
    try {
      await collaborationService.shareByEmail(noteId, email);
      setEmail('');
      await load();
      onChanged?.();
    } catch (e) { setError(e.message || 'Could not share this note.'); }
    finally { setBusy(false); }
  };

  const remove = async (member) => {
    setBusy(true); setError('');
    try { await collaborationService.removeMember(noteId, member.user_id); await load(); onChanged?.(); }
    catch (e) { setError(e.message || 'Could not remove this collaborator.'); }
    finally { setBusy(false); }
  };

  const leave = async () => {
    setBusy(true); setError('');
    try { await collaborationService.leave(noteId); onClose(); onLeft?.(); }
    catch (e) { setError(e.message || 'Could not leave this note.'); setBusy(false); }
  };

  const incoming = note?.share_origin === 'incoming';
  return (
    <Modal
      visible={visible}
      animationType={visible ? 'fade' : 'none'}
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAwareModalContent
        overlayStyle={styles.overlay}
        contentContainerStyle={styles.modalContent}
      >
        <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.header}>
            <View><Text style={styles.title}>Share note</Text><Text style={styles.subtitle}>Everyone listed here can edit.</Text></View>
            <Pressable style={styles.iconButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close sharing"><Ionicons name="close" size={22} color={colors.textSecondary} /></Pressable>
          </View>

          {!isSupabaseConfigured ? <View style={styles.notice}><Ionicons name="cloud-offline-outline" size={20} color={colors.textSecondary} /><Text style={styles.noticeText}>Account services must be configured before notes can be shared.</Text></View>
          : !session ? <View style={styles.notice}><Ionicons name="person-circle-outline" size={20} color={colors.textSecondary} /><Text style={styles.noticeText}>Sign in from Profile before sharing a note.</Text></View>
          : <>
            {!incoming && <View style={styles.inviteRow}>
              <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Account email address" placeholderTextColor={colors.textTertiary} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" returnKeyType="send" onSubmitEditing={share} accessibilityLabel="Collaborator email" />
              <Pressable style={({ pressed }) => [styles.shareButton, pressed && styles.pressed, busy && styles.disabled]} onPress={share} disabled={busy} accessibilityRole="button"><Text style={styles.shareButtonText}>Share</Text></Pressable>
            </View>}
            {!!error && <Text style={styles.error}>{error}</Text>}
            <Text style={styles.sectionLabel}>PEOPLE WITH ACCESS</Text>
            {busy && !members.length ? <ActivityIndicator color={colors.primary} /> : members.map((member) => (
              <View key={member.user_id} style={styles.memberRow}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{member.email?.[0]?.toUpperCase() || '?'}</Text></View>
                <View style={styles.memberCopy}><Text style={styles.memberEmail} numberOfLines={1}>{member.email}</Text><Text style={styles.memberRole}>{member.is_owner ? 'Owner' : 'Editor'}</Text></View>
                {!incoming && !member.is_owner && <Pressable style={styles.iconButton} onPress={() => remove(member)} disabled={busy} accessibilityRole="button" accessibilityLabel={`Remove ${member.email}`}><Ionicons name="close-circle-outline" size={22} color={colors.danger} /></Pressable>}
              </View>
            ))}
            {incoming && <Pressable style={({ pressed }) => [styles.leaveButton, pressed && styles.pressed]} onPress={leave} disabled={busy} accessibilityRole="button"><Ionicons name="exit-outline" size={18} color={colors.danger} /><Text style={styles.leaveText}>Leave shared note</Text></Pressable>}
          </>}
        </View>
      </KeyboardAwareModalContent>
    </Modal>
  );
};

const makeStyles = (colors) => StyleSheet.create({
  overlay: { backgroundColor: colors.backdrop }, modalContent: { width: '100%' },
  panel: { width: '100%', maxWidth: 520, maxHeight: '85%', backgroundColor: colors.card, borderRadius: radius.lg, padding: 18, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }, title: { color: colors.text, fontSize: 20, fontWeight: '800' }, subtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 3 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full }, inviteRow: { flexDirection: 'row', gap: 10 },
  input: { flex: 1, minHeight: 48, backgroundColor: colors.inputBg, borderRadius: radius.sm, color: colors.text, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.border },
  shareButton: { minWidth: 78, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.primary }, shareButtonText: { color: '#fff', fontWeight: '700' }, pressed: { opacity: 0.72 }, disabled: { opacity: 0.5 },
  error: { color: colors.danger, fontSize: 13, marginTop: 8 }, sectionLabel: { color: colors.textTertiary, fontSize: 11, fontWeight: '800', letterSpacing: 0.7, marginTop: 20, marginBottom: 8 },
  memberRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border }, avatar: { width: 34, height: 34, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft }, avatarText: { color: colors.primary, fontWeight: '800' }, memberCopy: { flex: 1, marginLeft: 11 }, memberEmail: { color: colors.text, fontWeight: '600' }, memberRole: { color: colors.textTertiary, fontSize: 12, marginTop: 2 },
  notice: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: radius.sm, backgroundColor: colors.inputBg }, noticeText: { flex: 1, color: colors.textSecondary, lineHeight: 19 }, leaveButton: { minHeight: 48, marginTop: 14, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.dangerSoft }, leaveText: { color: colors.danger, fontWeight: '700' },
});
export default NoteShareModal;
