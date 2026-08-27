import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppAlert as Alert } from '../utils/app-alert';
import { confirmDestructiveAction } from '../utils/confirm-action';
import { hashPassword } from '../utils/crypto';
import { formatNoteUpdatedAt } from '../utils/note-timestamp.mjs';
import { softDeleteNoteWithCleanup } from '../utils/reminder-cleanup';
import { EXPENSE_NOTE_TYPE } from '../utils/expense-record.mjs';
import { CHECKLIST_NOTE_TYPE } from '../utils/checklist-note.mjs';
import { REMINDER_NOTE_TYPE } from '../utils/reminder-note.mjs';
import { folderRepo } from '../db/folderRepo';
import { noteRepo } from '../db/noteRepo';
import FolderItem from '../components/FolderItem';
import ItemActionsModal from '../components/ItemActionsModal';
import NoteItem from '../components/NoteItem';
import PasswordModal from '../components/PasswordModal';
import { radius, useTheme } from '../theme';

const editorRouteFor = (note) => {
  if (note.note_type === EXPENSE_NOTE_TYPE) return 'ExpenseRecordEditor';
  if (note.note_type === CHECKLIST_NOTE_TYPE) return 'ChecklistEditor';
  if (note.note_type === REMINDER_NOTE_TYPE) return 'ReminderEditor';
  return 'NoteEditor';
};

const itemTitle = (item, type) =>
  type === 'folder' ? item?.name || 'Untitled folder' : item?.title?.trim() || 'Untitled note';

