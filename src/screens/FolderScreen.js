import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppAlert as Alert } from '../utils/app-alert';
import { Ionicons } from '@expo/vector-icons';
import { folderRepo } from '../db/folderRepo';
import { noteRepo } from '../db/noteRepo';
import NoteItem from '../components/NoteItem';
import PasswordModal from '../components/PasswordModal';
import CreateNoteTypeModal from '../components/create-note-type-modal';
import ItemActionsModal from '../components/ItemActionsModal';
import MoveNoteModal from '../components/MoveNoteModal';
import { hashPassword } from '../utils/crypto';
import { radius, shadow, useTheme } from '../theme';
import { EXPENSE_NOTE_TYPE } from '../utils/expense-record.mjs';
import { CHECKLIST_NOTE_TYPE } from '../utils/checklist-note.mjs';
import { confirmDestructiveAction } from '../utils/confirm-action';
import { REMINDER_NOTE_TYPE } from '../utils/reminder-note.mjs';
import { softDeleteNoteWithCleanup } from '../utils/reminder-cleanup';
import { formatNoteUpdatedAt } from '../utils/note-timestamp.mjs';
import {
  LEGACY_HOME_VIEW_MODE_STORAGE_KEY,
  NOTE_VIEW_MODE_STORAGE_KEY,
  resolveViewModePreferences,
} from '../utils/note-view-mode.mjs';

const editorRouteFor = (note) => {
  if (note.note_type === EXPENSE_NOTE_TYPE) return 'ExpenseRecordEditor';
  if (note.note_type === CHECKLIST_NOTE_TYPE) return 'ChecklistEditor';
  if (note.note_type === REMINDER_NOTE_TYPE) return 'ReminderEditor';
  return 'NoteEditor';
};

const FolderHeaderTitle = ({ name, onSave, colors, styles }) => {
  const [draftName, setDraftName] = useState(name);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isEditing) setDraftName(name);
  }, [isEditing, name]);

  const finishEditing = async () => {
    if (isSaving) return;

    const nextName = draftName.trim();
    setIsEditing(false);
    if (!nextName) {
      setDraftName(name);
      Alert.alert('Error', 'Please enter a folder name');
      return;
    }
    if (nextName === name) {
      setDraftName(name);
      return;
    }

    setIsSaving(true);
    const didSave = await onSave(nextName);
    setIsSaving(false);
    if (!didSave) setDraftName(name);
  };

  if (isEditing) {
    return (
      <View style={[styles.headerTitleField, styles.headerTitleFieldFocused]}>
        <TextInput
          style={styles.headerTitleInput}
          value={draftName}
          onChangeText={setDraftName}
          onBlur={finishEditing}
          autoFocus
          selectTextOnFocus
          returnKeyType="done"
          blurOnSubmit
          editable={!isSaving}
          accessibilityLabel="Folder name"
          accessibilityHint="Edits the title of this folder"
        />
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={styles.headerTitleButton}
      activeOpacity={0.65}
      onPress={() => setIsEditing(true)}
      accessibilityRole="button"
      accessibilityLabel={`Rename folder ${name}`}
      accessibilityHint="Edits the folder name in the title"
    >
      <Text style={styles.headerTitleText} numberOfLines={1}>
        {name}
      </Text>
      <Ionicons name="create-outline" size={17} color={colors.textSecondary} />
    </TouchableOpacity>
  );
};

