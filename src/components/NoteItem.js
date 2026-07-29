import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { radius, shadow, useTheme } from '../theme';
import {
  calculateExpenseTotal,
  EXPENSE_NOTE_TYPE,
  expenseRowHasContent,
  formatExpenseAmount,
  parseExpenseNote,
} from '../utils/expense-record.mjs';

// ponytail: entering animations are native-only — reanimated web leaves items visibility:hidden
const entering = (index) =>
  Platform.OS === 'web' ? undefined : FadeInDown.duration(220).delay(Math.min(index * 40, 240));

const NoteItem = ({ note, onPress, onTogglePin, index = 0 }) => {
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
  const expenseRows = isExpense
    ? parseExpenseNote(note.content).rows.filter(expenseRowHasContent)
    : [];
  const displayTitle = isExpense
    ? note.title.trim() || 'Expense Record'
    : note.title || 'Untitled';
  const preview = isExpense
    ? expenseRows.length
      ? `${expenseRows.length} ${expenseRows.length === 1 ? 'entry' : 'entries'} • ${formatExpenseAmount(calculateExpenseTotal(expenseRows))}`
      : 'No expense entries yet'
    : note.content || 'No content';

  const handlePinPress = (e) => {
    e.stopPropagation?.();
    onTogglePin?.();
  };

  return (
    <Animated.View entering={entering(index)}>
      <TouchableOpacity
        style={styles.container}
        onPress={onPress}
        onLongPress={onTogglePin}
        activeOpacity={0.7}
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
          {locked && (
            <View style={styles.lockBadge}>
              <Ionicons name="lock-closed" size={12} color={colors.folder} />
            </View>
          )}
          <TouchableOpacity
            style={styles.pinButton}
            onPress={handlePinPress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.6}
          >
            <Ionicons
              name={note.is_pinned ? 'pin' : 'pin-outline'}
              size={16}
              color={note.is_pinned ? colors.primary : colors.textTertiary}
            />
          </TouchableOpacity>
        </View>
        <Text style={styles.preview} numberOfLines={2}>
          {locked ? (isExpense ? 'Locked expense record' : 'Locked note') : preview}
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
    pinButton: {
      padding: 2,
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
