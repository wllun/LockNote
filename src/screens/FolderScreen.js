import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
} from 'react-native';
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

const editorRouteFor = (note) => {
  if (note.note_type === EXPENSE_NOTE_TYPE) return 'ExpenseRecordEditor';
  if (note.note_type === CHECKLIST_NOTE_TYPE) return 'ChecklistEditor';
  return 'NoteEditor';
};

const FolderScreen = ({ route, navigation }) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { folderId, folderName } = route.params;
  const [notes, setNotes] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showNoteTypeModal, setShowNoteTypeModal] = useState(false);
  const [passwordModal, setPasswordModal] = useState({ visible: false, note: null });
  const [itemActions, setItemActions] = useState({
    visible: false,
    note: null,
  });
  const [moveNoteModal, setMoveNoteModal] = useState({
    visible: false,
    note: null,
    folders: [],
  });

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
      setPasswordModal({ visible: true, note });
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
    setItemActions({ visible: false, note: null });
  };

  const handleDeleteNote = (note) => {
    confirmDestructiveAction({
      title: 'Delete Note',
      message: 'Are you sure you want to delete this note?',
      onConfirm: async () => {
        try {
          await noteRepo.softDelete(note.id);
          loadNotes();
        } catch (error) {
          Alert.alert('Error', 'Failed to delete note');
        }
      },
    });
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
      await noteRepo.update(note.id, { folder_id: targetFolderId });
      loadNotes();
    } catch (error) {
      Alert.alert('Error', 'Failed to move note');
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadNotes);
    return unsubscribe;
  }, [navigation, loadNotes]);

  return (
    <View style={styles.container}>
      <FlatList
        data={notes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => (
          <NoteItem
            note={item}
            index={index}
            onPress={() => handleNotePress(item)}
            onOpenActions={() => openItemActions(item)}
          />
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
        onClose={() => setPasswordModal({ visible: false, note: null })}
        onVerify={async (password) => {
          const hash = await hashPassword(password);
          return hash === passwordModal.note.password;
        }}
        onVerified={() => {
          setPasswordModal({ visible: false, note: null });
          navigation.navigate(editorRouteFor(passwordModal.note), {
            noteId: passwordModal.note.id,
          });
        }}
        onReset={async () => {
          await noteRepo.update(passwordModal.note.id, { password: null });
          loadNotes();
        }}
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
      padding: 16,
      paddingBottom: 100,
      flexGrow: 1,
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
