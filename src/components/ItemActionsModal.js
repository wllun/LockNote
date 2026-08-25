import React, { useMemo } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, shadow, useTheme } from '../theme';

const ItemActionsModal = ({
  visible,
  itemType,
  isPinned,
  onClose,
  onTogglePin,
  onColor,
  onMove,
  onArchive,
  trashMode = false,
  archiveMode = false,
  onRestore,
  onDelete,
}) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const isNote = itemType === 'note';
  const title = trashMode
    ? 'Trash actions'
    : archiveMode
      ? `Archived ${itemType} actions`
      : isNote
        ? 'Note actions'
        : 'Folder actions';

  const runAction = (action) => {
    onClose();
    action?.();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.overlay,
          Platform.OS === 'web' ? styles.overlayWeb : styles.overlayPhone,
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessible={false}
        />
        <View
          style={[
            styles.panel,
            Platform.OS === 'web' ? styles.panelWeb : styles.panelPhone,
            Platform.OS !== 'web' && {
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
          accessibilityViewIsModal
        >
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable
              style={({ pressed }) => [
                styles.closeButton,
                pressed && styles.pressed,
              ]}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={`Close ${title.toLowerCase()}`}
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          {(trashMode || archiveMode) && (
            <Pressable
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
              onPress={() => runAction(onRestore)}
              accessibilityRole="button"
              accessibilityLabel={`Restore ${itemType}`}
            >
              <View style={styles.actionIcon}>
                <Ionicons name="arrow-undo-outline" size={20} color={colors.primary} />
              </View>
              <Text style={styles.actionText}>Restore</Text>
            </Pressable>
          )}

          {!trashMode && !archiveMode && (
            <Pressable
              style={({ pressed }) => [
                styles.action,
                pressed && styles.pressed,
              ]}
              onPress={() => runAction(onTogglePin)}
              accessibilityRole="button"
              accessibilityLabel={isPinned ? `Unpin ${itemType}` : `Pin ${itemType}`}
            >
              <View style={styles.actionIcon}>
                <Ionicons
                  name={isPinned ? 'pin' : 'pin-outline'}
                  size={20}
                  color={isPinned ? colors.primary : colors.textSecondary}
                />
              </View>
              <Text style={styles.actionText}>
                {isPinned ? 'Unpin' : 'Pin'}
              </Text>
            </Pressable>
          )}

          {!trashMode && !archiveMode && isNote && !!onColor && (
            <Pressable
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
              onPress={() => runAction(onColor)}
              accessibilityRole="button"
              accessibilityLabel="Change note color"
            >
              <View style={styles.actionIcon}>
                <Ionicons name="color-palette-outline" size={20} color={colors.textSecondary} />
              </View>
              <Text style={styles.actionText}>Color</Text>
            </Pressable>
          )}

          {!trashMode && !archiveMode && isNote && !!onMove && (
            <Pressable
              style={({ pressed }) => [
                styles.action,
                pressed && styles.pressed,
              ]}
              onPress={() => runAction(onMove)}
              accessibilityRole="button"
              accessibilityLabel="Move note"
            >
              <View style={styles.actionIcon}>
                <Ionicons
                  name="folder-open-outline"
                  size={20}
                  color={colors.textSecondary}
                />
              </View>
              <Text style={styles.actionText}>Move</Text>
            </Pressable>
          )}

          {!trashMode && !archiveMode && !!onArchive && (
            <Pressable
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
              onPress={() => runAction(onArchive)}
              accessibilityRole="button"
              accessibilityLabel={`Archive ${itemType}`}
            >
              <View style={styles.actionIcon}>
                <Ionicons name="archive-outline" size={20} color={colors.textSecondary} />
              </View>
              <Text style={styles.actionText}>Archive</Text>
            </Pressable>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.action,
              styles.deleteAction,
              pressed && styles.pressed,
            ]}
            onPress={() => runAction(onDelete)}
            accessibilityRole="button"
            accessibilityLabel={
              trashMode
                ? `Permanently delete ${itemType}`
                : archiveMode
                  ? `Move ${itemType} to Trash`
                  : `Delete ${itemType}`
            }
          >
            <View style={[styles.actionIcon, styles.deleteIcon]}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </View>
            <Text style={[styles.actionText, styles.deleteText]}>
              {trashMode ? 'Delete forever' : archiveMode ? 'Move to Trash' : 'Delete'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const makeStyles = (colors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.backdrop,
      padding: 16,
    },
    overlayPhone: {
      justifyContent: 'flex-end',
    },
    overlayWeb: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    panel: {
      overflow: 'hidden',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadow.card,
    },
    panelPhone: {
      width: '100%',
      borderRadius: radius.lg,
    },
    panelWeb: {
      width: '100%',
      maxWidth: 360,
      borderRadius: radius.lg,
    },
    header: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingLeft: 18,
      paddingRight: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '700',
    },
    closeButton: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.full,
    },
    action: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 18,
      backgroundColor: colors.card,
    },
    pressed: {
      backgroundColor: colors.inputBg,
    },
    actionIcon: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.sm,
      backgroundColor: colors.inputBg,
    },
    actionText: {
      flex: 1,
      color: colors.text,
      fontSize: 16,
      fontWeight: '600',
    },
    deleteAction: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    deleteIcon: {
      backgroundColor: colors.dangerSoft,
    },
    deleteText: {
      color: colors.danger,
    },
  });

export default ItemActionsModal;
