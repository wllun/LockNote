import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  EXPENSE_CURRENCIES,
  normalizeExpenseCurrency,
} from '../utils/expense-record.mjs';
import { radius, shadow, useTheme } from '../theme';

const ExpenseCurrencyModal = ({
  visible,
  value,
  onSelect,
  onClose,
  description = 'Used for this expense note, its summaries, and exports.',
}) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const selectedCode = normalizeExpenseCurrency(value);
  const [query, setQuery] = useState('');
  const filteredCurrencies = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return EXPENSE_CURRENCIES;
    return EXPENSE_CURRENCIES.filter((option) =>
      `${option.code} ${option.name} ${option.symbol}`
        .toLocaleLowerCase()
        .includes(normalizedQuery)
    );
  }, [query]);

  useEffect(() => {
    setQuery('');
  }, [visible]);

  const renderCurrency = ({ item: option }) => {
    const isSelected = option.code === selectedCode;
    return (
      <Pressable
        style={({ pressed }) => [
          styles.option,
          isSelected && styles.optionSelected,
          pressed && styles.pressed,
        ]}
        onPress={() => onSelect(option.code)}
        accessibilityRole="radio"
        accessibilityState={{ checked: isSelected }}
        accessibilityLabel={`${option.name}, ${option.code}, symbol ${option.symbol}`}
      >
        <View style={styles.symbolBox}>
          <Text style={styles.symbolText} numberOfLines={1}>
            {option.symbol}
          </Text>
        </View>
        <View style={styles.optionCopy}>
          <Text style={styles.optionName}>{option.name}</Text>
          <Text style={styles.optionCode}>{option.code}</Text>
        </View>
        {isSelected && (
          <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
        )}
      </Pressable>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType={visible ? 'fade' : 'none'}
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.overlay,
          {
            paddingTop: Math.max(12, insets.top + 8),
            paddingBottom: Math.max(12, insets.bottom + 8),
          },
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessible={false}
        />
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title} accessibilityRole="header">
                Expense currency
              </Text>
              <Text style={styles.description}>{description}</Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.closeButton,
                pressed && styles.pressed,
              ]}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close currency selection"
            >
              <Ionicons name="close" size={21} color={colors.text} />
            </Pressable>
          </View>
          <View style={styles.searchWrap}>
            <View style={styles.searchField}>
              <Ionicons name="search" size={18} color={colors.textTertiary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                style={styles.searchInput}
                placeholder="Search currency or code"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                clearButtonMode="while-editing"
                accessibilityLabel="Search currencies"
              />
              {!!query && (
                <Pressable
                  style={({ pressed }) => [
                    styles.clearButton,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => setQuery('')}
                  accessibilityRole="button"
                  accessibilityLabel="Clear currency search"
                  hitSlop={8}
                >
                  <Ionicons
                    name="close-circle"
                    size={19}
                    color={colors.textTertiary}
                  />
                </Pressable>
              )}
            </View>
          </View>
          <FlatList
            style={styles.list}
            contentContainerStyle={styles.listContent}
            data={filteredCurrencies}
            keyExtractor={(option) => option.code}
            renderItem={renderCurrency}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No matching currency</Text>
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );
};

const makeStyles = (colors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingHorizontal: 12,
      backgroundColor: colors.backdrop,
    },
    sheet: {
      width: '100%',
      maxWidth: 480,
      height: '82%',
      maxHeight: 720,
      overflow: 'hidden',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      ...shadow.card,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 18,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.inputBg,
    },
    headerCopy: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '800',
    },
    description: {
      marginTop: 3,
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 17,
    },
    closeButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.full,
      backgroundColor: colors.card,
    },
    searchWrap: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.card,
    },
    searchField: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.inputBg,
    },
    searchInput: {
      flex: 1,
      minWidth: 0,
      paddingVertical: 9,
      color: colors.text,
      fontSize: 15,
    },
    clearButton: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.full,
    },
    list: {
      flex: 1,
    },
    listContent: {
      paddingVertical: 6,
      flexGrow: 1,
    },
    option: {
      minHeight: 58,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 7,
      backgroundColor: colors.card,
    },
    optionSelected: {
      backgroundColor: colors.primarySoft,
    },
    pressed: {
      opacity: 0.72,
    },
    symbolBox: {
      width: 54,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.inputBg,
    },
    symbolText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '800',
    },
    optionCopy: {
      flex: 1,
      minWidth: 0,
    },
    optionName: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '700',
    },
    optionCode: {
      marginTop: 2,
      color: colors.textTertiary,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 28,
    },
    emptyText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },
  });

export default ExpenseCurrencyModal;