const FolderScreen = ({ route, navigation }) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { folderId, folderName } = route.params;
  const [currentFolderName, setCurrentFolderName] = useState(folderName || 'Folder');
  const [notes, setNotes] = useState([]);
  const requestedNoteViewMode = route.params?.noteViewMode ?? route.params?.viewMode;
  const [noteViewMode, setNoteViewMode] = useState(() =>
    resolveViewModePreferences({ noteMode: requestedNoteViewMode }).noteViewMode
  );
  const [refreshing, setRefreshing] = useState(false);
  const [showNoteTypeModal, setShowNoteTypeModal] = useState(false);
  const [passwordModal, setPasswordModal] = useState({
    visible: false,
    note: null,
    action: 'open',
  });
  const [itemActions, setItemActions] = useState({
    visible: false,
    note: null,
  });
  const [moveNoteModal, setMoveNoteModal] = useState({
    visible: false,
    note: null,
    folders: [],
  });

  useEffect(() => {
    if (requestedNoteViewMode) {
      setNoteViewMode(
        resolveViewModePreferences({ noteMode: requestedNoteViewMode }).noteViewMode
      );
      return undefined;
    }

    let active = true;
    Promise.all([
      AsyncStorage.getItem(NOTE_VIEW_MODE_STORAGE_KEY),
      AsyncStorage.getItem(LEGACY_HOME_VIEW_MODE_STORAGE_KEY),
    ])
      .then(([noteMode, legacyMode]) => {
        if (!active) return;
        setNoteViewMode(resolveViewModePreferences({ noteMode, legacyMode }).noteViewMode);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [requestedNoteViewMode]);

  const loadNotes = useCallback(async () => {
    try {
      const notesData = await noteRepo.getByFolderId(folderId);
      setNotes(notesData);
    } catch (error) {
      Alert.alert('Error', 'Failed to load notes');
    } finally {
      setRefreshing(false);
    }
  }, [folderId]);

  const onRefresh = () => {
    setRefreshing(true);
    loadNotes();
  };

  const loadFolder = useCallback(async () => {
    try {
      const folder = await folderRepo.getById(folderId);
      if (folder) {
        setCurrentFolderName(folder.name);
        navigation.setParams({ folderName: folder.name });
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load folder');
    }
  }, [folderId, navigation]);

  const handleRenameFolder = useCallback(async (nextName) => {
    try {
      await folderRepo.update(folderId, { name: nextName });
      setCurrentFolderName(nextName);
      navigation.setParams({ folderName: nextName });
      return true;
    } catch (error) {
      Alert.alert('Error', 'Failed to rename folder');
      return false;
    }
  }, [folderId, navigation]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: currentFolderName,
      headerTitle: () => (
        <FolderHeaderTitle
          name={currentFolderName}
          onSave={handleRenameFolder}
          colors={colors}
          styles={styles}
        />
      ),
    });
  }, [colors, currentFolderName, handleRenameFolder, navigation, styles]);

  const handleCreateNote = async (type = 'note') => {
    try {
      const note = await noteRepo.create(folderId, '', '', null, type);
      navigation.navigate(editorRouteFor(note), { noteId: note.id });
    } catch (error) {
      Alert.alert(
        'Error',
        type === EXPENSE_NOTE_TYPE
          ? 'Failed to create expense record'
          : type === CHECKLIST_NOTE_TYPE
            ? 'Failed to create checklist'
            : 'Failed to create note'
      );
    }
  };

  const handleNotePress = (note) => {
    if (note.password) {
      setPasswordModal({ visible: true, note, action: 'open' });
    } else {
      navigation.navigate(editorRouteFor(note), { noteId: note.id });
    }
  };

  const handleToggleNotePin = async (note) => {
    try {
      await noteRepo.update(note.id, { is_pinned: !note.is_pinned });
      loadNotes();
    } catch (error) {
      Alert.alert('Error', 'Failed to update pin');
    }
  };

  const openItemActions = (note) => {
    setItemActions({ visible: true, note });
  };

  const closeItemActions = () => {
    setItemActions((current) => ({ ...current, visible: false }));
  };

  const deleteNote = async (note) => {
    try {
      await softDeleteNoteWithCleanup(noteRepo, note);
      loadNotes();
    } catch (error) {
      Alert.alert('Error', 'Failed to delete note');
    }
  };

  const confirmDeleteNote = (note) => {
    confirmDestructiveAction({
      title: 'Delete this note?',
      message: 'This note will be removed from this folder.',
      details: [
        {
          label: 'Note',
          value: note.title?.trim() || 'Untitled note',
          iconName: 'document-text-outline',
        },
        {
          label: 'Last updated',
          value: formatNoteUpdatedAt(note.updated_at).replace(/^Updated /, ''),
        },
      ],
      confirmLabel: 'Delete note',
      onConfirm: () => deleteNote(note),
    });
  };

  const handleDeleteNote = (note) => {
    if (note.password) {
      setPasswordModal({ visible: true, note, action: 'delete' });
      return;
    }
    confirmDeleteNote(note);
  };

  const openMoveNote = async (note) => {
    try {
      const availableFolders = await folderRepo.getAll();
      setMoveNoteModal({
        visible: true,
        note,
        folders: availableFolders,
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to load folders');
    }
  };

  const closeMoveNote = () => {
    setMoveNoteModal({ visible: false, note: null, folders: [] });
  };

  const handleMoveNote = async (targetFolderId) => {
    const note = moveNoteModal.note;
    if (!note) return;
    try {
      const movedNote = await noteRepo.move(note.id, targetFolderId);
      if (!movedNote) throw new Error('Note no longer exists');
      await loadNotes();
    } catch (error) {
      Alert.alert('Error', 'Failed to move note');
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadNotes();
      loadFolder();
    });
    return unsubscribe;
  }, [navigation, loadNotes, loadFolder]);

  return (
    <View style={styles.container}>
      <FlatList
        key={noteViewMode}
        data={notes}
        numColumns={noteViewMode === 'grid' ? 2 : 1}
        columnWrapperStyle={noteViewMode === 'grid' ? styles.gridRow : undefined}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => (
          <View style={noteViewMode === 'grid' ? styles.gridItem : undefined}>
            <NoteItem
              note={item}
              index={index}
              grid={noteViewMode === 'grid'}
              onPress={() => handleNotePress(item)}
              onOpenActions={() => openItemActions(item)}
            />
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={32} color={colors.textTertiary} />
            <Text style={styles.emptyText}>No notes in this folder</Text>
            <Text style={styles.emptyHint}>Tap + to create one</Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowNoteTypeModal(true)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Add note"
      >
        <Ionicons name="add" size={28} color={colors.card} />
      </TouchableOpacity>

      <CreateNoteTypeModal
        visible={showNoteTypeModal}
        onClose={() => setShowNoteTypeModal(false)}
        onSelect={handleCreateNote}
      />

      <ItemActionsModal
        visible={itemActions.visible}
        itemType="note"
        isPinned={!!itemActions.note?.is_pinned}
        onClose={closeItemActions}
        onTogglePin={() => handleToggleNotePin(itemActions.note)}
        onMove={() => openMoveNote(itemActions.note)}
        onDelete={() => handleDeleteNote(itemActions.note)}
      />

      <MoveNoteModal
        visible={moveNoteModal.visible}
        folders={moveNoteModal.folders}
        currentFolderId={folderId}
        onClose={closeMoveNote}
        onSelect={handleMoveNote}
      />

      <PasswordModal
        visible={passwordModal.visible}
        onClose={() => setPasswordModal({
          visible: false,
          note: null,
          action: 'open',
        })}
        onVerify={async (password) => {
          if (!passwordModal.note) return false;
          const hash = await hashPassword(password);
          return hash === passwordModal.note.password;
        }}
        onVerified={async () => {
          const { note, action } = passwordModal;
          setPasswordModal({ visible: false, note: null, action: 'open' });
          if (action === 'delete') {
            await deleteNote(note);
          } else {
            navigation.navigate(editorRouteFor(note), { noteId: note.id });
          }
        }}
        onReset={passwordModal.action === 'open' ? async () => {
          await noteRepo.update(passwordModal.note.id, { password: null });
          loadNotes();
        } : undefined}
        title={passwordModal.action === 'delete' ? 'Delete this locked note?' : 'Locked'}
        subtitle={passwordModal.action === 'delete'
          ? 'Enter its password to confirm deletion. This note will be removed from this folder.'
          : 'Enter the password to continue'}
        verifyLabel={passwordModal.action === 'delete' ? 'Delete note' : 'Unlock'}
        variant={passwordModal.action === 'delete' ? 'danger' : 'default'}
        details={passwordModal.action === 'delete' && passwordModal.note ? [
          {
            label: 'Note',
            value: passwordModal.note.title?.trim() || 'Untitled note',
            iconName: 'document-text-outline',
          },
          {
            label: 'Last updated',
            value: formatNoteUpdatedAt(passwordModal.note.updated_at).replace(/^Updated /, ''),
          },
        ] : []}
      />
    </View>
  );
};

const makeStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    headerTitleButton: {
      minHeight: 44,
      maxWidth: 240,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 8,
    },
    headerTitleText: {
      flexShrink: 1,
      color: colors.text,
      fontSize: 17,
      fontWeight: '700',
    },
    headerTitleField: {
      width: 220,
      maxWidth: '100%',
      height: 40,
      paddingHorizontal: 10,
      justifyContent: 'center',
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
    },
    headerTitleFieldFocused: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    headerTitleInput: {
      minWidth: 0,
      height: 38,
      paddingVertical: 0,
      color: colors.text,
      fontSize: 17,
      fontWeight: '700',
      outlineStyle: 'none',
    },
    listContent: {
      padding: 16,
      paddingBottom: 100,
      flexGrow: 1,
    },
    gridRow: {
      gap: 10,
      alignItems: 'stretch',
    },
    gridItem: {
      flex: 1,
      maxWidth: '48.5%',
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    emptyText: {
      color: colors.textSecondary,
      fontSize: 15,
      fontWeight: '500',
    },
    emptyHint: {
      color: colors.textTertiary,
      fontSize: 13,
    },
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 24,
      width: 58,
      height: 58,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      ...shadow.fab,
    },
  });

export default FolderScreen;
