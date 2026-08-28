import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  RefreshControl,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppAlert as Alert } from '../utils/app-alert';
import { Ionicons } from '@expo/vector-icons';
import { folderRepo } from '../db/folderRepo';
import { noteRepo } from '../db/noteRepo';
import { hashPassword } from '../utils/crypto';
import { lockPasswordService } from '../services/lockPasswordService';
import FolderItem from '../components/FolderItem';
import NoteItem from '../components/NoteItem';
import PasswordModal from '../components/PasswordModal';
import CreateNoteTypeModal from '../components/create-note-type-modal';
import ItemActionsModal from '../components/ItemActionsModal';
import MoveNoteModal from '../components/MoveNoteModal';
import NoteColorModal from '../components/note-color-modal';
import ManageNoteLockModal from '../components/manage-note-lock-modal';
import KeyboardAwareModalContent from '../components/keyboard-aware-modal-content';
import { radius, shadow, useTheme } from '../theme';
import { EXPENSE_NOTE_TYPE } from '../utils/expense-record.mjs';
import { CHECKLIST_NOTE_TYPE } from '../utils/checklist-note.mjs';
import { confirmDestructiveAction } from '../utils/confirm-action';
import { REMINDER_NOTE_TYPE } from '../utils/reminder-note.mjs';
import { softDeleteNoteWithCleanup } from '../utils/reminder-cleanup';
import { formatNoteUpdatedAt } from '../utils/note-timestamp.mjs';
import { noteColorPreference } from '../utils/note-color-preference';
import {
  FOLDER_VIEW_MODES,
  FOLDER_VIEW_MODE_STORAGE_KEY,
  LEGACY_HOME_VIEW_MODE_STORAGE_KEY,
  NOTE_VIEW_MODES,
  NOTE_VIEW_MODE_STORAGE_KEY,
  resolveViewModePreferences,
} from '../utils/note-view-mode.mjs';

const editorRouteFor = (note) => {
  if (note.note_type === EXPENSE_NOTE_TYPE) return 'ExpenseRecordEditor';
  if (note.note_type === CHECKLIST_NOTE_TYPE) return 'ChecklistEditor';
  if (note.note_type === REMINDER_NOTE_TYPE) return 'ReminderEditor';
  return 'NoteEditor';
};

const getFolderNoteCounts = async (folderList) => {
  const countEntries = await Promise.all(
    folderList.map(async (folder) => [folder.id, await folderRepo.getNoteCount(folder.id)])
  );
  return Object.fromEntries(countEntries);
};

