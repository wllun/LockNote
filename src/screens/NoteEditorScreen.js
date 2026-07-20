import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Alert,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { noteRepo } from '../db/noteRepo';
import { radius, shadow, useTheme } from '../theme';

const NoteEditorScreen = ({ route, navigation }) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { noteId } = route.params;
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [lockPassword, setLockPassword] = useState('');
  const saveTimeout = useRef(null);
  const contentRef = useRef(null);
  // Latest values for the unmount cleanup (state in a [] effect is stale).
  const latest = useRef({ title: '', content: '', hasPassword: false, isPinned: false, deleted: false });
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
        };
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
          await noteRepo.update(noteId, { title: newTitle, content: newContent });
        } catch (error) {
          console.error('Auto-save failed:', error);
        }
      }, 800);
    },
    [noteId]
  );

  const handleTitleChange = (text) => {
    setTitle(text);
    latest.current.title = text;
    autoSave(text, content);
  };

  const handleContentChange = (text) => {
    setContent(text);
    latest.current.content = text;
    autoSave(title, text);
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

  const handleDelete = () => {
    Alert.alert(
      'Delete Note',
      'Are you sure you want to delete this note?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (saveTimeout.current) {
                clearTimeout(saveTimeout.current);
                saveTimeout.current = null;
              }
              latest.current.deleted = true;
              await noteRepo.softDelete(noteId);
              navigation.goBack();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete note');
            }
          },
        },
      ]
    );
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
      const { title, content, hasPassword, isPinned, deleted } = latest.current;
      if (deleted) return;
      if (!title.trim() && !content.trim() && !hasPassword && !isPinned) {
        noteRepo.hardDelete(noteId).catch(() => {});
      } else if (pending) {
        noteRepo.update(noteId, { title, content }).catch(() => {});
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
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={handleTogglePin}
            style={[styles.headerButton, isPinned && styles.headerButtonActive]}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isPinned ? 'pin' : 'pin-outline'}
              size={20}
              color={isPinned ? colors.primary : colors.textSecondary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowLockModal(true)}
            style={[styles.headerButton, hasPassword && styles.headerButtonActive]}
            activeOpacity={0.7}
          >
            <Ionicons
              name={hasPassword ? 'lock-closed' : 'lock-open-outline'}
              size={20}
              color={hasPassword ? colors.folder : colors.textSecondary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleDelete}
            style={styles.headerButton}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
          </TouchableOpacity>
        </View>
      </View>

      <TextInput
        style={styles.titleInput}
        placeholder="Title"
        placeholderTextColor={colors.textTertiary}
        value={title}
        onChangeText={handleTitleChange}
        multiline
        blurOnSubmit
        returnKeyType="next"
        onSubmitEditing={() => contentRef.current?.focus()}
      />
      <TextInput
        ref={contentRef}
        style={styles.contentInput}
        placeholder="Start writing..."
        placeholderTextColor={colors.textTertiary}
        value={content}
        onChangeText={handleContentChange}
        multiline
        textAlignVertical="top"
        autoFocus={!title}
      />

      <Modal visible={showLockModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
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
        </View>
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
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    headerActions: {
      flexDirection: 'row',
      gap: 8,
    },
    headerButton: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerButtonActive: {
      backgroundColor: colors.folderSoft,
    },
    titleInput: {
      fontSize: 26,
      fontWeight: '700',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 4,
      color: colors.text,
    },
    contentInput: {
      flex: 1,
      fontSize: 16,
      paddingHorizontal: 20,
      paddingTop: 8,
      color: colors.text,
      lineHeight: 25,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15,23,42,0.45)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
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
