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
  Modal,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppAlert as Alert } from '../utils/app-alert';
import { Ionicons } from '@expo/vector-icons';
import { folderRepo } from '../db/folderRepo';
import { noteRepo } from '../db/noteRepo';
import NoteItem from '../components/NoteItem';
import FolderItem from '../components/FolderItem';
import PasswordModal from '../components/PasswordModal';
import CreateNoteTypeModal from '../components/create-note-type-modal';
import ItemActionsModal from '../components/ItemActionsModal';
import MoveNoteModal from '../components/MoveNoteModal';
import MoveFolderModal from '../components/MoveFolderModal';
import NoteColorModal from '../components/note-color-modal';
import NoteBackgroundModal from '../components/note-background-modal';
import ManageNoteLockModal from '../components/manage-note-lock-modal';
import { lockPasswordService } from '../services/lockPasswordService';
import { deleteFolderTree, inspectFolderTree } from '../services/folderTreeService';
import KeyboardAwareModalContent from '../components/keyboard-aware-modal-content';
import { radius, shadow, useTheme } from '../theme';
import { EXPENSE_NOTE_TYPE } from '../utils/expense-record.mjs';
import { CHECKLIST_NOTE_TYPE } from '../utils/checklist-note.mjs';
import { confirmDestructiveAction } from '../utils/confirm-action';
import { REMINDER_NOTE_TYPE } from '../utils/reminder-note.mjs';
import { softDeleteNoteWithCleanup } from '../utils/reminder-cleanup';
import { noteColorPreference } from '../utils/note-color-preference';
import { noteBackgroundPreference } from '../utils/note-background-preference';
import { createNoteDeleteDetail } from '../utils/note-type-presentation.mjs';
import { hashPassword } from '../utils/crypto';
import {
  FOLDER_VIEW_MODES,
  FOLDER_VIEW_MODE_STORAGE_KEY,
  LEGACY_HOME_VIEW_MODE_STORAGE_KEY,
  NOTE_VIEW_MODES,
  NOTE_VIEW_MODE_STORAGE_KEY,
  publishViewModePreferences,
  resolveViewModePreferences,
  subscribeToViewModePreferences,
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
  const [isSubfolder, setIsSubfolder] = useState(!!route.params?.isSubfolder);
  const [folderPath, setFolderPath] = useState([]);
  const [childFolders, setChildFolders] = useState([]);
  const [folderNoteCounts, setFolderNoteCounts] = useState({});
  const [notes, setNotes] = useState([]);
  const requestedFolderViewMode = route.params?.folderViewMode;
  const requestedNoteViewMode = route.params?.noteViewMode ?? route.params?.viewMode;
  const [folderViewMode, setFolderViewMode] = useState(() =>
    resolveViewModePreferences({ folderMode: requestedFolderViewMode }).folderViewMode
  );
  const [noteViewMode, setNoteViewMode] = useState(() =>
    resolveViewModePreferences({ noteMode: requestedNoteViewMode }).noteViewMode
  );
  const [refreshing, setRefreshing] = useState(false);
  const [showNoteTypeModal, setShowNoteTypeModal] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderNameDraft, setFolderNameDraft] = useState('');
  const [folderPassword, setFolderPassword] = useState('');
  const [passwordModal, setPasswordModal] = useState({
    visible: false,
    item: null,
    type: 'note',
    action: 'open',
  });
  const [itemActions, setItemActions] = useState({
    visible: false,
    item: null,
    type: 'note',
  });
  const [moveNoteModal, setMoveNoteModal] = useState({
    visible: false,
    note: null,
    folders: [],
  });
  const [moveFolderModal, setMoveFolderModal] = useState({ visible: false, folder: null, folders: [] });
  const [colorNote, setColorNote] = useState(null);
  const [backgroundNote, setBackgroundNote] = useState(null);
  const [lockActionNote, setLockActionNote] = useState(null);

  useEffect(() => subscribeToViewModePreferences((change) => {
    if (change.folderViewMode) setFolderViewMode(change.folderViewMode);
    if (change.noteViewMode) setNoteViewMode(change.noteViewMode);
  }), []);

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
          folderMode: requestedFolderViewMode ?? folderMode,
          noteMode: requestedNoteViewMode ?? noteMode,
          legacyMode,
        });
        setFolderViewMode(preferences.folderViewMode);
        setNoteViewMode(preferences.noteViewMode);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [requestedFolderViewMode, requestedNoteViewMode]);

  const changeFolderViewMode = (nextMode) => {
    if (!FOLDER_VIEW_MODES.includes(nextMode) || nextMode === folderViewMode) return;
    setFolderViewMode(nextMode);
    publishViewModePreferences({ folderViewMode: nextMode });
    AsyncStorage.setItem(FOLDER_VIEW_MODE_STORAGE_KEY, nextMode).catch(() => {});
  };

  const changeNoteViewMode = (nextMode) => {
    if (!NOTE_VIEW_MODES.includes(nextMode) || nextMode === noteViewMode) return;
    setNoteViewMode(nextMode);
    publishViewModePreferences({ noteViewMode: nextMode });
    AsyncStorage.setItem(NOTE_VIEW_MODE_STORAGE_KEY, nextMode).catch(() => {});
  };

  const loadNotes = useCallback(async () => {
    try {
      const [notesData, children, ancestors] = await Promise.all([
        noteRepo.getByFolderId(folderId),
        folderRepo.getChildren(folderId),
        folderRepo.getAncestors(folderId),
      ]);
      const coloredNotes = await noteColorPreference.applyToNotes(notesData);
      setNotes(await noteBackgroundPreference.applyToNotes(coloredNotes));
      setChildFolders(children);
      setFolderPath(ancestors);
      const counts = await Promise.all(children.map(async (folder) => [folder.id, await folderRepo.getNoteCount(folder.id)]));
      setFolderNoteCounts(Object.fromEntries(counts));
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
        setIsSubfolder(!!folder.parent_id);
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
      navigation.navigate(editorRouteFor(note), { noteId: note.id, isNewDraft: true });
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

  const handleCreateFolder = async () => {
    const name = folderNameDraft.trim();
    if (!name) {
      Alert.alert('Error', 'Please enter a folder name');
      return;
    }
    try {
      await folderRepo.create(name, folderPassword || null, folderId);
      setFolderNameDraft('');
      setFolderPassword('');
      setShowFolderModal(false);
      loadNotes();
    } catch (error) {
      Alert.alert('Cannot create folder', error.message || 'Failed to create folder');
    }
  };

  const navigateToFolder = (folder) => navigation.push('Folder', {
    folderId: folder.id,
    folderName: folder.name,
    isSubfolder: !!folder.parent_id,
    folderViewMode,
    noteViewMode,
  });

  const navigateHome = () => {
    const tabs = navigation.getParent?.();
    if (tabs) tabs.navigate('Home', { screen: 'HomeMain' });
    else navigation.popToTop();
  };

  const navigateToBreadcrumbFolder = (folder) => {
    const params = {
      folderId: folder.id,
      folderName: folder.name,
      isSubfolder: !!folder.parent_id,
      folderViewMode,
      noteViewMode,
    };
    const routes = navigation.getState?.()?.routes || [];
    let existingRouteIndex = -1;

    for (let index = routes.length - 2; index >= 0; index -= 1) {
      if (routes[index].name === 'Folder' && routes[index].params?.folderId === folder.id) {
        existingRouteIndex = index;
        break;
      }
    }

    if (existingRouteIndex >= 0) {
      navigation.pop(routes.length - 1 - existingRouteIndex);
      return;
    }

    navigation.replace('Folder', params);
  };

  const handleFolderPress = (folder) => {
    if (folder.password) setPasswordModal({ visible: true, item: folder, type: 'folder', action: 'open' });
    else navigateToFolder(folder);
  };

  const handleNotePress = (note) => {
    if (note.password) {
      setPasswordModal({ visible: true, item: note, type: 'note', action: 'open' });
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

  const handleToggleFolderPin = async (folder) => {
    try {
      await folderRepo.update(folder.id, { is_pinned: !folder.is_pinned });
      loadNotes();
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
      loadNotes();
    } catch (error) {
      Alert.alert('Error', 'Failed to change note color');
      loadNotes();
    }
  };

  const handleArchiveNote = async (note) => {
    try {
      const archived = await noteRepo.archive(note.id);
      if (!archived) throw new Error('Note no longer exists');
      loadNotes();
    } catch (error) {
      Alert.alert('Error', 'Failed to archive note');
    }
  };

  const handleArchiveFolder = async (folder) => {
    try {
      await folderRepo.archive(folder.id);
      loadNotes();
    } catch (error) {
      Alert.alert('Error', 'Failed to archive folder');
    }
  };

  const lockSelectedNote = async (password) => {
    if (!lockActionNote) return;
    await lockPasswordService.lockNote(lockActionNote.id, password);
    await loadNotes();
  };

  const unlockSelectedNote = async (password) => {
    if (!lockActionNote) return;
    const note = await noteRepo.getById(lockActionNote.id);
    if (!await lockPasswordService.verifyNotePassword(password, note)) {
      throw new Error('Incorrect LockNote password.');
    }
    await noteRepo.update(lockActionNote.id, { password: null });
    await loadNotes();
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
      loadNotes();
    } catch (error) {
      Alert.alert('Error', 'Failed to delete note');
    }
  };

  const confirmDeleteNote = (note) => {
    confirmDestructiveAction({
      title: 'Delete this note?',
      details: [createNoteDeleteDetail(note.note_type, note.title)],
      confirmLabel: 'Delete',
      onConfirm: () => deleteNote(note),
    });
  };

  const handleDeleteNote = (note) => {
    if (note.password) {
      setPasswordModal({ visible: true, item: note, type: 'note', action: 'delete' });
      return;
    }
    confirmDeleteNote(note);
  };

  const confirmDeleteFolder = async (folder) => {
    try {
      const contents = await inspectFolderTree(folderRepo, noteRepo, folder.id);
      const childCount = contents.folderCount - 1;
      confirmDestructiveAction({
        title: 'Delete this folder?',
        details: [
          { label: 'Folder', value: folder.name, iconName: 'folder-outline' },
          { label: 'Contains', value: `${contents.noteCount} ${contents.noteCount === 1 ? 'note' : 'notes'}${childCount ? ` and ${childCount} subfolder${childCount === 1 ? '' : 's'}` : ''}` },
        ],
        confirmLabel: 'Delete folder',
        onConfirm: async () => {
          try {
            await deleteFolderTree(folderRepo, noteRepo, folder.id);
            loadNotes();
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
    if (folder.password) setPasswordModal({ visible: true, item: folder, type: 'folder', action: 'delete' });
    else confirmDeleteFolder(folder);
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

  const openMoveFolder = async (folder) => {
    try {
      setMoveFolderModal({ visible: true, folder, folders: await folderRepo.getAll() });
    } catch (error) {
      Alert.alert('Error', 'Failed to load folders');
    }
  };

  const closeMoveFolder = () => setMoveFolderModal({ visible: false, folder: null, folders: [] });

  const handleMoveFolder = async (parentId) => {
    const folder = moveFolderModal.folder;
    if (!folder) return;
    try {
      await folderRepo.move(folder.id, parentId);
      loadNotes();
    } catch (error) {
      Alert.alert('Cannot move folder', error.message || 'Failed to move folder');
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadNotes();
      loadFolder();
    });
    return unsubscribe;
  }, [navigation, loadNotes, loadFolder]);

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
            style={styles.sectionViewButton}
            onPress={() => onChange(mode)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityLabel={`${scope} ${label.toLowerCase()} view`}
            accessibilityState={{ selected }}
          >
            <View style={[styles.viewButtonIndicator, selected && styles.viewButtonSelected]}>
              <Ionicons
                name={iconName}
                size={19}
                color={selected ? colors.primary : colors.textSecondary}
              />
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderFolderItems = () => {
    const items = childFolders.map((folder, index) => (
      <View
        key={folder.id}
        style={folderViewMode === 'strip' ? styles.folderStripItem : undefined}
      >
        <FolderItem
          folder={folder}
          noteCount={folderNoteCounts[folder.id] || 0}
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
          <View
            style={noteViewMode === 'grid' ? [
              styles.gridItem,
              notes.length % 2 === 1 && index === notes.length - 1
                ? styles.gridItemUnpaired
                : undefined,
            ] : undefined}
          >
            <NoteItem
              note={item}
              index={index}
              grid={noteViewMode === 'grid'}
              onPress={() => handleNotePress(item)}
              onOpenActions={() => openItemActions(item, 'note')}
            />
          </View>
        )}
        ListHeaderComponent={(
          <View>
            {folderPath.length > 1 && (
              <View style={styles.breadcrumbs} accessibilityLabel="Folder path">
                <TouchableOpacity onPress={navigateHome} accessibilityRole="button">
                  <Text style={styles.breadcrumbText}>Home</Text>
                </TouchableOpacity>
                {folderPath.map((folder, index) => (
                  <React.Fragment key={folder.id}>
                    <Ionicons name="chevron-forward" size={13} color={colors.textTertiary} />
                    <TouchableOpacity
                      disabled={folder.id === folderId}
                      onPress={() => navigateToBreadcrumbFolder(folder)}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.breadcrumbText, folder.id === folderId && styles.breadcrumbCurrent]} numberOfLines={1}>{folder.name}</Text>
                    </TouchableOpacity>
                  </React.Fragment>
                ))}
              </View>
            )}
            {!isSubfolder && (
              <>
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
                      style={styles.sectionAddButton}
                      onPress={() => setShowFolderModal(true)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel="Add subfolder"
                    >
                      <Ionicons name="add" size={20} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                </View>
                {renderFolderItems()}
              </>
            )}
            <View style={[styles.sectionHeader, !isSubfolder && childFolders.length > 0 && styles.notesHeader]}>
              <Text style={styles.sectionTitle}>Notes</Text>
              <View style={styles.sectionHeaderActions}>
                {renderViewControl({
                  scope: 'Notes',
                  modes: NOTE_VIEW_MODES,
                  value: noteViewMode,
                  onChange: changeNoteViewMode,
                })}
                <TouchableOpacity
                  style={styles.sectionAddButton}
                  onPress={() => setShowNoteTypeModal(true)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Add note"
                >
                  <Ionicons name="add" size={20} color={colors.primary} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={
          (isSubfolder || childFolders.length === 0) ? <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={32} color={colors.textTertiary} />
            <Text style={styles.emptyText}>This folder is empty</Text>
            <Text style={styles.emptyHint}>
              {isSubfolder ? 'Tap + to create a note' : 'Add a folder or tap + to create a note'}
            </Text>
          </View> : null
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
        itemType={itemActions.type}
        isPinned={!!itemActions.item?.is_pinned}
        isLocked={!!itemActions.item?.password}
        onClose={closeItemActions}
        onTogglePin={() => itemActions.type === 'folder' ? handleToggleFolderPin(itemActions.item) : handleToggleNotePin(itemActions.item)}
        onMove={() => itemActions.type === 'folder' ? openMoveFolder(itemActions.item) : openMoveNote(itemActions.item)}
        onColor={itemActions.type === 'note' ? () => setColorNote(itemActions.item) : undefined}
        onBackground={itemActions.type === 'note' ? () => setBackgroundNote(itemActions.item) : undefined}
        onToggleLock={itemActions.type === 'note' ? () => setLockActionNote(itemActions.item) : undefined}
        onArchive={() => itemActions.type === 'folder' ? handleArchiveFolder(itemActions.item) : handleArchiveNote(itemActions.item)}
        onDelete={() => itemActions.type === 'folder' ? handleDeleteFolder(itemActions.item) : handleDeleteNote(itemActions.item)}
      />

      <NoteColorModal
        visible={!!colorNote}
        value={colorNote?.color}
        onClose={() => setColorNote(null)}
        onSelect={handleChangeNoteColor}
      />

      <NoteBackgroundModal
        visible={!!backgroundNote}
        noteId={backgroundNote?.id}
        value={backgroundNote?.background_image_uri}
        onClose={() => setBackgroundNote(null)}
        onChanged={loadNotes}
      />

      <ManageNoteLockModal
        visible={!!lockActionNote}
        isLocked={!!lockActionNote?.password}
        itemLabel="note"
        onClose={() => setLockActionNote(null)}
        onLock={lockSelectedNote}
        onUnlock={unlockSelectedNote}
      />

      <MoveNoteModal
        visible={moveNoteModal.visible}
        folders={moveNoteModal.folders}
        currentFolderId={folderId}
        onClose={closeMoveNote}
        onSelect={handleMoveNote}
      />

      <MoveFolderModal
        visible={moveFolderModal.visible}
        folders={moveFolderModal.folders}
        folderId={moveFolderModal.folder?.id}
        onClose={closeMoveFolder}
        onSelect={handleMoveFolder}
      />

      <Modal visible={showFolderModal} animationType={showFolderModal ? 'fade' : 'none'} transparent>
        <KeyboardAwareModalContent>
          <View style={styles.modalContent}>
            <View style={styles.modalIconCircle}><Ionicons name="folder-open" size={26} color={colors.folder} /></View>
            <Text style={styles.modalTitle}>New subfolder</Text>
            <TextInput style={styles.input} placeholder="Folder name" placeholderTextColor={colors.textTertiary} value={folderNameDraft} onChangeText={setFolderNameDraft} autoFocus />
            <TextInput style={styles.input} placeholder="Password (optional)" placeholderTextColor={colors.textTertiary} value={folderPassword} onChangeText={setFolderPassword} secureTextEntry />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => setShowFolderModal(false)}><Text style={styles.buttonText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.createButton]} onPress={handleCreateFolder}><Text style={[styles.buttonText, styles.createButtonText]}>Create</Text></TouchableOpacity>
            </View>
          </View>
        </KeyboardAwareModalContent>
      </Modal>

      <PasswordModal
        visible={passwordModal.visible}
        onClose={() => setPasswordModal({
          visible: false,
          item: null,
          type: 'note',
          action: 'open',
        })}
        onVerify={async (password) => {
          if (!passwordModal.item) return false;
          return passwordModal.type === 'folder'
            ? await hashPassword(password) === passwordModal.item.password
            : lockPasswordService.verifyNotePassword(password, passwordModal.item);
        }}
        onVerified={async () => {
          const { item, type, action } = passwordModal;
          setPasswordModal({ visible: false, item: null, type: 'note', action: 'open' });
          if (action === 'delete') {
            if (type === 'folder') await confirmDeleteFolder(item);
            else await deleteNote(item);
          } else if (type === 'folder') {
            navigateToFolder(item);
          } else {
            navigation.navigate(editorRouteFor(item), { noteId: item.id });
          }
        }}
        allowLockPasswordRecovery={passwordModal.type === 'note' && passwordModal.action === 'open'}
        passwordLabel={passwordModal.type === 'folder' ? 'Folder password' : 'LockNote password'}
        title={passwordModal.action === 'delete' ? `Delete this ${passwordModal.type}?` : 'Locked'}
        subtitle={passwordModal.action === 'delete'
          ? `Enter its password to confirm deletion. This ${passwordModal.type} will be removed.`
          : 'Enter the password to continue'}
        verifyLabel={passwordModal.action === 'delete' ? 'Delete' : 'Unlock'}
        variant={passwordModal.action === 'delete' ? 'danger' : 'default'}
        details={passwordModal.action === 'delete' && passwordModal.item ? [
          passwordModal.type === 'folder'
            ? { label: 'Folder', value: passwordModal.item.name, iconName: 'folder-outline' }
            : createNoteDeleteDetail(passwordModal.item.note_type, passwordModal.item.title),
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
    breadcrumbs: {
      minHeight: 36,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 5,
      marginBottom: 10,
    },
    breadcrumbText: { color: colors.primary, fontSize: 13, fontWeight: '600', maxWidth: 140 },
    breadcrumbCurrent: { color: colors.textSecondary },
    sectionHeader: {
      minHeight: 46,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    sectionHeaderActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sectionViewToggle: {
      height: 48,
      flexDirection: 'row',
      alignItems: 'center',
      padding: 2,
      borderRadius: 8,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      ...shadow.card,
    },
    sectionViewButton: {
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
    viewButtonIndicator: {
      width: 36,
      height: 36,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    viewButtonSelected: {
      borderRadius: 8,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    notesHeader: { marginTop: 8 },
    sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
    sectionAddButton: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      backgroundColor: colors.primarySoft,
      justifyContent: 'center',
      alignItems: 'center',
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
    gridRow: {
      gap: 10,
      marginBottom: 10,
      alignItems: 'stretch',
    },
    gridItem: {
      flex: 1,
      minWidth: 0,
    },
    gridItemUnpaired: {
      maxWidth: '50%',
      paddingRight: 5,
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
    modalContent: {
      width: '100%', maxWidth: 400, padding: 24, borderRadius: radius.lg,
      backgroundColor: colors.card, alignItems: 'center', ...shadow.card,
    },
    modalIconCircle: {
      width: 54, height: 54, borderRadius: radius.full, backgroundColor: colors.folderSoft,
      justifyContent: 'center', alignItems: 'center', marginBottom: 14,
    },
    modalTitle: { color: colors.text, fontSize: 19, fontWeight: '700', marginBottom: 18 },
    input: {
      alignSelf: 'stretch', backgroundColor: colors.inputBg, borderRadius: radius.md,
      padding: 14, marginBottom: 12, color: colors.text, fontSize: 16,
    },
    modalButtons: { alignSelf: 'stretch', flexDirection: 'row', gap: 12, marginTop: 8 },
    button: { flex: 1, padding: 14, borderRadius: radius.md, alignItems: 'center' },
    cancelButton: { backgroundColor: colors.inputBg },
    createButton: { backgroundColor: colors.primary },
    buttonText: { color: colors.text, fontSize: 16, fontWeight: '600' },
    createButtonText: { color: colors.card },
  });

export default FolderScreen;