const HomeScreen = ({ navigation }) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [folders, setFolders] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [showNoteTypeModal, setShowNoteTypeModal] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [folderPassword, setFolderPassword] = useState('');
  const [passwordModal, setPasswordModal] = useState({
    visible: false,
    item: null,
    type: '',
    action: 'open',
  });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ folders: [], notes: [] });
  const [itemActions, setItemActions] = useState({
    visible: false,
    item: null,
    type: '',
  });
  const [moveNoteModal, setMoveNoteModal] = useState({
    visible: false,
    note: null,
    folders: [],
  });
  const [colorNote, setColorNote] = useState(null);
  const [lockActionNote, setLockActionNote] = useState(null);
  const [folderNoteCounts, setFolderNoteCounts] = useState({});
  const [folderViewMode, setFolderViewMode] = useState('list');
  const [noteViewMode, setNoteViewMode] = useState('list');

  const loadData = useCallback(async () => {
    try {
      const [foldersData, notesData] = await Promise.all([
        folderRepo.getAll(),
        noteRepo.getRootNotes(),
      ]);
      const [noteCounts, coloredNotes] = await Promise.all([
        getFolderNoteCounts(foldersData),
        noteColorPreference.applyToNotes(notesData),
      ]);
      setFolders(foldersData);
      setNotes(coloredNotes);
      setFolderNoteCounts(noteCounts);
    } catch (error) {
      Alert.alert('Error', 'Failed to load data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Search across all folders and all notes (root + inside folders).
  const searching = query.trim().length > 0;
  const runSearch = useCallback(async (q) => {
    try {
      const [f, n] = await Promise.all([folderRepo.search(q), noteRepo.search(q)]);
      const [noteCounts, coloredNotes] = await Promise.all([
        getFolderNoteCounts(f),
        noteColorPreference.applyToNotes(n),
      ]);
      setResults({ folders: f, notes: coloredNotes });
      setFolderNoteCounts((current) => ({ ...current, ...noteCounts }));
    } catch (error) {
      setResults({ folders: [], notes: [] });
    }
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults({ folders: [], notes: [] });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [f, n] = await Promise.all([folderRepo.search(q), noteRepo.search(q)]);
        const [noteCounts, coloredNotes] = await Promise.all([
          getFolderNoteCounts(f),
          noteColorPreference.applyToNotes(n),
        ]);
        if (!cancelled) {
          setResults({ folders: f, notes: coloredNotes });
          setFolderNoteCounts((current) => ({ ...current, ...noteCounts }));
        }
      } catch (error) {
        if (!cancelled) setResults({ folders: [], notes: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query]);

  useEffect(() => {
    let active = true;
    Promise.all([
      AsyncStorage.getItem(FOLDER_VIEW_MODE_STORAGE_KEY),
      AsyncStorage.getItem(NOTE_VIEW_MODE_STORAGE_KEY),
      AsyncStorage.getItem(LEGACY_HOME_VIEW_MODE_STORAGE_KEY),
    ])
      .then(([folderMode, noteMode, legacyMode]) => {
        if (!active) return;
        const preferences = resolveViewModePreferences({
          folderMode,
          noteMode,
          legacyMode,
        });
        setFolderViewMode(preferences.folderViewMode);
        setNoteViewMode(preferences.noteViewMode);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const changeFolderViewMode = (nextMode) => {
    if (!FOLDER_VIEW_MODES.includes(nextMode) || nextMode === folderViewMode) return;
    setFolderViewMode(nextMode);
    AsyncStorage.setItem(FOLDER_VIEW_MODE_STORAGE_KEY, nextMode).catch(() => {});
  };

  const changeNoteViewMode = (nextMode) => {
    if (!NOTE_VIEW_MODES.includes(nextMode) || nextMode === noteViewMode) return;
    setNoteViewMode(nextMode);
    AsyncStorage.setItem(NOTE_VIEW_MODE_STORAGE_KEY, nextMode).catch(() => {});
  };

  // Refresh whichever view (list or search results) is currently showing.
  const refreshCurrent = useCallback(() => {
    const q = query.trim();
    if (q) runSearch(q);
    else loadData();
  }, [query, runSearch, loadData]);

  const handleCreateFolder = async () => {
    if (!folderName.trim()) {
      Alert.alert('Error', 'Please enter a folder name');
      return;
    }
    try {
      await folderRepo.create(folderName.trim(), folderPassword || null);
      setFolderName('');
      setFolderPassword('');
      setShowFolderModal(false);
      loadData();
    } catch (error) {
      Alert.alert('Error', 'Failed to create folder');
    }
  };

  const handleCreateRootNote = async (type = 'note') => {
    try {
      const note = await noteRepo.create(null, '', '', null, type);
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

  const handleFolderPress = (folder) => {
    if (folder.password) {
      setPasswordModal({ visible: true, item: folder, type: 'folder', action: 'open' });
    } else {
      navigation.navigate('Folder', {
        folderId: folder.id,
        folderName: folder.name,
        noteViewMode,
      });
    }
  };

  const handleNotePress = (note) => {
    if (note.password) {
      setPasswordModal({ visible: true, item: note, type: 'note', action: 'open' });
    } else {
      navigation.navigate(editorRouteFor(note), { noteId: note.id });
    }
  };

  const handlePasswordVerified = async (item, type, action) => {
    setPasswordModal({ visible: false, item: null, type: '', action: 'open' });
    if (action === 'delete') {
      if (type === 'folder') confirmDeleteFolder(item);
      else await deleteNote(item);
      return;
    }
    if (type === 'folder') {
      navigation.navigate('Folder', {
        folderId: item.id,
        folderName: item.name,
        noteViewMode,
      });
    } else {
      navigation.navigate(editorRouteFor(item), { noteId: item.id });
    }
  };

  const handleToggleFolderPin = async (folder) => {
    try {
      await folderRepo.update(folder.id, { is_pinned: !folder.is_pinned });
      refreshCurrent();
    } catch (error) {
      Alert.alert('Error', 'Failed to update pin');
    }
  };

  const handleToggleNotePin = async (note) => {
    try {
      await noteRepo.update(note.id, { is_pinned: !note.is_pinned });
      refreshCurrent();
    } catch (error) {
      Alert.alert('Error', 'Failed to update pin');
    }
  };

  const handleChangeNoteColor = async (color) => {
    const note = colorNote;
    setColorNote(null);
    if (!note) return;
    try {
      await noteColorPreference.save(note.id, color);
      refreshCurrent();
    } catch (error) {
      Alert.alert('Error', 'Failed to change note color');
      refreshCurrent();
    }
  };

  const handleArchiveFolder = async (folder) => {
    try {
      const archived = await folderRepo.archive(folder.id);
      if (!archived) throw new Error('Folder no longer exists');
      refreshCurrent();
    } catch (error) {
      Alert.alert('Error', 'Failed to archive folder');
    }
  };

  const handleArchiveNote = async (note) => {
    try {
      const archived = await noteRepo.archive(note.id);
      if (!archived) throw new Error('Note no longer exists');
      refreshCurrent();
    } catch (error) {
      Alert.alert('Error', 'Failed to archive note');
    }
  };

  const lockSelectedNote = async (password) => {
    if (!lockActionNote) return;
    await lockPasswordService.lockNote(lockActionNote.id, password);
    await refreshCurrent();
  };

  const unlockSelectedNote = async (password) => {
    if (!lockActionNote) return;
    const note = await noteRepo.getById(lockActionNote.id);
    if (!await lockPasswordService.verifyNotePassword(password, note)) {
      throw new Error('Incorrect LockNote password.');
    }
    await noteRepo.update(lockActionNote.id, { password: null });
    await refreshCurrent();
  };

  const openItemActions = (item, type) => {
    setItemActions({ visible: true, item, type });
  };

  const closeItemActions = () => {
    setItemActions((current) => ({ ...current, visible: false }));
  };

  const deleteNote = async (note) => {
    try {
      await softDeleteNoteWithCleanup(noteRepo, note);
      refreshCurrent();
    } catch (error) {
      Alert.alert('Error', 'Failed to delete note');
    }
  };

  const confirmDeleteNote = (note) => {
    const noteTitle = note.title?.trim() || 'Untitled note';
    confirmDestructiveAction({
      title: 'Delete this note?',
      message: 'This note will be removed from your notes.',
      details: [
        { label: 'Note', value: noteTitle, iconName: 'document-text-outline' },
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
      setPasswordModal({
        visible: true,
        item: note,
        type: 'note',
        action: 'delete',
      });
      return;
    }
    confirmDeleteNote(note);
  };

  const confirmDeleteFolder = async (folder) => {
    try {
      const folderNotes = await noteRepo.getActiveByFolderId(folder.id);
      const noteCount = folderNotes.length;
      const detail =
        noteCount === 0
          ? 'The folder will be permanently deleted.'
          : `The folder will be permanently deleted. ${noteCount} ${
              noteCount === 1 ? 'note' : 'notes'
            } inside will move to Trash.`;

      confirmDestructiveAction({
        title: 'Delete this folder?',
        message: detail,
        details: [
          { label: 'Folder', value: folder.name, iconName: 'folder-outline' },
          {
            label: 'Contains',
            value: `${noteCount} ${noteCount === 1 ? 'note' : 'notes'}`,
          },
        ],
        confirmLabel: 'Delete folder',
        onConfirm: async () => {
          try {
            await Promise.all(
              folderNotes.map((note) => softDeleteNoteWithCleanup(noteRepo, note))
            );
            await noteRepo.detachFromFolder(folder.id);
            await folderRepo.hardDelete(folder.id);
            refreshCurrent();
          } catch (error) {
            Alert.alert('Error', 'Failed to delete folder');
          }
        },
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to inspect folder contents');
    }
  };

  const handleDeleteFolder = (folder) => {
    if (folder.password) {
      setPasswordModal({
        visible: true,
        item: folder,
        type: 'folder',
        action: 'delete',
      });
      return;
    }
    confirmDeleteFolder(folder);
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

  const handleMoveNote = async (folderId) => {
    const note = moveNoteModal.note;
    if (!note) return;
    try {
      const movedNote = await noteRepo.move(note.id, folderId);
      if (!movedNote) throw new Error('Note no longer exists');
      refreshCurrent();
    } catch (error) {
      Alert.alert('Error', 'Failed to move note');
    }
  };

  useEffect(() => {
    //👉 “register the listener in useEffect, and return a cleanup function so React removes the listener automatically to prevent duplicates.”
    const unsubscribe = navigation.addListener('focus', loadData);
    return unsubscribe;
  }, [navigation, loadData]);

  const searchBar = (
    <View style={styles.homeToolbar}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search folders and notes"
          placeholderTextColor={colors.textTertiary}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {query.length > 0 && (
          <TouchableOpacity
            onPress={() => setQuery('')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const renderViewControl = ({ scope, modes, value, onChange }) => (
    <View
      style={styles.sectionViewToggle}
      accessibilityRole="tablist"
      accessibilityLabel={`${scope} view options`}
    >
      {modes.map((mode) => {
        const selected = value === mode;
        const label = mode.charAt(0).toUpperCase() + mode.slice(1);
        const iconName = mode === 'list'
          ? 'list-outline'
          : mode === 'strip'
            ? 'albums-outline'
            : 'grid-outline';
        return (
          <TouchableOpacity
            key={mode}
            style={[styles.sectionViewButton, selected && styles.viewButtonSelected]}
            onPress={() => onChange(mode)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityLabel={`${scope} ${label.toLowerCase()} view`}
            accessibilityState={{ selected }}
          >
            <Ionicons
              name={iconName}
              size={19}
              color={selected ? colors.primary : colors.textSecondary}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderFolderItems = (folderList) => {
    const items = folderList.map((folder, index) => (
      <View
        key={folder.id}
        style={folderViewMode === 'strip' ? styles.folderStripItem : undefined}
      >
          <FolderItem
            folder={folder}
            noteCount={folderNoteCounts[folder.id] ?? 0}
            index={index}
            strip={folderViewMode === 'strip'}
            onPress={() => handleFolderPress(folder)}
            onOpenActions={() => openItemActions(folder, 'folder')}
          />
      </View>
    ));

    if (folderViewMode === 'strip') {
      return (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.folderStrip}
          contentContainerStyle={styles.folderStripContent}
        >
          {items}
        </ScrollView>
      );
    }

    return <View>{items}</View>;
  };

  const renderNoteItems = (noteList) => (
    <View style={noteViewMode === 'grid' ? styles.itemsGrid : undefined}>
      {noteList.map((note, index) => (
        <View key={note.id} style={noteViewMode === 'grid' ? styles.gridItem : undefined}>
          <NoteItem
            note={note}
            index={index}
            grid={noteViewMode === 'grid'}
            checklistProgressOnly
            reminderScheduleOnly
            onPress={() => handleNotePress(note)}
            onOpenActions={() => openItemActions(note, 'note')}
          />
        </View>
      ))}
    </View>
  );

  const renderSearchResults = () => {
    const empty = results.folders.length === 0 && results.notes.length === 0;
    if (empty) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="search-outline" size={32} color={colors.textTertiary} />
          <Text style={styles.emptyText}>No matches for “{query.trim()}”</Text>
        </View>
      );
    }
    return (
      <>
        {results.folders.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Folders</Text>
              {renderViewControl({
                scope: 'Folders',
                modes: FOLDER_VIEW_MODES,
                value: folderViewMode,
                onChange: changeFolderViewMode,
              })}
            </View>
            {renderFolderItems(results.folders)}
          </View>
        )}
        {results.notes.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Notes</Text>
              {renderViewControl({
                scope: 'Notes',
                modes: NOTE_VIEW_MODES,
                value: noteViewMode,
                onChange: changeNoteViewMode,
              })}
            </View>
            {renderNoteItems(results.notes)}
          </View>
        )}
      </>
    );
  };

  const renderDefault = () => (
    <>
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Folders</Text>
          <View style={styles.sectionHeaderActions}>
            {renderViewControl({
              scope: 'Folders',
              modes: FOLDER_VIEW_MODES,
              value: folderViewMode,
              onChange: changeFolderViewMode,
            })}
            <TouchableOpacity
              onPress={() => setShowFolderModal(true)}
              style={styles.sectionAddButton}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Add folder"
            >
              <Ionicons name="add" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
        {folders.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="folder-open-outline" size={32} color={colors.textTertiary} />
            <Text style={styles.emptyText}>No folders yet</Text>
          </View>
        ) : (
          renderFolderItems(folders)
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <View style={styles.sectionHeaderActions}>
            {renderViewControl({
              scope: 'Notes',
              modes: NOTE_VIEW_MODES,
              value: noteViewMode,
              onChange: changeNoteViewMode,
            })}
            <TouchableOpacity
              onPress={() => setShowNoteTypeModal(true)}
              style={styles.sectionAddButton}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Add note"
            >
              <Ionicons name="add" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
        {notes.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={32} color={colors.textTertiary} />
            <Text style={styles.emptyText}>No notes yet</Text>
            <Text style={styles.emptyHint}>Tap + to create one</Text>
          </View>
        ) : (
          renderNoteItems(notes)
        )}
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={[]}
        renderItem={null}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            {searchBar}
            {searching ? renderSearchResults() : renderDefault()}
          </>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      />

      {!searching && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setShowNoteTypeModal(true)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Add note"
        >
          <Ionicons name="add" size={28} color={colors.card} />
        </TouchableOpacity>
      )}

      <CreateNoteTypeModal
        visible={showNoteTypeModal}
        onClose={() => setShowNoteTypeModal(false)}
        onSelect={handleCreateRootNote}
      />

      <ItemActionsModal
        visible={itemActions.visible}
        itemType={itemActions.type}
        isPinned={!!itemActions.item?.is_pinned}
        isLocked={!!itemActions.item?.password}
        onClose={closeItemActions}
        onTogglePin={() => {
          if (itemActions.type === 'folder') {
            handleToggleFolderPin(itemActions.item);
          } else {
            handleToggleNotePin(itemActions.item);
          }
        }}
        onMove={
          itemActions.type === 'note'
            ? () => openMoveNote(itemActions.item)
            : undefined
        }
        onColor={
          itemActions.type === 'note'
            ? () => setColorNote(itemActions.item)
            : undefined
        }
        onToggleLock={
          itemActions.type === 'note'
            ? () => setLockActionNote(itemActions.item)
            : undefined
        }
        onArchive={
          itemActions.type === 'folder'
            ? () => handleArchiveFolder(itemActions.item)
            : () => handleArchiveNote(itemActions.item)
        }
        onDelete={() => {
          if (itemActions.type === 'folder') {
            handleDeleteFolder(itemActions.item);
          } else {
            handleDeleteNote(itemActions.item);
          }
        }}
      />

      <NoteColorModal
        visible={!!colorNote}
        value={colorNote?.color}
        onClose={() => setColorNote(null)}
        onSelect={handleChangeNoteColor}
      />

      <ManageNoteLockModal
        visible={!!lockActionNote}
        isLocked={!!lockActionNote?.password}
        onClose={() => setLockActionNote(null)}
        onLock={lockSelectedNote}
        onUnlock={unlockSelectedNote}
      />

      <MoveNoteModal
        visible={moveNoteModal.visible}
        folders={moveNoteModal.folders}
        currentFolderId={moveNoteModal.note?.folder_id ?? null}
        onClose={closeMoveNote}
        onSelect={handleMoveNote}
      />

      <Modal visible={showFolderModal} animationType="fade" transparent>
        <KeyboardAwareModalContent>
          <View style={styles.modalContent}>
            <View style={styles.modalIconCircle}>
              <Ionicons name="folder-open" size={26} color={colors.folder} />
            </View>
            <Text style={styles.modalTitle}>New Folder</Text>
            <TextInput
              style={styles.input}
              placeholder="Folder name"
              placeholderTextColor={colors.textTertiary}
              value={folderName}
              onChangeText={setFolderName}
              autoFocus
            />
            <TextInput
              style={styles.input}
              placeholder="Password (optional)"
              placeholderTextColor={colors.textTertiary}
              value={folderPassword}
              onChangeText={setFolderPassword}
              secureTextEntry
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                activeOpacity={0.7}
                onPress={() => setShowFolderModal(false)}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.createButton]}
                activeOpacity={0.7}
                onPress={handleCreateFolder}
              >
                <Text style={[styles.buttonText, styles.createButtonText]}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAwareModalContent>
      </Modal>

      <PasswordModal
        visible={passwordModal.visible}
        onClose={() => setPasswordModal({
          visible: false,
          item: null,
          type: '',
          action: 'open',
        })}
        onVerify={async (password) => {
          if (!passwordModal.item) return false;
          if (passwordModal.type === 'note') {
            return lockPasswordService.verifyNotePassword(
              password,
              passwordModal.item
            );
          }
          const hash = await hashPassword(password);
          return hash === passwordModal.item.password;
        }}
        onVerified={() => handlePasswordVerified(
          passwordModal.item,
          passwordModal.type,
          passwordModal.action
        )}
        allowLockPasswordRecovery={
          passwordModal.type === 'note' && passwordModal.action === 'open'
        }
        passwordLabel={passwordModal.type === 'note' ? 'LockNote password' : 'Folder password'}
        title={passwordModal.action === 'delete' && passwordModal.type === 'note'
          ? 'Delete this locked note?'
          : passwordModal.action === 'delete'
            ? 'Password required'
            : 'Locked'}
        subtitle={passwordModal.action === 'delete'
          ? passwordModal.type === 'note'
            ? 'Enter its password to confirm deletion. This note will be removed from your notes.'
            : `Enter this ${passwordModal.type}'s password before deleting it.`
          : 'Enter the password to continue'}
        verifyLabel={passwordModal.action === 'delete' && passwordModal.type === 'note'
          ? 'Delete note'
          : passwordModal.action === 'delete'
            ? 'Continue'
            : 'Unlock'}
        variant={passwordModal.action === 'delete' && passwordModal.type === 'note'
          ? 'danger'
          : 'default'}
        details={passwordModal.action === 'delete' &&
          passwordModal.type === 'note' &&
          passwordModal.item ? [
            {
              label: 'Note',
              value: passwordModal.item.title?.trim() || 'Untitled note',
              iconName: 'document-text-outline',
            },
            {
              label: 'Last updated',
              value: formatNoteUpdatedAt(passwordModal.item.updated_at).replace(/^Updated /, ''),
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
    listContent: {
      paddingBottom: 100,
    },
    homeToolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: 16,
      marginTop: 16,
    },
    searchBar: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.card,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: 10,
      ...shadow.card,
    },
    sectionViewToggle: {
      height: 48,
      flexDirection: 'row',
      alignItems: 'center',
      padding: 2,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      ...shadow.card,
    },
    sectionViewButton: {
      width: 44,
      height: 44,
      borderRadius: radius.sm,
      justifyContent: 'center',
      alignItems: 'center',
    },
    viewButtonSelected: {
      backgroundColor: colors.primarySoft,
    },
    searchInput: {
      flex: 1,
      fontSize: 16,
      color: colors.text,
      padding: 0,
    },
    section: {
      marginTop: 20,
      paddingHorizontal: 16,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    sectionHeaderActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    itemsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'stretch',
      gap: 10,
    },
    gridItem: {
      width: '48.4%',
    },
    folderStrip: {
      marginHorizontal: -16,
    },
    folderStripContent: {
      paddingHorizontal: 16,
      paddingBottom: 2,
      gap: 12,
    },
    folderStripItem: {
      width: 104,
    },
    sectionAddButton: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      backgroundColor: colors.primarySoft,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 28,
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
      backgroundColor: colors.folderSoft,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 14,
    },
    modalTitle: {
      fontSize: 19,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 18,
      textAlign: 'center',
    },
    modalFieldLabel: {
      alignSelf: 'stretch',
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 8,
    },
    input: {
      backgroundColor: colors.inputBg,
      borderRadius: radius.md,
      padding: 14,
      marginBottom: 12,
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
    button: {
      flex: 1,
      padding: 14,
      borderRadius: radius.md,
      alignItems: 'center',
    },
    cancelButton: {
      backgroundColor: colors.inputBg,
    },
    createButton: {
      backgroundColor: colors.primary,
    },
    buttonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    createButtonText: {
      color: colors.card,
    },
  });

export default HomeScreen;
