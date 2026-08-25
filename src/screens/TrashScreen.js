import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppAlert as Alert } from '../utils/app-alert';
import { confirmDestructiveAction } from '../utils/confirm-action';
import { verifyPassword } from '../utils/crypto';
import { formatTrashRemaining, TRASH_RETENTION_DAYS } from '../utils/trash.mjs';
import { trashService } from '../services/trashService';
import { noteRepo } from '../db/noteRepo';
import PasswordModal from '../components/PasswordModal';
import ItemActionsModal from '../components/ItemActionsModal';
import { radius, shadow, useTheme } from '../theme';

const NOTE_TYPES = {
  note: { label: 'Note', icon: 'document-text-outline' },
  checklist: { label: 'Checklist', icon: 'checkbox-outline' },
  expense: { label: 'Expense', icon: 'receipt-outline' },
  reminder: { label: 'Reminder', icon: 'notifications-outline' },
};

const itemTitle = (item) => item.title?.trim() || 'Untitled note';

const TrashScreen = ({ navigation }) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [trash, setTrash] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [passwordItem, setPasswordItem] = useState(null);
  const [actionNote, setActionNote] = useState(null);

  const loadTrash = useCallback(async () => {
    try {
      await trashService.purgeExpired();
      setTrash(await trashService.list());
    } catch (error) {
      Alert.alert('Trash unavailable', 'LockNote could not load the Trash.', [{ text: 'OK' }], {
        variant: 'error',
        iconName: 'alert-circle-outline',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTrash();
    const unsubscribe = navigation.addListener('focus', loadTrash);
    return unsubscribe;
  }, [loadTrash, navigation]);

  const restoreItem = async (item) => {
    const key = `restore-${item.id}`;
    setBusyKey(key);
    try {
      await trashService.restoreNote(item);
      Alert.alert('Note restored', 'The note was returned to your notes.', [{ text: 'OK' }], {
        variant: 'success',
        iconName: 'arrow-undo-outline',
      });
      await loadTrash();
    } catch (error) {
      Alert.alert('Restore failed', 'LockNote could not restore this note.', [{ text: 'OK' }], {
        variant: 'error',
        iconName: 'alert-circle-outline',
      });
    } finally {
      setBusyKey('');
    }
  };

  const permanentlyDelete = async (item) => {
    const key = `delete-${item.id}`;
    setBusyKey(key);
    try {
      await trashService.permanentlyDeleteNote(item);
      await loadTrash();
    } catch (error) {
      Alert.alert('Delete failed', 'LockNote could not permanently delete this note.', [{ text: 'OK' }], {
        variant: 'error',
        iconName: 'alert-circle-outline',
      });
    } finally {
      setBusyKey('');
    }
  };

  const confirmPermanentDelete = (item) => {
    confirmDestructiveAction({
      title: 'Permanently delete this note?',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete forever',
      details: [{
        label: 'Note',
        value: itemTitle(item),
        iconName: 'document-text-outline',
      }],
      onConfirm: () => permanentlyDelete(item),
    });
  };

  const requestPermanentDelete = (item) => {
    if (item.password) {
      setPasswordItem(item);
      return;
    }
    confirmPermanentDelete(item);
  };

  const emptyTrash = () => {
    const total = trash.length;
    confirmDestructiveAction({
      title: 'Empty Trash?',
      message: 'Unlocked items will be permanently deleted. Locked items must be deleted individually.',
      confirmLabel: 'Empty Trash',
      details: [{ label: 'Items in Trash', value: String(total), iconName: 'trash-outline' }],
      onConfirm: async () => {
        setBusyKey('empty');
        try {
          const result = await trashService.empty();
          await loadTrash();
          if (result.remainingCount) {
            Alert.alert(
              'Some items remain',
              `${result.remainingCount} locked item${result.remainingCount === 1 ? '' : 's'} must be deleted individually.`,
              [{ text: 'OK' }],
              { variant: 'warning', iconName: 'lock-closed-outline' }
            );
          }
        } catch (error) {
          Alert.alert('Delete failed', 'LockNote could not empty the Trash.', [{ text: 'OK' }], {
            variant: 'error',
            iconName: 'alert-circle-outline',
          });
        } finally {
          setBusyKey('');
        }
      },
    });
  };

  const total = trash.length;

  const renderItem = ({ item }) => {
    const noteType = NOTE_TYPES[item.note_type] || NOTE_TYPES.note;
    const restoreKey = `restore-${item.id}`;
    const deleteKey = `delete-${item.id}`;
    const itemBusy = busyKey === restoreKey || busyKey === deleteKey;

    return (
      <View style={styles.itemCard}>
        <View style={styles.itemTop}>
          <View style={styles.itemIcon}>
            <Ionicons name={noteType.icon} size={22} color={colors.primary} />
          </View>
          <View style={styles.itemContent}>
            <View style={styles.titleRow}>
              <Text style={styles.itemTitle} numberOfLines={1}>{itemTitle(item)}</Text>
              {item.password ? <Ionicons name="lock-closed" size={14} color={colors.textTertiary} /> : null}
            </View>
            <Text style={styles.itemMeta}>
              {noteType.label} · {formatTrashRemaining(item.updated_at)}
            </Text>
          </View>
          {itemBusy ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <TouchableOpacity
            style={styles.moreButton}
            activeOpacity={0.7}
            onPress={() => setActionNote(item)}
            disabled={!!busyKey}
            accessibilityRole="button"
            accessibilityLabel={`Actions for ${itemTitle(item)}`}
          >
            <Ionicons name="ellipsis-vertical" size={21} color={colors.textSecondary} />
          </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={trash}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          renderItem={renderItem}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[styles.content, total === 0 && styles.emptyContent]}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={total ? (
            <>
              <View style={styles.notice}>
                <View style={styles.noticeIcon}>
                  <Ionicons name="time-outline" size={21} color={colors.primary} />
                </View>
                <Text style={styles.noticeText}>
                  Items are permanently deleted {TRASH_RETENTION_DAYS} days after they enter Trash.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.emptyButton}
                activeOpacity={0.7}
                onPress={emptyTrash}
                disabled={!!busyKey}
                accessibilityRole="button"
                accessibilityLabel="Empty Trash"
              >
                {busyKey === 'empty' ? (
                  <ActivityIndicator size="small" color={colors.danger} />
                ) : (
                  <Ionicons name="trash-bin-outline" size={18} color={colors.danger} />
                )}
                <Text style={styles.emptyButtonText}>Empty Trash</Text>
              </TouchableOpacity>
            </>
          ) : null}
          ListEmptyComponent={(
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="trash-outline" size={36} color={colors.textTertiary} />
              </View>
              <Text style={styles.emptyTitle}>Trash is empty</Text>
              <Text style={styles.emptyDescription}>Deleted notes will appear here.</Text>
            </View>
          )}
        />
      )}

      <ItemActionsModal
        visible={!!actionNote}
        itemType="note"
        trashMode
        onClose={() => setActionNote(null)}
        onRestore={() => actionNote && restoreItem(actionNote)}
        onDelete={() => actionNote && requestPermanentDelete(actionNote)}
      />

      <PasswordModal
        visible={!!passwordItem}
        onClose={() => setPasswordItem(null)}
        onVerify={(password) => verifyPassword(password, passwordItem?.item?.password)}
        onVerified={async () => {
          const pending = passwordItem;
          setPasswordItem(null);
          if (pending) await permanentlyDelete(pending);
        }}
        onReset={passwordItem ? async () => {
          await noteRepo.update(passwordItem.id, { password: null });
        } : undefined}
        title="Permanently delete this locked note?"
        subtitle="Enter its password to delete it forever. This cannot be undone."
        verifyLabel="Delete forever"
        variant="danger"
        details={passwordItem ? [{
          label: 'Note',
          value: itemTitle(passwordItem),
          iconName: 'document-text-outline',
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
    borderRadius: radius.md, backgroundColor: colors.primarySoft, marginBottom: 12,
  },
  noticeIcon: {
    width: 38, height: 38, borderRadius: radius.full,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card,
  },
  noticeText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  emptyButton: {
    minHeight: 44, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, marginBottom: 20,
  },
  emptyButtonText: { color: colors.danger, fontSize: 14, fontWeight: '700' },
  itemCard: {
    backgroundColor: colors.card, borderRadius: radius.lg, marginBottom: 12,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.card,
  },
  itemTop: { minHeight: 72, flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  itemIcon: {
    width: 42, height: 42, borderRadius: radius.md, alignItems: 'center',
    justifyContent: 'center', backgroundColor: colors.primarySoft,
  },
  itemContent: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemTitle: { flexShrink: 1, color: colors.text, fontSize: 16, fontWeight: '700' },
  itemMeta: { color: colors.textTertiary, fontSize: 13, marginTop: 3 },
  moreButton: {
    width: 44, height: 44, borderRadius: radius.full,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyState: { alignItems: 'center', paddingHorizontal: 32 },
  emptyIcon: {
    width: 76, height: 76, borderRadius: radius.full, alignItems: 'center',
    justifyContent: 'center', backgroundColor: colors.inputBg, marginBottom: 16,
  },
  emptyTitle: { color: colors.text, fontSize: 19, fontWeight: '800' },
  emptyDescription: { color: colors.textSecondary, fontSize: 14, marginTop: 6, textAlign: 'center' },
});

export default TrashScreen;
