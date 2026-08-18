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
} from 'react-native';
import { AppAlert as Alert } from '../utils/app-alert';
import { Ionicons } from '@expo/vector-icons';
import { folderRepo } from '../db/folderRepo';
import { noteRepo } from '../db/noteRepo';
import { hashPassword } from '../utils/crypto';
import FolderItem from '../components/FolderItem';
import NoteItem from '../components/NoteItem';
import PasswordModal from '../components/PasswordModal';
import CreateNoteTypeModal from '../components/create-note-type-modal';
import ItemActionsModal from '../components/ItemActionsModal';
import MoveNoteModal from '../components/MoveNoteModal';
import KeyboardAwareModalContent from '../components/keyboard-aware-modal-content';
import { radius, shadow, useTheme } from '../theme';
import { EXPENSE_NOTE_TYPE } from '../utils/expense-record.mjs';
import { CHECKLIST_NOTE_TYPE } from '../utils/checklist-note.mjs';
import { confirmDestructiveAction } from '../utils/confirm-action';
import { REMINDER_NOTE_TYPE } from '../utils/reminder-note.mjs';
import { softDeleteNoteWithCleanup } from '../utils/reminder-cleanup';
import { formatNoteUpdatedAt } from '../utils/note-timestamp.mjs';

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
  const [renameFolderModal, setRenameFolderModal] = useState({
    visible: false,
    folder: null,
    name: '',
  });
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
  const [folderNoteCounts, setFolderNoteCounts] = useState({});

  const loadData = useCallback(async () => {
    try {
      const [foldersData, notesData] = await Promise.all([
        folderRepo.getAll(),
        noteRepo.getRootNotes(),
      ]);
      const noteCounts = await getFolderNoteCounts(foldersData);
      setFolders(foldersData);
      setNotes(notesData);
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
      const noteCounts = await getFolderNoteCounts(f);
      setResults({ folders: f, notes: n });
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
        const noteCounts = await getFolderNoteCounts(f);
        if (!cancelled) {
          setResults({ folders: f, notes: n });
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
      navigation.navigate('Folder', { folderId: folder.id, folderName: folder.name });
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
      navigation.navigate('Folder', { folderId: item.id, folderName: item.name });
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

  const openItemActions = (item, type) => {
    setItemActions({ visible: true, item, type });
  };

  const closeItemActions = () => {
    setItemActions((current) => ({ ...current, visible: false }));
  };

  const openRenameFolder = (folder) => {
    setRenameFolderModal({ visible: true, folder, name: folder.name });
  };

  const closeRenameFolder = () => {
    setRenameFolderModal({ visible: false, folder: null, name: '' });
  };

  const handleRenameFolder = async () => {
    const nextName = renameFolderModal.name.trim();
    const folder = renameFolderModal.folder;
    if (!folder) return;
    if (!nextName) {
      Alert.alert('Error', 'Please enter a folder name');
      return;
    }
    if (nextName === folder.name) {
      closeRenameFolder();
      return;
    }

    try {
      await folderRepo.update(folder.id, { name: nextName });
      closeRenameFolder();
      refreshCurrent();
    } catch (error) {
      Alert.alert('Error', 'Failed to rename folder');
    }
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
      const folderNotes = await noteRepo.getByFolderId(folder.id);
      const noteCount = folderNotes.length;
      const detail =
        noteCount === 0
          ? 'Are you sure you want to delete this folder?'
          : `This will also delete ${noteCount} ${
              noteCount === 1 ? 'note' : 'notes'
            } inside the folder.`;

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
            await folderRepo.softDelete(folder.id);
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
      await noteRepo.update(note.id, { folder_id: folderId });
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
        <TouchableOpacity onPress={() => setQuery('')} activeOpacity={0.7}>
          <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
        </TouchableOpacity>
      )}
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
            </View>
            {results.folders.map((folder, index) => (
              <FolderItem
                key={folder.id}
                folder={folder}
                noteCount={folderNoteCounts[folder.id] ?? 0}
                index={index}
                onPress={() => handleFolderPress(folder)}
                onOpenActions={() => openItemActions(folder, 'folder')}
              />
            ))}
          </View>
        )}
        {results.notes.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Notes</Text>
            </View>
            {results.notes.map((note, index) => (
              <NoteItem
                key={note.id}
                note={note}
                index={index}
                onPress={() => handleNotePress(note)}
                onOpenActions={() => openItemActions(note, 'note')}
              />
            ))}
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
          <TouchableOpacity
            onPress={() => setShowFolderModal(true)}
            style={styles.addFolderButton}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
        {folders.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="folder-open-outline" size={32} color={colors.textTertiary} />
            <Text style={styles.emptyText}>No folders yet</Text>
          </View>
        ) : (
          folders.map((folder, index) => (
            <FolderItem
              key={folder.id}
              folder={folder}
              noteCount={folderNoteCounts[folder.id] ?? 0}
              index={index}
              onPress={() => handleFolderPress(folder)}
              onOpenActions={() => openItemActions(folder, 'folder')}
            />
          ))
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Notes</Text>
        </View>
        {notes.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={32} color={colors.textTertiary} />
            <Text style={styles.emptyText}>No notes yet</Text>
            <Text style={styles.emptyHint}>Tap + to create one</Text>
          </View>
        ) : (
          notes.map((note, index) => (
            <NoteItem
              key={note.id}
              note={note}
              index={index}
              onPress={() => handleNotePress(note)}
              onOpenActions={() => openItemActions(note, 'note')}
            />
          ))
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
        onClose={closeItemActions}
        onTogglePin={() => {
          if (itemActions.type === 'folder') {
            handleToggleFolderPin(itemActions.item);
          } else {
            handleToggleNotePin(itemActions.item);
          }
        }}
        onRename={
          itemActions.type === 'folder'
            ? () => openRenameFolder(itemActions.item)
            : undefined
        }
        onMove={
          itemActions.type === 'note'
            ? () => openMoveNote(itemActions.item)
            : undefined
        }
        onDelete={() => {
          if (itemActions.type === 'folder') {
            handleDeleteFolder(itemActions.item);
          } else {
            handleDeleteNote(itemActions.item);
          }
        }}
      />

      <MoveNoteModal
        visible={moveNoteModal.visible}
        folders={moveNoteModal.folders}
        currentFolderId={moveNoteModal.note?.folder_id ?? null}
        onClose={closeMoveNote}
        onSelect={handleMoveNote}
      />

      <Modal
        visible={renameFolderModal.visible}
        animationType="fade"
        transparent
        onRequestClose={closeRenameFolder}
      >
        <KeyboardAwareModalContent>
          <View style={styles.modalContent} accessibilityViewIsModal>
            <View style={styles.modalIconCircle}>
              <Ionicons name="create-outline" size={26} color={colors.folder} />
            </View>
            <Text style={styles.modalTitle}>Rename Folder</Text>
            <Text style={styles.modalFieldLabel}>Folder name</Text>
            <TextInput
              style={styles.input}
              placeholder="Folder name"
              placeholderTextColor={colors.textTertiary}
              value={renameFolderModal.name}
              onChangeText={(name) =>
                setRenameFolderModal((current) => ({ ...current, name }))
              }
              autoFocus
              selectTextOnFocus
              returnKeyType="done"
              accessibilityLabel="Folder name"
              onSubmitEditing={handleRenameFolder}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                activeOpacity={0.7}
                onPress={closeRenameFolder}
                accessibilityRole="button"
                accessibilityLabel="Cancel renaming folder"
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.createButton]}
                activeOpacity={0.7}
                onPress={handleRenameFolder}
                accessibilityRole="button"
                accessibilityLabel="Rename folder"
              >
                <Text style={[styles.buttonText, styles.createButtonText]}>Rename</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAwareModalContent>
      </Modal>

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
          const hash = await hashPassword(password);
          return hash === passwordModal.item.password;
        }}
        onVerified={() => handlePasswordVerified(
          passwordModal.item,
          passwordModal.type,
          passwordModal.action
        )}
        onReset={passwordModal.action === 'open' ? async () => {
          const { item, type } = passwordModal;
          if (type === 'folder') await folderRepo.update(item.id, { password: null });
          else await noteRepo.update(item.id, { password: null });
          refreshCurrent();
        } : undefined}
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
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.card,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginHorizontal: 16,
      marginTop: 16,
      ...shadow.card,
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
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    addFolderButton: {
      width: 32,
      height: 32,
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
