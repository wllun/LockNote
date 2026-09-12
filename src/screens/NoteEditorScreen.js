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
  Keyboard,
} from 'react-native';
import { AppAlert as Alert } from '../utils/app-alert';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { noteRepo } from '../db/noteRepo';
import EditorHistoryButtons from '../components/editor-history-buttons';
import NoteExportModal from '../components/NoteExportModal';
import NoteShareModal from '../components/NoteShareModal';
import CollaborationFooter from '../components/CollaborationFooter';
import NoteColorModal from '../components/note-color-modal';
import NoteBackgroundModal from '../components/note-background-modal';
import NoteBackgroundLayer from '../components/note-background-layer';
import NoteAttachmentGallery from '../components/note-attachment-gallery';
import ManageNoteLockModal from '../components/manage-note-lock-modal';
import { collaborationService } from '../services/collaborationService';
import { lockPasswordService } from '../services/lockPasswordService';
import PasswordModal from '../components/PasswordModal';
import { confirmDestructiveAction } from '../utils/confirm-action';
import { useEditorUndo } from '../utils/use-editor-undo';
import { radius, shadow, useTheme } from '../theme';
import { useAwaitedEditorExit } from '../utils/use-awaited-editor-exit';
import { getEditorExitDisposition } from '../utils/editor-exit-disposition.mjs';
import {
  constrainNormalNoteContent,
  NORMAL_NOTE_CONTENT_MAX_CHARACTERS,
} from '../utils/note-limits.mjs';
import {
  DEFAULT_NOTE_COLOR,
  getNoteColorTheme,
  normalizeNoteColor,
} from '../utils/note-color.mjs';
import { noteColorPreference } from '../utils/note-color-preference';
import { noteBackgroundPreference } from '../utils/note-background-preference';
import { createNoteDeleteDetail } from '../utils/note-type-presentation.mjs';
import { isReadOnlyCollaborativeNote } from '../utils/collaboration-note.mjs';
import { attachmentRepo } from '../db/attachmentRepo';
import { pickNoteAttachments } from '../utils/note-attachment-picker';
import {
  MAX_NOTE_ATTACHMENTS,
  moveInlineAttachment,
  normalizeAttachmentDisplayWidthRatio,
  placeInlineAttachment,
  replaceInlineTextBlock,
} from '../utils/note-attachment.mjs';
import { attachmentCloudService } from '../services/attachmentCloudService';

