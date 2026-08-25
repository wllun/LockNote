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
  calculateExpenseGrandTotal,
  EXPENSE_NOTE_TYPE,
  formatExpenseMoney,
  parseExpenseNote,
} from '../utils/expense-record.mjs';
import {
  CHECKLIST_NOTE_TYPE,
  getChecklistProgressPreview,
  getChecklistPreview,
  parseChecklistNote,
} from '../utils/checklist-note.mjs';
import {
  getReminderPreview,
  getReminderSchedulePreview,
  parseReminderNote,
  REMINDER_NOTE_TYPE,
} from '../utils/reminder-note.mjs';
import { formatNoteUpdatedAt } from '../utils/note-timestamp.mjs';

// ponytail: entering animations are native-only — reanimated web leaves items visibility:hidden
const entering = (index) =>
  Platform.OS === 'web' ? undefined : FadeInDown.duration(220).delay(Math.min(index * 40, 240));

const NoteItem = ({
  note,
  onPress,
  onOpenActions,
  index = 0,
  checklistProgressOnly = false,
  reminderScheduleOnly = false,
}) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const locked = !!note.password;
  const isExpense = note.note_type === EXPENSE_NOTE_TYPE;
  const isChecklist = note.note_type === CHECKLIST_NOTE_TYPE;
  const isReminder = note.note_type === REMINDER_NOTE_TYPE;
  const isPlainNote = !isExpense && !isChecklist && !isReminder;
  const expense = isExpense ? parseExpenseNote(note.content) : null;
  const checklistItems = isChecklist ? parseChecklistNote(note.content).items : [];
  const reminder = isReminder ? parseReminderNote(note.content).reminder : null;
  const displayTitle = isExpense
    ? note.title.trim() || 'Expense Record'
    : isChecklist
      ? note.title.trim() || 'Checklist'
      : isReminder
        ? note.title.trim() || 'Reminder'
      : note.title || 'Untitled';
  const preview = isExpense
    ? formatExpenseMoney(
        calculateExpenseGrandTotal(expense.rows, expense.monthlyCommitments),
        expense.currency
      )
    : isChecklist
      ? checklistProgressOnly
        ? getChecklistProgressPreview(checklistItems)
        : getChecklistPreview(checklistItems)
      : isReminder
        ? reminderScheduleOnly
          ? getReminderSchedulePreview(note.content)
          : getReminderPreview(note.content)
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
          {isPlainNote && (
            <View style={styles.typeBadge}>
              <Ionicons name="document-text-outline" size={12} color={colors.primary} />
              <Text style={styles.typeBadgeText}>Note</Text>
            </View>
          )}
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
          {isReminder && (
            <View style={styles.typeBadge}>
              <Ionicons
                name={reminder?.enabled ? 'notifications' : 'alarm-outline'}
                size={12}
                color={colors.primary}
              />
              <Text style={styles.typeBadgeText}>Reminder</Text>
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
          {note.collaborator_count > 0 && (
            <View
              style={styles.shareBadge}
              accessibilityLabel={`Shared with ${note.collaborator_count} ${note.collaborator_count === 1 ? 'person' : 'people'}`}
            >
              <Ionicons name="people" size={13} color={colors.primary} />
              <Text style={styles.shareBadgeText}>{note.collaborator_count}</Text>
            </View>
          )}
          {note.share_origin === 'incoming' && (
            <View style={styles.shareBadge} accessibilityLabel="Shared with you">
              <Ionicons name="people" size={13} color={colors.primary} />
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
                : isReminder
                  ? 'Locked reminder'
                : 'Locked note'
            : preview}
        </Text>
        <View style={styles.updatedAtRow}>
          <Ionicons
            name="time-outline"
            size={13}
            color={colors.textTertiary}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={styles.updatedAt}>
            {formatNoteUpdatedAt(note.updated_at)}
          </Text>
        </View>
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
    shareBadge: {
      minWidth: 24,
      height: 24,
      paddingHorizontal: 6,
      borderRadius: radius.full,
      backgroundColor: colors.primarySoft,
      flexDirection: 'row',
      gap: 3,
      justifyContent: 'center',
      alignItems: 'center',
    },
    shareBadgeText: { color: colors.primary, fontSize: 11, fontWeight: '800' },
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
    updatedAtRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    updatedAt: {
      fontSize: 12,
      lineHeight: 16,
      color: colors.textTertiary,
      flex: 1,
    },
  });

export default NoteItem;
