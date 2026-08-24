import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Text,
  Pressable,
} from 'react-native';
import { AppAlert as Alert } from '../utils/app-alert';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { noteRepo } from '../db/noteRepo';
import EditorUndoButton from '../components/editor-undo-button';
import NoteExportModal from '../components/NoteExportModal';
import NoteShareModal from '../components/NoteShareModal';
import CollaborationFooter from '../components/CollaborationFooter';
import { collaborationService } from '../services/collaborationService';
import PasswordModal from '../components/PasswordModal';
import KeyboardAwareModalContent from '../components/keyboard-aware-modal-content';
import { verifyPassword } from '../utils/crypto';
import { confirmDestructiveAction } from '../utils/confirm-action';
import { useEditorUndo } from '../utils/use-editor-undo';
import { radius, shadow, useTheme } from '../theme';
import {
  constrainNormalNoteContent,
  NORMAL_NOTE_CONTENT_MAX_CHARACTERS,
} from '../utils/note-limits.mjs';

const NoteEditorScreen = ({ route, navigation }) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { noteId } = route.params;
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showDeletePasswordModal, setShowDeletePasswordModal] = useState(false);
  const [lockPassword, setLockPassword] = useState('');
  const [isTitleFocused, setIsTitleFocused] = useState(false);
  const saveTimeout = useRef(null);
  const contentRef = useRef(null);
  const contentLimitDialogShown = useRef(false);
  // Latest values for the unmount cleanup (state in a [] effect is stale).
  const latest = useRef({ title: '', content: '', hasPassword: false, isPinned: false, cloudId: null, deleted: false });
  const { canUndo, remember, takeUndo, clearUndo } = useEditorUndo();
  const insets = useSafeAreaInsets();

  const loadNote = async () => {
    try {
      const note = await noteRepo.getById(noteId);
      if (note) {
        setTitle(note.title);
        setContent(note.content);
        setHasPassword(!!note.password);
        setIsPinned(!!note.is_pinned);
        latest.current = {
          ...latest.current,
          title: note.title,
          content: note.content,
          hasPassword: !!note.password,
          isPinned: !!note.is_pinned,
          cloudId: note.cloud_id,
        };
        clearUndo();
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load note');
    }
  };

  const autoSave = useCallback(
    (newTitle, newContent) => {
      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current);
      }
      saveTimeout.current = setTimeout(async () => {
        saveTimeout.current = null;
        try {
          await collaborationService.save(noteId, { title: newTitle, content: newContent });
        } catch (error) {
          console.error('Auto-save failed:', error);
        }
      }, 800);
    },
    [noteId]
  );

  const handleTitleChange = (text) => {
    remember(
      { title: latest.current.title, content: latest.current.content },
      'title'
    );
    setTitle(text);
    latest.current.title = text;
    autoSave(text, content);
  };

  const handleContentChange = (text) => {
    const limited = constrainNormalNoteContent(text);
    if (limited.limitReached && !contentLimitDialogShown.current) {
      contentLimitDialogShown.current = true;
      Alert.alert(
        'Character limit reached',
        'This note can contain up to 100,000 characters. Additional typed or pasted text cannot be added.'
      );
    } else if (!limited.limitReached) {
      contentLimitDialogShown.current = false;
    }
    if (limited.value === latest.current.content) return;

    remember(
      { title: latest.current.title, content: latest.current.content },
      'content'
    );
    setContent(limited.value);
    latest.current.content = limited.value;
    autoSave(title, limited.value);
  };

  const handleUndo = () => {
    const snapshot = takeUndo();
    if (!snapshot) return;

    setTitle(snapshot.title);
    setContent(snapshot.content);
    latest.current.title = snapshot.title;
    latest.current.content = snapshot.content;
    autoSave(snapshot.title, snapshot.content);
  };

  const handleSetPassword = async () => {
    if (!lockPassword.trim()) {
      Alert.alert('Error', 'Please enter a password');
      return;
    }
    try {
      await noteRepo.update(noteId, { password: lockPassword });
      setHasPassword(true);
      latest.current.hasPassword = true;
      setShowLockModal(false);
      setLockPassword('');
    } catch (error) {
      Alert.alert('Error', 'Failed to set password');
    }
  };

  const handleRemovePassword = async () => {
    try {
      await noteRepo.update(noteId, { password: null });
      setHasPassword(false);
      latest.current.hasPassword = false;
      setShowLockModal(false);
      setLockPassword('');
    } catch (error) {
      Alert.alert('Error', 'Failed to remove password');
    }
  };

  const handleTogglePin = async () => {
    const next = !isPinned;
    try {
      await noteRepo.update(noteId, { is_pinned: next });
      setIsPinned(next);
      latest.current.isPinned = next;
    } catch (error) {
      Alert.alert('Error', 'Failed to update pin');
    }
  };

  const deleteNote = async () => {
    try {
      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current);
        saveTimeout.current = null;
      }
      latest.current.deleted = true;
      await collaborationService.delete(noteId);
      navigation.goBack();
    } catch (error) {
      latest.current.deleted = false;
      Alert.alert('Error', 'Failed to delete note');
    }
  };

  const confirmDelete = () => {
    confirmDestructiveAction({
      title: 'Delete this note?',
      message: 'This note and its content will be removed from your notes.',
      details: [
        {
          label: 'Note',
          value: title.trim() || 'Untitled note',
          iconName: 'document-text-outline',
        },
      ],
      confirmLabel: 'Delete note',
      onConfirm: deleteNote,
    });
  };

  const handleDelete = () => {
    if (hasPassword) {
      setShowDeletePasswordModal(true);
      return;
    }
    confirmDelete();
  };

  useEffect(() => {
    loadNote();
  }, [noteId]);

  // On exit: flush a pending save, or clean up a never-typed-in note so
  // backing out doesn't leave an empty "Untitled" row.
  useEffect(() => {
    return () => {
      const pending = saveTimeout.current;
      if (pending) {
        clearTimeout(pending);
        saveTimeout.current = null;
      }
      const { title, content, hasPassword, isPinned, cloudId, deleted } = latest.current;
      if (deleted) return;
      if (!cloudId && !title.trim() && !content.trim() && !hasPassword && !isPinned) {
        noteRepo.hardDelete(noteId).catch(() => {});
      } else if (pending) {
        collaborationService.save(noteId, { title, content }).catch(() => {});
      }
    };
  }, [noteId]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerButton}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <View
          style={[
            styles.headerTitleField,
            isTitleFocused && styles.headerTitleFieldFocused,
          ]}
        >
          <Ionicons name="document-text-outline" size={18} color={colors.primary} />
          <TextInput
            style={styles.headerTitleInput}
            placeholder="Note title"
            placeholderTextColor={colors.textTertiary}
            value={title}
            onChangeText={handleTitleChange}
            onFocus={() => setIsTitleFocused(true)}
            onBlur={() => setIsTitleFocused(false)}
            blurOnSubmit
            returnKeyType="next"
            onSubmitEditing={() => contentRef.current?.focus()}
            accessibilityLabel="Note title"
            accessibilityHint="Edits the title of this note"
          />
        </View>

        <EditorUndoButton
          canUndo={canUndo}
          colors={colors}
          disabledStyle={styles.headerButtonDisabled}
          onUndo={handleUndo}
          style={styles.headerButton}
        />

        <TouchableOpacity
          onPress={() => setShowActionsMenu(true)}
          style={styles.headerButton}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="More note actions"
          accessibilityHint="Shows pin, password, export, and delete actions"
          accessibilityState={{ expanded: showActionsMenu }}
        >
          <Ionicons name="ellipsis-vertical" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.contentArea}>
        <TextInput
          ref={contentRef}
          style={[
            styles.contentInput,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
          placeholder="Start writing..."
          placeholderTextColor={colors.textTertiary}
          value={content}
          onChangeText={handleContentChange}
          maxLength={NORMAL_NOTE_CONTENT_MAX_CHARACTERS}
          multiline
          textAlignVertical="top"
          accessibilityLabel="Note content"
          accessibilityHint={`Maximum ${NORMAL_NOTE_CONTENT_MAX_CHARACTERS.toLocaleString()} characters`}
        />
      </View>

      <CollaborationFooter noteId={noteId} onRemoteNote={loadNote} />

      <Modal
        visible={showActionsMenu}
        animationType="fade"
        transparent
        onRequestClose={() => setShowActionsMenu(false)}
      >
        <View style={styles.actionsMenuOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowActionsMenu(false)}
            accessible={false}
          />
          <View
            style={[styles.actionsMenu, { top: insets.top + 60 }]}
            accessibilityViewIsModal
          >
            <Pressable
              style={({ pressed }) => [styles.actionsMenuItem, pressed && styles.actionsMenuItemPressed]}
              onPress={() => { setShowActionsMenu(false); setShowShareModal(true); }}
              accessibilityRole="button"
            >
              <Ionicons name="people-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.actionsMenuText}>Share with people</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.actionsMenuItem,
                pressed && styles.actionsMenuItemPressed,
              ]}
              onPress={() => {
                setShowActionsMenu(false);
                setShowExportModal(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Export note"
            >
              <Ionicons name="share-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.actionsMenuText}>Export PDF or image</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.actionsMenuItem,
                pressed && styles.actionsMenuItemPressed,
              ]}
              onPress={() => {
                setShowActionsMenu(false);
                handleTogglePin();
              }}
              accessibilityRole="button"
              accessibilityLabel={isPinned ? 'Unpin note' : 'Pin note'}
            >
              <Ionicons
                name={isPinned ? 'pin' : 'pin-outline'}
                size={20}
                color={isPinned ? colors.primary : colors.textSecondary}
              />
              <Text style={styles.actionsMenuText}>
                {isPinned ? 'Unpin' : 'Pin'}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.actionsMenuItem,
                pressed && styles.actionsMenuItemPressed,
              ]}
              onPress={() => {
                setShowActionsMenu(false);
                setShowLockModal(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={
                hasPassword ? 'Manage note password' : 'Set note password'
              }
            >
              <Ionicons
                name={hasPassword ? 'lock-closed' : 'lock-open-outline'}
                size={20}
                color={hasPassword ? colors.folder : colors.textSecondary}
              />
              <Text style={styles.actionsMenuText}>
                {hasPassword ? 'Password protection' : 'Lock'}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.actionsMenuItem,
                styles.actionsMenuDeleteItem,
                pressed && styles.actionsMenuItemPressed,
              ]}
              onPress={() => {
                setShowActionsMenu(false);
                handleDelete();
              }}
              accessibilityRole="button"
              accessibilityLabel="Delete note"
            >
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
              <Text style={[styles.actionsMenuText, styles.actionsMenuDeleteText]}>
                Delete
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <NoteExportModal
        visible={showExportModal}
        onClose={() => setShowExportModal(false)}
        title={title}
        content={content}
      />
      <NoteShareModal visible={showShareModal} noteId={noteId} onClose={() => setShowShareModal(false)} onChanged={loadNote} onLeft={() => navigation.goBack()} />

      <PasswordModal
        visible={showDeletePasswordModal}
        onClose={() => setShowDeletePasswordModal(false)}
        onVerify={async (password) => {
          const note = await noteRepo.getById(noteId);
          return !!note?.password && verifyPassword(password, note.password);
        }}
        onVerified={async () => {
          setShowDeletePasswordModal(false);
          await deleteNote();
        }}
        title="Delete this locked note?"
        subtitle="Enter its password to confirm deletion. This note and its content will be removed from your notes."
        verifyLabel="Delete note"
        variant="danger"
        details={[
          {
            label: 'Note',
            value: title.trim() || 'Untitled note',
            iconName: 'document-text-outline',
          },
        ]}
      />

      <Modal visible={showLockModal} animationType="fade" transparent>
        <KeyboardAwareModalContent>
          <View style={styles.modalContent}>
            <View style={styles.modalIconCircle}>
              <Ionicons
                name={hasPassword ? 'lock-closed' : 'lock-open-outline'}
                size={26}
                color={colors.primary}
              />
            </View>
            <Text style={styles.modalTitle}>
              {hasPassword ? 'Password Protection' : 'Set Password'}
            </Text>
            {hasPassword ? (
              <Text style={styles.modalDescription}>
                This note is password protected.
              </Text>
            ) : (
              <TextInput
                style={styles.modalInput}
                placeholder="Enter password"
                placeholderTextColor={colors.textTertiary}
                value={lockPassword}
                onChangeText={setLockPassword}
                secureTextEntry
                autoFocus
              />
            )}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                activeOpacity={0.7}
                onPress={() => {
                  setShowLockModal(false);
                  setLockPassword('');
                }}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              {hasPassword ? (
                <TouchableOpacity
                  style={[styles.modalButton, styles.removeButton]}
                  activeOpacity={0.7}
                  onPress={handleRemovePassword}
                >
                  <Text style={[styles.modalButtonText, styles.removeButtonText]}>
                    Remove Lock
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.modalButton, styles.setButton]}
                  activeOpacity={0.7}
                  onPress={handleSetPassword}
                >
                  <Text style={[styles.modalButtonText, styles.setButtonText]}>
                    Set Lock
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </KeyboardAwareModalContent>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const makeStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.card,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerButton: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerButtonDisabled: { opacity: 0.38 },
    headerTitleField: {
      flex: 1,
      minWidth: 0,
      height: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 11,
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
    },
    headerTitleInput: {
      flex: 1,
      minWidth: 0,
      height: 42,
      paddingVertical: 0,
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      outlineStyle: 'none',
    },
    headerTitleFieldFocused: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    contentArea: {
      flex: 1,
    },
    contentInput: {
      flex: 1,
      fontSize: 16,
      paddingHorizontal: 20,
      paddingTop: 16,
      color: colors.text,
      lineHeight: 25,
    },
    actionsMenuOverlay: {
      flex: 1,
      backgroundColor: colors.backdropSoft,
    },
    actionsMenu: {
      position: 'absolute',
      right: 12,
      width: 244,
      overflow: 'hidden',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      ...shadow.card,
    },
    actionsMenuItem: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      backgroundColor: colors.card,
    },
    actionsMenuItemPressed: {
      backgroundColor: colors.inputBg,
    },
    actionsMenuDeleteItem: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    actionsMenuText: {
      flex: 1,
      fontSize: 16,
      color: colors.text,
    },
    actionsMenuDeleteText: {
      color: colors.danger,
      fontWeight: '600',
    },
    modalContent: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      padding: 24,
      width: '100%',
      maxWidth: 400,
      alignItems: 'center',
      ...shadow.card,
    },
    modalIconCircle: {
      width: 56,
      height: 56,
      borderRadius: radius.full,
      backgroundColor: colors.primarySoft,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 14,
    },
    modalTitle: {
      fontSize: 19,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    modalDescription: {
      fontSize: 15,
      color: colors.textSecondary,
      marginBottom: 20,
      textAlign: 'center',
    },
    modalInput: {
      backgroundColor: colors.inputBg,
      borderRadius: radius.md,
      padding: 14,
      marginBottom: 16,
      fontSize: 16,
      color: colors.text,
      alignSelf: 'stretch',
    },
    modalButtons: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 8,
      alignSelf: 'stretch',
    },
    modalButton: {
      flex: 1,
      padding: 14,
      borderRadius: radius.md,
      alignItems: 'center',
    },
    cancelButton: {
      backgroundColor: colors.inputBg,
    },
    setButton: {
      backgroundColor: colors.primary,
    },
    removeButton: {
      backgroundColor: colors.dangerSoft,
    },
    modalButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    setButtonText: {
      color: colors.card,
    },
    removeButtonText: {
      color: colors.danger,
    },
  });

export default NoteEditorScreen;