const NoteEditorScreen = ({ route, navigation }) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { noteId, isNewDraft = false, shared = false } = route.params;
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [noteColor, setNoteColor] = useState(DEFAULT_NOTE_COLOR);
  const [showColorModal, setShowColorModal] = useState(false);
  const [noteBackgroundUri, setNoteBackgroundUri] = useState(null);
  const [showBackgroundModal, setShowBackgroundModal] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showDeletePasswordModal, setShowDeletePasswordModal] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [isTitleFocused, setIsTitleFocused] = useState(false);
  const saveTimeout = useRef(null);
  const loadCompletedRef = useRef(false);
  const contentEditorRef = useRef(null);
  const contentLimitDialogShown = useRef(false);
  const insertionOffsetRef = useRef(0);
  // Latest values for the unmount cleanup (state in a [] effect is stale).
  const latest = useRef({ noteId, title: '', content: '', attachments: [], hasPassword: false, isPinned: false, color: DEFAULT_NOTE_COLOR, backgroundUri: null, attachmentCount: 0, cloudId: null, readOnly: false, deleted: false });
  const {
    canRedo,
    canUndo,
    remember,
    takeRedo,
    takeUndo,
    clearUndo,
  } = useEditorUndo();
  const insets = useSafeAreaInsets();

  const loadNote = async () => {
    try {
      const note = await noteRepo.getById(noteId);
      if (note) {
        const [localColor, localBackgroundUri, localAttachments] = await Promise.all([
          noteColorPreference.load(noteId),
          noteBackgroundPreference.load(noteId),
          attachmentRepo.listByNoteId(noteId),
        ]);
        setTitle(note.title);
        setContent(note.content);
        setHasPassword(!!note.password);
        setIsPinned(!!note.is_pinned);
        setNoteColor(localColor);
        setNoteBackgroundUri(localBackgroundUri);
        setAttachments(localAttachments);
        const readOnly = Boolean(note.cloud_id) || isReadOnlyCollaborativeNote(note);
        setIsReadOnly(readOnly);
        if (readOnly) {
          if (saveTimeout.current) clearTimeout(saveTimeout.current);
          saveTimeout.current = null;
          setIsTitleFocused(false);
          Keyboard.dismiss();
        }
        latest.current = {
          ...latest.current,
          noteId,
          title: note.title,
          content: note.content,
          attachments: localAttachments,
          hasPassword: !!note.password,
          isPinned: !!note.is_pinned,
          color: localColor,
          backgroundUri: localBackgroundUri,
          attachmentCount: localAttachments.length,
          cloudId: note.cloud_id,
          readOnly,
        };
        loadCompletedRef.current = true;
        insertionOffsetRef.current = note.content.length;
        clearUndo();
        attachmentCloudService.syncNote(note)
          .then((syncedAttachments) => {
            if (!loadCompletedRef.current || latest.current.noteId !== noteId) return;
            setAttachments(syncedAttachments);
            latest.current.attachments = syncedAttachments;
            latest.current.attachmentCount = syncedAttachments.length;
          })
          .catch(() => {});
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load note');
    }
  };

  const handleCollaborationAccessChange = useCallback((access) => {
    if (!access?.collaborative) return;
    const readOnly = access.canEdit !== true;
    latest.current.readOnly = readOnly;
    setIsReadOnly(readOnly);
    if (readOnly) {
      setIsTitleFocused(false);
      Keyboard.dismiss();
    }
  }, []);

  const autoSave = useCallback(
    (newTitle, newContent) => {
      if (latest.current.readOnly) return;
      collaborationService.stageDraft(noteId, {
        title: newTitle,
        content: newContent,
      });
      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current);
      }
      saveTimeout.current = setTimeout(async () => {
        saveTimeout.current = null;
        try {
          await collaborationService.save(noteId, { title: newTitle, content: newContent });
          const layout = latest.current.attachments;
          for (const attachment of layout) {
            await attachmentRepo.update(attachment.id, {
              anchor_offset: attachment.anchor_offset,
              display_order: attachment.display_order,
              display_width_ratio: attachment.display_width_ratio,
            });
          }
          const note = await noteRepo.getById(noteId);
          await attachmentCloudService.reorder(note, layout).catch(() => {});
        } catch (error) {
          console.error('Auto-save failed:', error);
        }
      }, 800);
    },
    [noteId]
  );

  const handleTitleChange = (text) => {
    if (latest.current.readOnly) return;
    remember(getHistorySnapshot(), 'title');
    setTitle(text);
    latest.current.title = text;
    autoSave(text, latest.current.content);
  };

  const handleContentChange = (text, nextAttachments = latest.current.attachments, groupKey = 'content') => {
    if (latest.current.readOnly) return;
    const limited = constrainNormalNoteContent(text);
    if (limited.limitReached && !contentLimitDialogShown.current) {
      contentLimitDialogShown.current = true;
      Alert.alert(
        'Character limit reached',
        `This note can contain up to ${NORMAL_NOTE_CONTENT_MAX_CHARACTERS.toLocaleString()} characters. Additional typed or pasted text cannot be added.`
      );
    } else if (!limited.limitReached) {
      contentLimitDialogShown.current = false;
    }
    if (limited.value === latest.current.content) return;

    remember(getHistorySnapshot(), groupKey);
    setContent(limited.value);
    setAttachments(nextAttachments);
    latest.current.content = limited.value;
    latest.current.attachments = nextAttachments;
    autoSave(latest.current.title, limited.value);
  };

  const handleTextBlockChange = (block, value) => {
    const next = replaceInlineTextBlock(
      latest.current.content,
      latest.current.attachments,
      block,
      value
    );
    insertionOffsetRef.current = block.start + value.length;
    handleContentChange(next.content, next.attachments, block.id);
  };

  const handleTextSelection = (block, selection) => {
    insertionOffsetRef.current = Math.max(
      block.start,
      Math.min(block.end, block.start + (Number(selection?.start) || 0))
    );
  };

  function getHistorySnapshot() {
    return {
      title: latest.current.title,
      content: latest.current.content,
      attachmentLayout: latest.current.attachments.map((item) => ({
        id: item.id,
        anchor_offset: item.anchor_offset,
        display_order: item.display_order,
        display_width_ratio: item.display_width_ratio,
      })),
    };
  }

  const restoreHistorySnapshot = (snapshot) => {
    if (!snapshot || latest.current.readOnly) return;

    setTitle(snapshot.title);
    setContent(snapshot.content);
    const layoutById = new Map((snapshot.attachmentLayout || []).map((item) => [item.id, item]));
    const restoredAttachments = latest.current.attachments.map((item) => ({
      ...item,
      ...(layoutById.get(item.id) || {}),
    }));
    setAttachments(restoredAttachments);
    latest.current.title = snapshot.title;
    latest.current.content = snapshot.content;
    latest.current.attachments = restoredAttachments;
    insertionOffsetRef.current = Math.min(insertionOffsetRef.current, snapshot.content.length);
    autoSave(snapshot.title, snapshot.content);
  };

  const handleUndo = () => {
    restoreHistorySnapshot(takeUndo(getHistorySnapshot()));
  };

  const handleRedo = () => {
    restoreHistorySnapshot(takeRedo(getHistorySnapshot()));
  };

  const handleSetPassword = async (password) => {
    await lockPasswordService.lockNote(noteId, password);
    setHasPassword(true);
    latest.current.hasPassword = true;
  };

  const handleRemovePassword = async (password) => {
    const note = await noteRepo.getById(noteId);
    const valid = await lockPasswordService.verifyNotePassword(password, note);
    if (!valid) throw new Error('Incorrect LockNote password.');
    await noteRepo.update(noteId, { password: null });
    setHasPassword(false);
    latest.current.hasPassword = false;
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

  const handleChangeColor = async (color) => {
    const nextColor = normalizeNoteColor(color);
    setShowColorModal(false);
    setNoteColor(nextColor);
    latest.current.color = nextColor;
    try {
      await noteColorPreference.save(noteId, nextColor);
    } catch (error) {
      Alert.alert('Error', 'Failed to change note color');
    }
  };

  const handleBackgroundChanged = (uri) => {
    setNoteBackgroundUri(uri);
    latest.current.backgroundUri = uri;
  };

  const reloadAttachments = async () => {
    const next = await attachmentRepo.listByNoteId(noteId);
    setAttachments(next);
    latest.current.attachments = next;
    latest.current.attachmentCount = next.length;
    return next;
  };

  const handleAddAttachments = async () => {
    if (latest.current.readOnly || attachmentBusy) return;
    if (latest.current.attachmentCount >= MAX_NOTE_ATTACHMENTS) {
      Alert.alert('Image limit reached', 'A plain note can contain up to 20 images.');
      return;
    }
    setAttachmentBusy(true);
    try {
      const result = await pickNoteAttachments(
        noteId,
        latest.current.attachmentCount,
        Math.min(latest.current.content.length, insertionOffsetRef.current)
      );
      if (!result.canceled) {
        await reloadAttachments();
        await noteRepo.update(noteId, { title: latest.current.title });
        await attachmentCloudService.syncNote(noteId);
        await reloadAttachments();
      }
    } catch (error) {
      const message = error?.code === 'ATTACHMENT_SOURCE_TOO_LARGE'
        ? 'Choose images that are 5 MB or smaller.'
        : error?.code === 'ATTACHMENT_LIMIT_REACHED'
          ? error.message
          : error?.code === 'ATTACHMENT_OPTIMIZE_FAILED'
            ? 'One selected image could not be resized below 1 MB. Choose another image.'
            : 'LockNote could not add the selected images.';
      Alert.alert('Images not added', message);
    } finally {
      setAttachmentBusy(false);
    }
  };

  const handleMoveAttachment = async (attachmentId, direction) => {
    if (latest.current.readOnly || attachmentBusy) return;
    const currentAttachments = latest.current.attachments;
    const next = moveInlineAttachment(latest.current.content, currentAttachments, attachmentId, direction);
    const signature = (items) => items.map((item) => `${item.id}:${item.anchor_offset}:${item.display_order}`).join('|');
    if (signature(next) === signature(currentAttachments)) return;
    remember(getHistorySnapshot());
    setAttachments(next);
    latest.current.attachments = next;
    setAttachmentBusy(true);
    try {
      for (const attachment of next) {
        await attachmentRepo.update(attachment.id, {
          anchor_offset: attachment.anchor_offset,
          display_order: attachment.display_order,
          display_width_ratio: attachment.display_width_ratio,
        });
      }
      const saved = await attachmentRepo.reorder(noteId, next.map((item) => item.id));
      setAttachments(saved);
      latest.current.attachments = saved;
      await noteRepo.update(noteId, { title: latest.current.title });
      const note = await noteRepo.getById(noteId);
      attachmentCloudService.reorder(note, saved).catch(() => {});
    } catch {
      await reloadAttachments();
      Alert.alert('Image not moved', 'LockNote could not change the image order.');
    } finally {
      setAttachmentBusy(false);
    }
  };

  const handleDropAttachment = async (attachmentId, target) => {
    if (latest.current.readOnly || attachmentBusy) return;
    const currentAttachments = latest.current.attachments;
    const next = placeInlineAttachment(
      latest.current.content,
      currentAttachments,
      attachmentId,
      target
    );
    const signature = (items) => items
      .map((item) => `${item.id}:${item.anchor_offset}:${item.display_order}`)
      .join('|');
    if (signature(next) === signature(currentAttachments)) return;
    remember(getHistorySnapshot());
    setAttachments(next);
    latest.current.attachments = next;
    setAttachmentBusy(true);
    try {
      for (const attachment of next) {
        await attachmentRepo.update(attachment.id, {
          anchor_offset: attachment.anchor_offset,
          display_order: attachment.display_order,
          display_width_ratio: attachment.display_width_ratio,
        });
      }
      const saved = await attachmentRepo.reorder(noteId, next.map((item) => item.id));
      setAttachments(saved);
      latest.current.attachments = saved;
      const note = await noteRepo.getById(noteId);
      attachmentCloudService.reorder(note, saved).catch(() => {});
    } catch {
      await reloadAttachments();
      Alert.alert('Image not moved', 'LockNote could not move the image.');
    } finally {
      setAttachmentBusy(false);
    }
  };

  const handleResizeAttachment = async (attachmentId, widthRatio) => {
    if (latest.current.readOnly || attachmentBusy) return;
    const normalizedRatio = normalizeAttachmentDisplayWidthRatio(widthRatio);
    const selected = latest.current.attachments.find((item) => item.id === attachmentId);
    if (!selected || Math.abs(selected.display_width_ratio - normalizedRatio) < 0.005) return;
    remember(getHistorySnapshot());
    const next = latest.current.attachments.map((item) => item.id === attachmentId
      ? { ...item, display_width_ratio: normalizedRatio }
      : item);
    setAttachments(next);
    latest.current.attachments = next;
    try {
      await attachmentRepo.update(attachmentId, { display_width_ratio: normalizedRatio });
      const note = await noteRepo.getById(noteId);
      attachmentCloudService.reorder(note, next).catch(() => {});
    } catch {
      await reloadAttachments();
      Alert.alert('Image not resized', 'LockNote could not save the image size.');
    }
  };

  const handleRemoveAttachment = (attachment) => {
    if (!attachment || latest.current.readOnly || attachmentBusy) return;
    Alert.alert(
      'Remove this image?',
      '',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setAttachmentBusy(true);
            try {
              const note = await noteRepo.getById(noteId);
              await attachmentCloudService.remove(note, attachment);
              await attachmentRepo.remove(attachment.id);
              await reloadAttachments();
              await noteRepo.update(noteId, { title: latest.current.title });
            } catch {
              Alert.alert('Image not removed', 'LockNote could not remove this image.');
            } finally {
              setAttachmentBusy(false);
            }
          },
        },
      ]
    );
  };

  const deleteNote = async () => {
    try {
      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current);
        saveTimeout.current = null;
      }
      latest.current.deleted = true;
      await collaborationService.delete(noteId);
      await noteColorPreference.remove(noteId);
      await noteBackgroundPreference.removeQuietly(noteId);
      navigation.goBack();
    } catch (error) {
      latest.current.deleted = false;
      Alert.alert('Error', 'Failed to delete note');
    }
  };

  const confirmDelete = () => {
    confirmDestructiveAction({
      title: 'Delete this note?',
      details: [createNoteDeleteDetail('note', title)],
      confirmLabel: 'Delete',
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
    loadCompletedRef.current = false;
    latest.current.noteId = noteId;
    Keyboard.dismiss();
    loadNote();
    return () => {
      loadCompletedRef.current = false;
    };
  }, [noteId]);

  const needsExitCleanup = useCallback(() => {
    const { title, content, hasPassword, isPinned, color, backgroundUri, attachmentCount, cloudId, deleted } = latest.current;
    const empty = !cloudId && !title.trim() && !content.trim() && !hasPassword && !isPinned && color === DEFAULT_NOTE_COLOR && !backgroundUri && !attachmentCount;
    return getEditorExitDisposition({
      loadCompleted: loadCompletedRef.current,
      isNewDraft,
      isEmpty: empty,
      isDeleted: deleted,
      hasPendingSave: !!saveTimeout.current,
    }) !== 'none';
  }, [isNewDraft]);

  const finalizeExit = useCallback(async () => {
    const pending = saveTimeout.current;
    const { title, content, hasPassword, isPinned, color, backgroundUri, attachmentCount, cloudId, deleted } = latest.current;
    const disposition = getEditorExitDisposition({
      loadCompleted: loadCompletedRef.current,
      isNewDraft,
      isEmpty: !cloudId && !title.trim() && !content.trim() && !hasPassword && !isPinned && color === DEFAULT_NOTE_COLOR && !backgroundUri && !attachmentCount,
      isDeleted: deleted,
      hasPendingSave: !!pending,
    });
    if (disposition === 'none') return;
    if (pending) clearTimeout(pending);
    saveTimeout.current = null;

    if (latest.current.readOnly) return;

    if (disposition === 'delete') {
      await attachmentRepo.removeAll(noteId);
      await noteRepo.hardDelete(noteId);
      await noteColorPreference.remove(noteId);
      await noteBackgroundPreference.removeQuietly(noteId);
    } else {
      await collaborationService.save(noteId, { title, content });
      const layout = latest.current.attachments;
      for (const attachment of layout) {
        await attachmentRepo.update(attachment.id, {
          anchor_offset: attachment.anchor_offset,
          display_order: attachment.display_order,
          display_width_ratio: attachment.display_width_ratio,
        });
      }
      const note = await noteRepo.getById(noteId);
      await attachmentCloudService.reorder(note, layout).catch(() => {});
    }
  }, [isNewDraft, noteId]);

  useAwaitedEditorExit({ navigation, needsCleanup: needsExitCleanup, cleanup: finalizeExit });

  const noteColorTheme = getNoteColorTheme(noteColor, colors);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top, backgroundColor: noteColorTheme.surface }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <NoteBackgroundLayer uri={noteBackgroundUri} surface={noteColorTheme.surface} />
      <View style={[styles.header, { backgroundColor: noteBackgroundUri ? 'transparent' : noteColorTheme.surface }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerButton}
          activeOpacity={0.7}
          hitSlop={4}
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
            editable={!isReadOnly}
            onChangeText={handleTitleChange}
            onFocus={() => setIsTitleFocused(true)}
            onBlur={() => setIsTitleFocused(false)}
            blurOnSubmit
            returnKeyType="next"
            onSubmitEditing={() => contentEditorRef.current?.focus()}
            accessibilityLabel="Note title"
            accessibilityHint={isReadOnly ? 'This shared note is view only' : 'Edits the title of this note'}
          />
        </View>

        <EditorHistoryButtons
          canRedo={canRedo && !isReadOnly}
          canUndo={canUndo && !isReadOnly}
          colors={colors}
          disabledStyle={styles.headerButtonDisabled}
          onRedo={handleRedo}
          onUndo={handleUndo}
          style={styles.headerButton}
        />

        <TouchableOpacity
          onPress={() => setShowActionsMenu(true)}
          style={styles.headerButton}
          activeOpacity={0.7}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="More note actions"
          accessibilityHint="Shows pin, password, export, and delete actions"
          accessibilityState={{ expanded: showActionsMenu }}
        >
          <Ionicons name="ellipsis-vertical" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={[styles.contentArea, { backgroundColor: noteBackgroundUri ? 'transparent' : noteColorTheme.surface }]}>
        <NoteAttachmentGallery
          ref={contentEditorRef}
          content={content}
          attachments={attachments}
          busy={attachmentBusy}
          readOnly={isReadOnly}
          maxLength={NORMAL_NOTE_CONTENT_MAX_CHARACTERS}
          onChangeTextBlock={handleTextBlockChange}
          onSelectionChange={handleTextSelection}
          onMove={handleMoveAttachment}
          onDrop={handleDropAttachment}
          onResize={handleResizeAttachment}
          onRemove={handleRemoveAttachment}
        />
      </View>

      <CollaborationFooter
        noteId={noteId}
        onRemoteNote={loadNote}
        onEditAccessChange={handleCollaborationAccessChange}
        onOffline={shared ? navigation.goBack : undefined}
      />

      <Modal
        visible={showActionsMenu}
        animationType={showActionsMenu ? 'fade' : 'none'}
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
              onPress={() => { setShowActionsMenu(false); handleAddAttachments(); }}
              disabled={isReadOnly || attachmentBusy || attachments.length >= MAX_NOTE_ATTACHMENTS}
              accessibilityRole="button"
              accessibilityLabel="Insert images at the text cursor"
              accessibilityState={{ disabled: isReadOnly || attachmentBusy || attachments.length >= MAX_NOTE_ATTACHMENTS }}
            >
              <Ionicons name="images-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.actionsMenuText}>Insert images</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.actionsMenuItem, pressed && styles.actionsMenuItemPressed]}
              onPress={() => { setShowActionsMenu(false); setShowShareModal(true); }}
              accessibilityRole="button"
            >
              <Ionicons name="people-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.actionsMenuText}>Share</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.actionsMenuItem, pressed && styles.actionsMenuItemPressed]}
              onPress={() => { setShowActionsMenu(false); setShowColorModal(true); }}
              accessibilityRole="button"
              accessibilityLabel="Change note color"
            >
              <Ionicons name="color-palette-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.actionsMenuText}>Color</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.actionsMenuItem, pressed && styles.actionsMenuItemPressed]}
              onPress={() => { setShowActionsMenu(false); setShowBackgroundModal(true); }}
              accessibilityRole="button"
              accessibilityLabel="Change note background"
            >
              <Ionicons name="image-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.actionsMenuText}>Background</Text>
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
              <Text style={styles.actionsMenuText}>Export</Text>
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
                hasPassword ? 'Unlock note' : 'Lock note'
              }
            >
              <Ionicons
                name={hasPassword ? 'lock-open-outline' : 'lock-closed-outline'}
                size={20}
                color={hasPassword ? colors.folder : colors.textSecondary}
              />
              <Text style={styles.actionsMenuText}>
                {hasPassword ? 'Unlock' : 'Lock'}
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
        attachments={attachments}
      />
      <NoteColorModal
        visible={showColorModal}
        value={noteColor}
        onClose={() => setShowColorModal(false)}
        onSelect={handleChangeColor}
      />
      <NoteBackgroundModal
        visible={showBackgroundModal}
        noteId={noteId}
        value={noteBackgroundUri}
        onClose={() => setShowBackgroundModal(false)}
        onChanged={handleBackgroundChanged}
      />
      <NoteShareModal visible={showShareModal} noteId={noteId} onClose={() => setShowShareModal(false)} onChanged={loadNote} onLeft={() => navigation.goBack()} />

      <PasswordModal
        visible={showDeletePasswordModal}
        onClose={() => setShowDeletePasswordModal(false)}
        onVerify={async (password) => {
          const note = await noteRepo.getById(noteId);
          return lockPasswordService.verifyNotePassword(password, note);
        }}
        onVerified={async () => {
          setShowDeletePasswordModal(false);
          await deleteNote();
        }}
        passwordLabel="LockNote password"
        title="Delete this note?"
        subtitle="Enter its password to confirm deletion. This note will be removed from your notes."
        verifyLabel="Delete"
        variant="danger"
        details={[
          createNoteDeleteDetail('note', title),
        ]}
      />

      <ManageNoteLockModal
        visible={showLockModal}
        isLocked={hasPassword}
        onClose={() => setShowLockModal(false)}
        onLock={handleSetPassword}
        onUnlock={handleRemovePassword}
      />
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
      gap: 0,
      paddingHorizontal: 8,
      paddingVertical: 8,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerButton: {
      width: 36,
      height: 44,
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