const ArchiveScreen = ({ navigation }) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [folders, setFolders] = useState([]);
  const [notes, setNotes] = useState([]);
  const [folderNoteCounts, setFolderNoteCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionItem, setActionItem] = useState(null);
  const [passwordState, setPasswordState] = useState({
    item: null,
    type: 'note',
    action: 'open',
  });

  const loadArchive = useCallback(async () => {
    try {
      const [archivedFolders, archivedNotes] = await Promise.all([
        folderRepo.getArchived(),
        noteRepo.getArchived(),
      ]);
      const counts = await Promise.all(
        archivedFolders.map(async (folder) => [folder.id, await folderRepo.getNoteCount(folder.id)])
      );
      setFolders(archivedFolders);
      setNotes(archivedNotes);
      setFolderNoteCounts(Object.fromEntries(counts));
    } catch (error) {
      Alert.alert('Archive unavailable', 'LockNote could not load the Archive.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadArchive();
    const unsubscribe = navigation.addListener('focus', loadArchive);
    return unsubscribe;
  }, [loadArchive, navigation]);

  const navigateToItem = (item, type) => {
    if (type === 'folder') {
      navigation.navigate('Folder', { folderId: item.id, folderName: item.name });
    } else {
      navigation.navigate(editorRouteFor(item), { noteId: item.id });
    }
  };

  const openItem = (item, type) => {
    if (item.password) {
      setPasswordState({ item, type, action: 'open' });
      return;
    }
    navigateToItem(item, type);
  };

  const restoreItem = async (item, type) => {
    try {
      const restored = type === 'folder'
        ? await folderRepo.unarchive(item.id)
        : await noteRepo.unarchive(item.id);
      if (!restored) throw new Error(`${type} no longer exists`);
      await loadArchive();
      Alert.alert(
        `${type === 'folder' ? 'Folder' : 'Note'} restored`,
        type === 'folder'
          ? 'The folder and its visible notes returned to Home.'
          : 'The note returned to its previous location.',
        [{ text: 'OK' }],
        { variant: 'success', iconName: 'arrow-undo-outline' }
      );
    } catch (error) {
      Alert.alert('Restore failed', `LockNote could not restore this ${type}.`);
    }
  };

  const moveNoteToTrash = async (note) => {
    try {
      await softDeleteNoteWithCleanup(noteRepo, note);
      await loadArchive();
    } catch (error) {
      Alert.alert('Move failed', 'LockNote could not move this note to Trash.');
    }
  };

  const moveFolderToTrash = async (folder) => {
    try {
      const folderNotes = await noteRepo.getActiveByFolderId(folder.id);
      for (const note of folderNotes) {
        await softDeleteNoteWithCleanup(noteRepo, note);
      }
      await noteRepo.detachFromFolder(folder.id);
      await folderRepo.hardDelete(folder.id);
      await loadArchive();
    } catch (error) {
      Alert.alert('Move failed', 'LockNote could not remove this folder or move its notes to Trash.');
    }
  };

  const confirmMoveNoteToTrash = (note) => {
    confirmDestructiveAction({
      title: 'Move this note to Trash?',
      message: 'You can restore it from Trash for 30 days.',
      confirmLabel: 'Move to Trash',
      details: [
        { label: 'Note', value: itemTitle(note, 'note'), iconName: 'document-text-outline' },
        {
          label: 'Last updated',
          value: formatNoteUpdatedAt(note.updated_at).replace(/^Updated /, ''),
        },
      ],
      onConfirm: () => moveNoteToTrash(note),
    });
  };

  const confirmMoveFolderToTrash = async (folder) => {
    try {
      const folderNotes = await noteRepo.getActiveByFolderId(folder.id);
      const noteCount = folderNotes.length;
      confirmDestructiveAction({
        title: 'Move this folder to Trash?',
        message: noteCount
          ? `The folder itself will be permanently removed. Its ${noteCount} ${noteCount === 1 ? 'note' : 'notes'} will stay in Trash for 30 days.`
          : 'The empty folder will be permanently removed.',
        confirmLabel: 'Move to Trash',
        details: [
          { label: 'Folder', value: itemTitle(folder, 'folder'), iconName: 'folder-outline' },
          { label: 'Contains', value: `${noteCount} ${noteCount === 1 ? 'note' : 'notes'}` },
        ],
        onConfirm: () => moveFolderToTrash(folder),
      });
    } catch (error) {
      Alert.alert('Move failed', 'LockNote could not inspect this folder.');
    }
  };

  const requestMoveToTrash = (item, type) => {
    if (item.password) {
      setPasswordState({ item, type, action: 'delete' });
      return;
    }
    if (type === 'folder') confirmMoveFolderToTrash(item);
    else confirmMoveNoteToTrash(item);
  };

  const totalItems = folders.length + notes.length;
  const sections = useMemo(() => [
    {
      key: 'folders',
      title: 'Folders',
      data: folders.map((item) => ({ type: 'folder', item })),
    },
    {
      key: 'notes',
      title: 'Notes',
      data: notes.map((item) => ({ type: 'note', item })),
    },
  ], [folders, notes]);
  const passwordItem = passwordState.item;

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <SectionList
          sections={totalItems ? sections : []}
          keyExtractor={(entry) => `${entry.type}-${entry.item.id}`}
          contentInsetAdjustmentBehavior="automatic"
          stickySectionHeadersEnabled={false}
          contentContainerStyle={[styles.content, totalItems === 0 && styles.emptyContent]}
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadArchive();
              }}
              tintColor={colors.primary}
            />
          )}
          ListHeaderComponent={totalItems ? (
            <View style={styles.notice}>
              <View style={styles.noticeIcon}>
                <Ionicons name="archive-outline" size={21} color={colors.primary} />
              </View>
              <Text style={styles.noticeText}>
                Archived items stay hidden until restored.
              </Text>
            </View>
          ) : null}
          renderSectionHeader={({ section }) => totalItems ? (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle} accessibilityRole="header">{section.title}</Text>
              <Text style={styles.sectionCount}>{section.data.length}</Text>
            </View>
          ) : null}
          renderItem={({ item: entry, index }) => entry.type === 'folder' ? (
            <FolderItem
              folder={entry.item}
              noteCount={folderNoteCounts[entry.item.id] || 0}
              index={index}
              onPress={() => openItem(entry.item, 'folder')}
              onOpenActions={() => setActionItem(entry)}
            />
          ) : (
            <NoteItem
              note={entry.item}
              index={index}
              onPress={() => openItem(entry.item, 'note')}
              onOpenActions={() => setActionItem(entry)}
            />
          )}
          ListEmptyComponent={(
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="archive-outline" size={36} color={colors.textTertiary} />
              </View>
              <Text style={styles.emptyTitle}>Archive is empty</Text>
              <Text style={styles.emptyDescription}>
                Archive a folder or note from its actions menu to keep it without showing it on Home.
              </Text>
            </View>
          )}
        />
      )}

      <ItemActionsModal
        visible={!!actionItem}
        itemType={actionItem?.type || 'note'}
        archiveMode
        onClose={() => setActionItem(null)}
        onRestore={() => actionItem && restoreItem(actionItem.item, actionItem.type)}
        onDelete={() => actionItem && requestMoveToTrash(actionItem.item, actionItem.type)}
      />

      <PasswordModal
        visible={!!passwordItem}
        onClose={() => setPasswordState({ item: null, type: 'note', action: 'open' })}
        onVerify={async (password) => {
          if (!passwordItem) return false;
          return await hashPassword(password) === passwordItem.password;
        }}
        onVerified={async () => {
          const pending = passwordState;
          setPasswordState({ item: null, type: 'note', action: 'open' });
          if (!pending.item) return;
          if (pending.action === 'delete') {
            if (pending.type === 'folder') await moveFolderToTrash(pending.item);
            else await moveNoteToTrash(pending.item);
          } else {
            navigateToItem(pending.item, pending.type);
          }
        }}
        onReset={passwordState.action === 'open' && passwordItem ? async () => {
          if (passwordState.type === 'folder') {
            await folderRepo.update(passwordItem.id, { password: null });
          } else {
            await noteRepo.update(passwordItem.id, { password: null });
          }
          await loadArchive();
        } : undefined}
        title={passwordState.action === 'delete'
          ? `Move this locked ${passwordState.type} to Trash?`
          : 'Locked'}
        subtitle={passwordState.action === 'delete'
          ? passwordState.type === 'folder'
            ? 'Enter its password to confirm. The folder will be removed and its notes will move to Trash.'
            : 'Enter its password to confirm. You can restore the note from Trash for 30 days.'
          : 'Enter the password to continue'}
        verifyLabel={passwordState.action === 'delete' ? 'Move to Trash' : 'Unlock'}
        variant={passwordState.action === 'delete' ? 'danger' : 'default'}
        details={passwordState.action === 'delete' && passwordItem ? [{
          label: passwordState.type === 'folder' ? 'Folder' : 'Note',
          value: itemTitle(passwordItem, passwordState.type),
          iconName: passwordState.type === 'folder' ? 'folder-outline' : 'document-text-outline',
        }] : []}
      />
    </View>
  );
};

const makeStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 36 },
  emptyContent: { flexGrow: 1, justifyContent: 'center' },
  notice: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
    borderRadius: radius.md, backgroundColor: colors.primarySoft, marginBottom: 18,
  },
  noticeIcon: {
    width: 38, height: 38, borderRadius: radius.full,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card,
  },
  noticeText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  sectionHeader: {
    minHeight: 36, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 2, paddingBottom: 8,
  },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  sectionCount: {
    minWidth: 24, paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.full,
    backgroundColor: colors.inputBg, color: colors.textSecondary, fontSize: 12,
    fontWeight: '700', textAlign: 'center', fontVariant: ['tabular-nums'],
  },
  emptyState: { alignItems: 'center', paddingHorizontal: 32 },
  emptyIcon: {
    width: 76, height: 76, borderRadius: radius.full, alignItems: 'center',
    justifyContent: 'center', backgroundColor: colors.inputBg, marginBottom: 16,
  },
  emptyTitle: { color: colors.text, fontSize: 19, fontWeight: '800' },
  emptyDescription: {
    color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 6, textAlign: 'center',
  },
});

export default ArchiveScreen;
