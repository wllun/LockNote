import React, { useMemo } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, shadow, useTheme } from '../theme';
import { buildNoteMoveDestinations } from '../utils/note-move.mjs';

const MoveNoteModal = ({
  visible,
  folders,
  currentFolderId,
  onClose,
  onSelect,
}) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const destinations = buildNoteMoveDestinations(folders, currentFolderId);

  const selectDestination = (destination) => {
    if (destination.isCurrent) return;
    onClose();
    onSelect(destination.id);
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
            <View>
              <Text style={styles.title}>Move note</Text>
              <Text style={styles.subtitle}>Choose a destination</Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.closeButton,
                pressed && styles.destinationPressed,
              ]}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close move note"
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.destinationList}
            contentContainerStyle={styles.destinationListContent}
            keyboardShouldPersistTaps="handled"
          >
            {destinations.map((destination) => (
              <Pressable
                key={destination.id ?? 'home'}
                style={({ pressed }) => [
                  styles.destination,
                  destination.isCurrent && styles.destinationCurrent,
                  pressed &&
                    !destination.isCurrent &&
                    styles.destinationPressed,
                ]}
                onPress={() => selectDestination(destination)}
                disabled={destination.isCurrent}
                accessibilityRole="button"
                accessibilityLabel={
                  destination.id === null
                    ? 'Move note to Home'
                    : `Move note to ${destination.name}`
                }
                accessibilityState={{
                  disabled: destination.isCurrent,
                  selected: destination.isCurrent,
                }}
              >
                <View style={styles.destinationIcon}>
                  <Ionicons
                    name={destination.id === null ? 'home-outline' : 'folder-outline'}
                    size={20}
                    color={
                      destination.isCurrent
                        ? colors.primary
                        : colors.textSecondary
                    }
                  />
                </View>
                <Text
                  style={[
                    styles.destinationName,
                    destination.isCurrent && styles.destinationNameCurrent,
                  ]}
                  numberOfLines={2}
                >
                  {destination.name}
                </Text>
                {destination.isLocked && (
                  <Ionicons
                    name="lock-closed"
                    size={15}
                    color={colors.textTertiary}
                  />
                )}
                {destination.isCurrent && (
                  <View style={styles.currentBadge}>
                    <Text style={styles.currentBadgeText}>Current</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </ScrollView>

          {folders.length === 0 && currentFolderId === null && (
            <Text style={styles.emptyHint}>
              Create a folder before moving this note.
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
};

const makeStyles = (colors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(15,23,42,0.35)',
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
      maxHeight: '76%',
      borderRadius: radius.lg,
    },
    panelWeb: {
      width: '100%',
      maxWidth: 420,
      maxHeight: '72%',
      borderRadius: radius.lg,
    },
    header: {
      minHeight: 68,
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
    subtitle: {
      marginTop: 2,
      color: colors.textSecondary,
      fontSize: 13,
    },
    closeButton: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.full,
    },
    destinationList: {
      flexGrow: 0,
    },
    destinationListContent: {
      paddingVertical: 8,
    },
    destination: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 18,
      backgroundColor: colors.card,
    },
    destinationCurrent: {
      backgroundColor: colors.primarySoft,
    },
    destinationPressed: {
      backgroundColor: colors.inputBg,
    },
    destinationIcon: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.sm,
      backgroundColor: colors.inputBg,
    },
    destinationName: {
      flex: 1,
      color: colors.text,
      fontSize: 16,
      fontWeight: '600',
    },
    destinationNameCurrent: {
      color: colors.primary,
    },
    currentBadge: {
      borderRadius: radius.full,
      backgroundColor: colors.card,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    currentBadgeText: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: '700',
    },
    emptyHint: {
      paddingHorizontal: 18,
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      color: colors.textSecondary,
      fontSize: 14,
      textAlign: 'center',
    },
  });

export default MoveNoteModal;
