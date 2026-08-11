import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { radius, shadow, useTheme } from '../theme';
import {
  calculateExpenseNoteGrandTotal,
  EXPENSE_NOTE_TYPE,
  formatExpenseAmount,
} from '../utils/expense-record.mjs';
import {
  CHECKLIST_NOTE_TYPE,
  getChecklistPreview,
  parseChecklistNote,
} from '../utils/checklist-note.mjs';

// ponytail: entering animations are native-only — reanimated web leaves items visibility:hidden
const entering = (index) =>
  Platform.OS === 'web' ? undefined : FadeInDown.duration(220).delay(Math.min(index * 40, 240));

const NoteItem = ({ note, onPress, onOpenActions, index = 0 }) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const locked = !!note.password;
  const isExpense = note.note_type === EXPENSE_NOTE_TYPE;
  const isChecklist = note.note_type === CHECKLIST_NOTE_TYPE;
  const checklistItems = isChecklist ? parseChecklistNote(note.content).items : [];
  const displayTitle = isExpense
    ? note.title.trim() || 'Expense Record'
    : isChecklist
      ? note.title.trim() || 'Checklist'
      : note.title || 'Untitled';
  const preview = isExpense
    ? `RM ${formatExpenseAmount(calculateExpenseNoteGrandTotal(note.content))}`
    : isChecklist
      ? getChecklistPreview(checklistItems)
      : note.content || 'No content';

  const handleActionsPress = (e) => {
    e.stopPropagation?.();
    onOpenActions?.();
  };

  return (
    <Animated.View entering={entering(index)}>
      <TouchableOpacity
        style={styles.container}
        onPress={onPress}
        onLongPress={Platform.OS === 'web' ? undefined : onOpenActions}
        delayLongPress={450}
        activeOpacity={0.7}
        accessibilityHint={
          Platform.OS === 'web'
            ? 'Opens this note'
            : 'Opens this note. Long press for more actions'
        }
        accessibilityActions={
          Platform.OS === 'web'
            ? undefined
            : [{ name: 'longpress', label: 'Show note actions' }]
        }
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === 'longpress') onOpenActions?.();
        }}
      >
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {displayTitle}
          </Text>
          {isExpense && (
            <View style={styles.typeBadge}>
              <Ionicons name="receipt-outline" size={12} color={colors.primary} />
              <Text style={styles.typeBadgeText}>Expense</Text>
            </View>
          )}
          {isChecklist && (
            <View style={styles.typeBadge}>
              <Ionicons name="checkbox-outline" size={12} color={colors.primary} />
              <Text style={styles.typeBadgeText}>Checklist</Text>
            </View>
          )}
          {locked && (
            <View style={styles.lockBadge}>
              <Ionicons name="lock-closed" size={12} color={colors.folder} />
            </View>
          )}
          {!!note.is_pinned && (
            <View style={styles.pinBadge}>
              <Ionicons name="pin" size={13} color={colors.primary} />
            </View>
          )}
          {Platform.OS === 'web' && (
            <Pressable
              style={({ pressed }) => [
                styles.webMenuButton,
                pressed && styles.webMenuButtonPressed,
              ]}
              onPress={handleActionsPress}
              accessibilityRole="button"
              accessibilityLabel={`More actions for ${displayTitle}`}
            >
              <Ionicons
                name="ellipsis-vertical"
                size={20}
                color={colors.textSecondary}
              />
            </Pressable>
          )}
        </View>
        <Text style={styles.preview} numberOfLines={2}>
          {locked
            ? isExpense
              ? 'Locked expense record'
              : isChecklist
                ? 'Locked checklist'
                : 'Locked note'
            : preview}
        </Text>
        <Text style={styles.date}>{formatDate(note.updated_at)}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const makeStyles = (colors) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.card,
      padding: 16,
      marginBottom: 10,
      borderRadius: radius.md,
      ...shadow.card,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
    title: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      flex: 1,
    },
    lockBadge: {
      width: 24,
      height: 24,
      borderRadius: radius.full,
      backgroundColor: colors.folderSoft,
      justifyContent: 'center',
      alignItems: 'center',
    },
    typeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.primarySoft,
      borderRadius: radius.full,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    typeBadgeText: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: '700',
    },
    pinBadge: {
      width: 24,
      height: 24,
      borderRadius: radius.full,
      backgroundColor: colors.primarySoft,
      justifyContent: 'center',
      alignItems: 'center',
    },
    webMenuButton: {
      width: 44,
      height: 44,
      marginVertical: -10,
      marginRight: -10,
      borderRadius: radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    webMenuButtonPressed: {
      backgroundColor: colors.inputBg,
    },
    preview: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 8,
      lineHeight: 20,
    },
    date: {
      fontSize: 12,
      color: colors.textTertiary,
    },
  });

export default NoteItem;
