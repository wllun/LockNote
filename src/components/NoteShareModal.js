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
import { AppAlert as Alert } from '../utils/app-alert';
import { SHARE_ROLE_EDITOR, SHARE_ROLE_VIEWER } from '../utils/collaboration-note.mjs';

const NoteShareModal = ({ visible, noteId, onClose, onChanged, onLeft }) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [note, setNote] = useState(null);
  const [members, setMembers] = useState([]);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState(SHARE_ROLE_EDITOR);
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
    setInviteRole(SHARE_ROLE_EDITOR);
    setMembers([]);
    setBusy(false);
    load().catch((e) => setError(e.message || 'Could not load sharing details.'));
  }, [visible, noteId, session?.user?.id]);

  const share = async () => {
    if (!email.trim()) return setError('Enter an account email.');
    setBusy(true); setError('');
    try {
      await collaborationService.shareByEmail(noteId, email, inviteRole);
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

  const changeRole = async (member, role) => {
    setBusy(true); setError('');
    try {
      await collaborationService.updateMemberRole(noteId, member.user_id, role);
      await load();
      onChanged?.();
    } catch (e) { setError(e.message || 'Could not change this person’s access.'); }
    finally { setBusy(false); }
  };

  const chooseRole = (member) => Alert.alert(
    `Access for ${member.email}`,
    'Choose what this person can do with the note.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'View only', onPress: () => changeRole(member, SHARE_ROLE_VIEWER) },
      { text: 'Can edit', onPress: () => changeRole(member, SHARE_ROLE_EDITOR) },
    ],
    { iconName: 'people-outline' }
  );

  const leave = async () => {
    setBusy(true); setError('');
    try { await collaborationService.leave(noteId); onClose(); onLeft?.(); }
    catch (e) { setError(e.message || 'Could not leave this note.'); setBusy(false); }
  };

  const incoming = note?.share_origin === 'incoming';
  const isViewer = incoming && note?.share_role === SHARE_ROLE_VIEWER;
  const subtitle = incoming
    ? (isViewer ? 'You can view this note.' : 'You can edit this note.')
    : 'Choose what each person can do.';
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
            <View style={styles.headerCopy}><Text style={styles.title}>Share note</Text><Text style={styles.subtitle}>{subtitle}</Text></View>
            <Pressable style={styles.iconButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close sharing"><Ionicons name="close" size={22} color={colors.textSecondary} /></Pressable>
          </View>

          {!isSupabaseConfigured ? <View style={styles.notice}><Ionicons name="cloud-offline-outline" size={20} color={colors.textSecondary} /><Text style={styles.noticeText}>Account services must be configured before notes can be shared.</Text></View>
          : !session ? <View style={styles.notice}><Ionicons name="person-circle-outline" size={20} color={colors.textSecondary} /><Text style={styles.noticeText}>Sign in from Profile before sharing a note.</Text></View>
          : <>
            {!incoming && <View style={styles.inviteArea}>
              <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Account email address" placeholderTextColor={colors.textTertiary} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" returnKeyType="send" onSubmitEditing={share} accessibilityLabel="Collaborator email" />
              <View style={styles.inviteActions}>
                <View style={styles.permissionControl} accessibilityRole="radiogroup" accessibilityLabel="Permission">
                  {[
                    { role: SHARE_ROLE_EDITOR, label: 'Can edit', icon: 'create-outline' },
                    { role: SHARE_ROLE_VIEWER, label: 'View only', icon: 'eye-outline' },
                  ].map((option) => {
                    const selected = inviteRole === option.role;
                    return <Pressable
                      key={option.role}
                      style={({ pressed }) => [styles.permissionOption, selected && styles.permissionOptionSelected, pressed && styles.pressed]}
                      onPress={() => setInviteRole(option.role)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={option.label}
                    >
                      <Ionicons name={option.icon} size={17} color={selected ? colors.primary : colors.textSecondary} />
                      <Text style={[styles.permissionText, selected && styles.permissionTextSelected]}>{option.label}</Text>
                    </Pressable>;
                  })}
                </View>
                <Pressable style={({ pressed }) => [styles.shareButton, pressed && styles.pressed, busy && styles.disabled]} onPress={share} disabled={busy} accessibilityRole="button" accessibilityLabel={`Share with ${inviteRole === SHARE_ROLE_VIEWER ? 'view-only' : 'edit'} access`}><Text style={styles.shareButtonText}>Share</Text></Pressable>
              </View>
            </View>}
            {!!error && <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text>}
            <Text style={styles.sectionLabel}>PEOPLE WITH ACCESS</Text>
            {busy && !members.length ? <ActivityIndicator color={colors.primary} /> : members.map((member) => (
              <View key={member.user_id} style={styles.memberRow}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{member.email?.[0]?.toUpperCase() || '?'}</Text></View>
                <View style={styles.memberCopy}><Text style={styles.memberEmail} numberOfLines={1}>{member.email}</Text><Text style={styles.memberRole}>{member.is_owner ? 'Owner' : member.role === SHARE_ROLE_VIEWER ? 'View only' : 'Can edit'}</Text></View>
                {!incoming && !member.is_owner && <View style={styles.memberActions}>
                  <Pressable style={[styles.roleButton, busy && styles.disabled]} onPress={() => chooseRole(member)} disabled={busy} accessibilityRole="button" accessibilityLabel={`Change access for ${member.email}. Current access: ${member.role === SHARE_ROLE_VIEWER ? 'view only' : 'can edit'}`}><Ionicons name={member.role === SHARE_ROLE_VIEWER ? 'eye-outline' : 'create-outline'} size={17} color={colors.primary} /><Ionicons name="chevron-down" size={15} color={colors.primary} /></Pressable>
                  <Pressable style={[styles.iconButton, busy && styles.disabled]} onPress={() => remove(member)} disabled={busy} accessibilityRole="button" accessibilityLabel={`Remove ${member.email}`}><Ionicons name="close-circle-outline" size={22} color={colors.danger} /></Pressable>
                </View>}
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }, headerCopy: { flex: 1, paddingRight: 8 }, title: { color: colors.text, fontSize: 20, fontWeight: '800' }, subtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 3 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full }, inviteArea: { gap: 10 }, inviteActions: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  input: { flex: 1, minHeight: 48, backgroundColor: colors.inputBg, borderRadius: radius.sm, color: colors.text, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.border },
  permissionControl: { flex: 1, minWidth: 0, flexDirection: 'row', padding: 3, gap: 3, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.inputBg },
  permissionOption: { flex: 1, minHeight: 42, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: Math.max(4, radius.sm - 3) }, permissionOptionSelected: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.primary },
  permissionText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' }, permissionTextSelected: { color: colors.primary },
  shareButton: { minWidth: 78, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.primary }, shareButtonText: { color: '#fff', fontWeight: '700' }, pressed: { opacity: 0.72 }, disabled: { opacity: 0.5 },
  error: { color: colors.danger, fontSize: 13, marginTop: 8 }, sectionLabel: { color: colors.textTertiary, fontSize: 11, fontWeight: '800', letterSpacing: 0.7, marginTop: 20, marginBottom: 8 },
  memberRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border }, avatar: { width: 34, height: 34, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft }, avatarText: { color: colors.primary, fontWeight: '800' }, memberCopy: { flex: 1, minWidth: 0, marginLeft: 11 }, memberEmail: { color: colors.text, fontWeight: '600' }, memberRole: { color: colors.textTertiary, fontSize: 12, marginTop: 2 }, memberActions: { flexDirection: 'row', alignItems: 'center', gap: 8 }, roleButton: { minWidth: 56, minHeight: 44, paddingHorizontal: 10, flexDirection: 'row', gap: 2, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.primarySoft },
  notice: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: radius.sm, backgroundColor: colors.inputBg }, noticeText: { flex: 1, color: colors.textSecondary, lineHeight: 19 }, leaveButton: { minHeight: 48, marginTop: 14, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.dangerSoft }, leaveText: { color: colors.danger, fontWeight: '700' },
});
export default NoteShareModal;
