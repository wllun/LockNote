import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { AppAlert as Alert } from '../utils/app-alert';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  calculateCategorizedTotal,
  calculateExpenseCategory,
  findExpenseCategory,
  formatExpenseMoney,
  getExpenseCurrency,
  recalculateExpenseCategories,
} from '../utils/expense-record.mjs';
import { EXPENSE_SUMMARY_NOTE_MAX_CHARACTERS } from '../utils/note-limits.mjs';
import { radius, shadow, useTheme } from '../theme';

const cleanText = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');

const ExpenseSummaryModal = ({
  visible,
  onClose,
  rows,
  categories,
  summaryNote,
  currency,
  saveStatus,
  onSave,
  onDelete,
  onNoteChange,
}) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [mode, setMode] = useState('list');
  const [categoryId, setCategoryId] = useState(null);
  const [categoryName, setCategoryName] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [keywords, setKeywords] = useState([]);
  const [saving, setSaving] = useState(false);
  const [categoryActionId, setCategoryActionId] = useState(null);
  const [categoryActionMode, setCategoryActionMode] = useState('actions');
  const [deletingCategory, setDeletingCategory] = useState(false);
  const summaryNoteLimitDialogShownRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setMode('list');
    setCategoryId(null);
    setCategoryName('');
    setKeywordInput('');
    setKeywords([]);
    setSaving(false);
    setCategoryActionId(null);
    setCategoryActionMode('actions');
    setDeletingCategory(false);
    summaryNoteLimitDialogShownRef.current = false;
  }, [visible]);

  const liveCategories = useMemo(
    () => recalculateExpenseCategories(rows, categories),
    [categories, rows]
  );
  const categorizedTotal = calculateCategorizedTotal(liveCategories);
  const selectedCurrency = getExpenseCurrency(currency);
  const categoryWithSameName = categoryName.trim()
    ? findExpenseCategory(liveCategories, categoryName)
    : null;
  const activeCategory = liveCategories.find(
    (category) => category.id === categoryActionId
  );
  const activeCategoryMatches = useMemo(
    () => activeCategory
      ? calculateExpenseCategory(rows, activeCategory.keywords).matches
      : [],
    [activeCategory, rows]
  );
  const transactionListMaxHeight = Math.max(
    96,
    Math.min(
      420,
      windowHeight - insets.top - Math.max(insets.bottom, 16) - 230
    )
  );
  const isUpdating = !!categoryId || !!categoryWithSameName;
  const handleSummaryNoteChange = (value) => {
    const rawValue = String(value ?? '');
    const nextValue = rawValue.slice(0, EXPENSE_SUMMARY_NOTE_MAX_CHARACTERS);
    const limitReached = rawValue.length >= EXPENSE_SUMMARY_NOTE_MAX_CHARACTERS;
    if (limitReached && !summaryNoteLimitDialogShownRef.current) {
      summaryNoteLimitDialogShownRef.current = true;
      Alert.alert(
        'Character limit reached',
        `Monthly summary notes can contain up to ${EXPENSE_SUMMARY_NOTE_MAX_CHARACTERS.toLocaleString()} characters. Additional typed or pasted text cannot be added.`,
        [{ text: 'OK' }],
        { variant: 'warning', iconName: 'text-outline' }
      );
    } else if (!limitReached) {
      summaryNoteLimitDialogShownRef.current = false;
    }
    if (nextValue !== summaryNote) onNoteChange(nextValue);
  };

  const startForm = (category = null) => {
    setCategoryId(category?.id ?? null);
    setCategoryName(category?.name ?? '');
    setKeywordInput('');
    setKeywords(category?.keywords ?? []);
    setMode('form');
  };

  const addKeyword = () => {
    const nextKeyword = cleanText(keywordInput);
    if (!nextKeyword) return;
    if (
      keywords.some(
        (keyword) => keyword.toLowerCase() === nextKeyword.toLowerCase()
      )
    ) {
      setKeywordInput('');
      return;
    }
    setKeywords([...keywords, nextKeyword]);
    setKeywordInput('');
  };

  const removeKeyword = (keywordToRemove) => {
    setKeywords(keywords.filter((keyword) => keyword !== keywordToRemove));
  };

  const keywordsWithPendingInput = () => {
    const pendingKeyword = cleanText(keywordInput);
    if (
      !pendingKeyword ||
      keywords.some(
        (keyword) => keyword.toLowerCase() === pendingKeyword.toLowerCase()
      )
    ) {
      return keywords;
    }
    return [...keywords, pendingKeyword];
  };

  const save = async () => {
    const name = cleanText(categoryName);
    if (!name) {
      Alert.alert('Enter a category name', 'Give this saved category a name such as Food or Petrol.');
      return;
    }
    if (
      categoryId &&
      categoryWithSameName &&
      categoryWithSameName.id !== categoryId
    ) {
      Alert.alert(
        'Category name already exists',
        `Choose another name or edit the existing ${categoryWithSameName.name} category.`
      );
      return;
    }

    const nextKeywords = keywordsWithPendingInput();
    if (!nextKeywords.length) {
      Alert.alert(
        'Add a remark keyword',
        'Category amounts are calculated automatically. Add at least one keyword to match daily expenses.'
      );
      return;
    }
    const currentCalculation = calculateExpenseCategory(rows, nextKeywords);
    setSaving(true);
    try {
      await onSave({
        id: categoryId,
        name,
        keywords: nextKeywords,
        amount: currentCalculation.amount,
        matchCount: currentCalculation.matchCount,
      });
      setMode('list');
    } catch {
      Alert.alert('Could not save category', 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const showCategoryActions = (category) => {
    setCategoryActionId(category.id);
    setCategoryActionMode('actions');
  };

  const closeCategoryActions = () => {
    if (deletingCategory) return;
    setCategoryActionId(null);
    setCategoryActionMode('actions');
  };

  const editActiveCategory = () => {
    if (!activeCategory) return;
    const category = activeCategory;
    setCategoryActionId(null);
    setCategoryActionMode('actions');
    startForm(category);
  };

  const deleteActiveCategory = async () => {
    if (!activeCategory || deletingCategory) return;
    const categoryIdToDelete = activeCategory.id;
    setDeletingCategory(true);
    try {
      await onDelete(categoryIdToDelete);
      setCategoryActionId(null);
      setCategoryActionMode('actions');
    } finally {
      setDeletingCategory(false);
    }
  };

  const categoryDescription = (category) =>
    `${category.keywords.join(', ')} · ${category.match_count} matching ${
      category.match_count === 1 ? 'entry' : 'entries'
    }`;

  const formCalculation = calculateExpenseCategory(
    rows,
    keywordsWithPendingInput()
  );

  return (
    <>
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : Platform.OS === 'android'
              ? 'height'
              : undefined
        }
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
        <View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          accessibilityViewIsModal
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>
                {mode === 'list' ? 'Monthly summary' : isUpdating ? 'Edit category' : 'Add category'}
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close expense summary"
            >
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>

          {mode === 'list' ? (
            <ScrollView
              contentContainerStyle={styles.body}
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              keyboardShouldPersistTaps="handled"
            >
              <Pressable
                style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}
                onPress={() => startForm()}
                accessibilityRole="button"
                accessibilityLabel="Add expense category"
              >
                <Ionicons name="add" size={20} color={colors.primary} />
                <Text style={styles.outlineButtonText}>Add category</Text>
              </Pressable>

              <View style={styles.totalCard}>
                <Text style={styles.totalLabel}>CATEGORIZED TOTAL</Text>
                <Text style={styles.totalValue}>
                  {formatExpenseMoney(categorizedTotal, currency)}
                </Text>
              </View>

              <Text style={styles.sectionTitle}>Saved categories</Text>
              {liveCategories.length ? (
                liveCategories.map((category) => (
                  <View key={category.id} style={styles.categoryRow}>
                    <View style={styles.categoryIcon}>
                      <Ionicons
                        name="calculator-outline"
                        size={20}
                        color={colors.primary}
                      />
                    </View>
                    <View style={styles.categoryInfo}>
                      <Text style={styles.categoryName}>{category.name}</Text>
                      <Text style={styles.categoryMeta} numberOfLines={2}>
                        {categoryDescription(category)}
                      </Text>
                    </View>
                    <Text style={styles.categoryAmount}>
                      {formatExpenseMoney(category.amount, currency)}
                    </Text>
                    <Pressable
                      style={({ pressed }) => [styles.rowMenuButton, pressed && styles.pressed]}
                      onPress={() => showCategoryActions(category)}
                      accessibilityRole="button"
                      accessibilityLabel={`Actions for ${category.name} category`}
                    >
                      <Ionicons name="ellipsis-vertical" size={20} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="albums-outline" size={28} color={colors.textTertiary} />
                  <Text style={styles.emptyTitle}>No saved categories yet</Text>
                  <Text style={styles.emptyText}>
                    Add a category with remark keywords. Its amount will update automatically from matching daily expenses.
                  </Text>
                </View>
              )}

              <Text style={[styles.sectionTitle, styles.notesHeading]}>Notes</Text>
              <TextInput
                style={styles.notesInput}
                value={summaryNote}
                onChangeText={handleSummaryNoteChange}
                placeholder="Add notes about this monthly summary..."
                placeholderTextColor={colors.textTertiary}
                multiline
                textAlignVertical="top"
                accessibilityLabel="Monthly summary notes"
                accessibilityHint={`Maximum ${EXPENSE_SUMMARY_NOTE_MAX_CHARACTERS.toLocaleString()} characters`}
              />
              {saveStatus === 'Saving...' || saveStatus === 'Could not save' ? (
                <View style={styles.notesStatus}>
                  <View style={styles.notesSaveStatus}>
                    <Ionicons
                      name={saveStatus === 'Could not save' ? 'alert-circle-outline' : 'checkmark-circle-outline'}
                      size={15}
                      color={saveStatus === 'Could not save' ? colors.danger : colors.primary}
                    />
                    <Text
                      style={[
                        styles.notesStatusText,
                        saveStatus === 'Could not save' && { color: colors.danger },
                      ]}
                    >
                      {saveStatus === 'Saving...' ? 'Saving notes...' : 'Could not save notes'}
                    </Text>
                  </View>
                </View>
              ) : null}
            </ScrollView>
          ) : (
            <ScrollView
              contentContainerStyle={styles.body}
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              keyboardShouldPersistTaps="handled"
            >
              {!categoryId && categoryWithSameName && (
                <View style={styles.infoBanner}>
                  <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
                  <Text style={styles.infoText}>
                    Saving will update the existing {categoryWithSameName.name} category.
                  </Text>
                </View>
              )}

              <Text style={styles.inputLabel}>Category name</Text>
              <TextInput
                style={styles.formInput}
                value={categoryName}
                onChangeText={setCategoryName}
                placeholder="e.g. Food"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="words"
                maxLength={80}
                accessibilityLabel="Expense category name"
              />

              <Text style={styles.inputLabel}>Match remarks</Text>
              {!!keywords.length && (
                <View style={styles.keywordWrap}>
                  {keywords.map((keyword) => (
                    <View key={keyword.toLowerCase()} style={styles.keywordChip}>
                      <Text style={styles.keywordText}>{keyword}</Text>
                      <Pressable
                        style={styles.keywordRemove}
                        onPress={() => removeKeyword(keyword)}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${keyword} keyword`}
                      >
                        <Ionicons name="close" size={15} color={colors.primary} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
              <View style={styles.keywordEntry}>
                <TextInput
                  style={styles.keywordInput}
                  value={keywordInput}
                  onChangeText={setKeywordInput}
                  placeholder="Add a keyword"
                  placeholderTextColor={colors.textTertiary}
                  returnKeyType="done"
                  onSubmitEditing={addKeyword}
                  accessibilityLabel="New remark keyword"
                />
                <Pressable
                  style={({ pressed }) => [styles.addKeywordButton, pressed && styles.pressed]}
                  onPress={addKeyword}
                  accessibilityRole="button"
                  accessibilityLabel="Add remark keyword"
                >
                  <Ionicons name="add" size={18} color={colors.primary} />
                  <Text style={styles.addKeywordText}>Add keyword</Text>
                </Pressable>
              </View>
              <Text style={styles.helper}>
                Keywords match any part of a daily expense remark, without case sensitivity.
              </Text>

              <Text style={styles.inputLabel}>Calculated amount</Text>
              <View
                style={styles.calculatedAmountCard}
                accessible
                accessibilityLabel={`Automatically calculated amount ${formatExpenseMoney(formCalculation.amount, currency)} in ${selectedCurrency.name} from ${formCalculation.matchCount} matching ${formCalculation.matchCount === 1 ? 'entry' : 'entries'}`}
              >
                <View style={styles.calculatedAmountIcon}>
                  <Ionicons name="calculator-outline" size={20} color={colors.primary} />
                </View>
                <View style={styles.calculatedAmountInfo}>
                  <Text style={styles.calculatedAmountValue}>
                    {formatExpenseMoney(formCalculation.amount, currency)}
                  </Text>
                  <Text style={styles.calculatedAmountMeta}>
                    {formCalculation.matchCount} matching {formCalculation.matchCount === 1 ? 'entry' : 'entries'}
                  </Text>
                </View>
                <View style={styles.autoBadge}>
                  <Ionicons name="sync-outline" size={13} color={colors.primary} />
                  <Text style={styles.autoBadgeText}>AUTO</Text>
                </View>
              </View>

              <Pressable
                disabled={saving}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.pressed,
                  saving && styles.disabled,
                ]}
                onPress={save}
                accessibilityRole="button"
                accessibilityLabel={isUpdating ? 'Update category' : 'Save category'}
                accessibilityState={{ busy: saving, disabled: saving }}
              >
                {saving && <ActivityIndicator size="small" color={colors.card} />}
                <Text style={styles.primaryButtonText}>
                  {saving ? 'Saving...' : isUpdating ? 'Update category' : 'Save category'}
                </Text>
              </Pressable>

              {liveCategories.length > 0 && (
                <Pressable
                  style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
                  onPress={() => setMode('list')}
                  accessibilityRole="button"
                  accessibilityLabel="Back to saved categories"
                >
                  <Text style={styles.textButtonText}>Back to saved categories</Text>
                </Pressable>
              )}
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>

    <Modal
      visible={!!activeCategory}
      animationType={activeCategory ? 'fade' : 'none'}
      transparent
      statusBarTranslucent
      onRequestClose={closeCategoryActions}
    >
      <View
        style={[
          styles.categoryActionOverlay,
          Platform.OS === 'web'
            ? styles.categoryActionOverlayWeb
            : styles.categoryActionOverlayPhone,
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={closeCategoryActions}
          accessible={false}
        />
        <View
          style={[
            styles.categoryActionPanel,
            Platform.OS === 'web'
              ? styles.categoryActionPanelWeb
              : styles.categoryActionPanelPhone,
            Platform.OS !== 'web' && {
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
          accessibilityViewIsModal
          testID="expense-category-actions"
        >
          {categoryActionMode === 'actions' ? (
            <>
              <View style={styles.categoryActionHeader}>
                <View style={styles.categoryActionHeading}>
                  <Text style={styles.categoryActionTitle} numberOfLines={1}>
                    {activeCategory?.name}
                  </Text>
                  <Text style={styles.categoryActionAmount}>
                    {formatExpenseMoney(activeCategory?.amount ?? 0, currency)} ·{' '}
                    {activeCategory?.match_count ?? 0}{' '}
                    {(activeCategory?.match_count ?? 0) === 1 ? 'transaction' : 'transactions'}
                  </Text>
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.categoryActionClose,
                    pressed && styles.pressed,
                  ]}
                  onPress={closeCategoryActions}
                  accessibilityRole="button"
                  accessibilityLabel="Close category actions"
                >
                  <Ionicons name="close" size={21} color={colors.textSecondary} />
                </Pressable>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.categoryActionItem,
                  pressed && styles.categoryActionItemPressed,
                ]}
                onPress={() => setCategoryActionMode('view')}
                accessibilityRole="button"
                accessibilityLabel={`View transactions for ${activeCategory?.name ?? ''} category`}
              >
                <View style={styles.categoryActionItemIcon}>
                  <Ionicons name="eye-outline" size={20} color={colors.primary} />
                </View>
                <View style={styles.categoryActionItemText}>
                  <Text style={styles.categoryActionItemTitle}>View transactions</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.categoryActionItem,
                  styles.categoryActionItemBorder,
                  pressed && styles.categoryActionItemPressed,
                ]}
                onPress={editActiveCategory}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${activeCategory?.name ?? ''} category`}
              >
                <View style={styles.categoryActionItemIcon}>
                  <Ionicons name="create-outline" size={20} color={colors.primary} />
                </View>
                <View style={styles.categoryActionItemText}>
                  <Text style={styles.categoryActionItemTitle}>Edit category</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.categoryActionItem,
                  styles.categoryDeleteItem,
                  pressed && styles.categoryActionItemPressed,
                ]}
                onPress={() => setCategoryActionMode('delete')}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${activeCategory?.name ?? ''} category`}
              >
                <View style={[styles.categoryActionItemIcon, styles.categoryDeleteIcon]}>
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </View>
                <View style={styles.categoryActionItemText}>
                  <Text style={[styles.categoryActionItemTitle, styles.categoryDeleteText]}>
                    Delete category
                  </Text>
                </View>
              </Pressable>
            </>
          ) : categoryActionMode === 'view' ? (
            <View style={styles.categoryTransactions}>
              <View style={styles.categoryActionHeader}>
                <View style={styles.categoryActionHeading}>
                  <Text style={styles.categoryActionTitle} numberOfLines={1}>
                    {activeCategory?.name}
                  </Text>
                  <Text style={styles.categoryActionAmount}>
                    {formatExpenseMoney(activeCategory?.amount ?? 0, currency)} ·{' '}
                    {activeCategoryMatches.length}{' '}
                    {activeCategoryMatches.length === 1 ? 'transaction' : 'transactions'}
                  </Text>
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.categoryActionClose,
                    pressed && styles.pressed,
                  ]}
                  onPress={closeCategoryActions}
                  accessibilityRole="button"
                  accessibilityLabel="Close related transactions"
                >
                  <Ionicons name="close" size={21} color={colors.textSecondary} />
                </Pressable>
              </View>

              <ScrollView
                style={{ maxHeight: transactionListMaxHeight }}
                contentContainerStyle={styles.categoryTransactionList}
                nestedScrollEnabled
                showsVerticalScrollIndicator={activeCategoryMatches.length > 4}
              >
                {activeCategoryMatches.length ? (
                  activeCategoryMatches.map((row, index) => (
                    <View
                      key={row.id || `matching-transaction-${index}`}
                      style={styles.categoryTransactionRow}
                      accessible
                      accessibilityLabel={`${row.date ? `Day ${row.date}` : 'No day'}, ${String(row.remark ?? '').trim() || 'No remark'}, ${formatExpenseMoney(row.amount, currency)}`}
                    >
                      <View style={styles.categoryTransactionDay}>
                        <Text style={styles.categoryTransactionDayLabel}>DAY</Text>
                        <Text style={styles.categoryTransactionDayValue} numberOfLines={1}>
                          {row.date || '—'}
                        </Text>
                      </View>
                      <Text style={styles.categoryTransactionRemark} numberOfLines={2}>
                        {String(row.remark ?? '').trim() || 'No remark'}
                      </Text>
                      <Text style={styles.categoryTransactionAmount}>
                        {formatExpenseMoney(row.amount, currency)}
                      </Text>
                    </View>
                  ))
                ) : (
                  <View style={styles.categoryTransactionsEmpty}>
                    <Ionicons name="receipt-outline" size={28} color={colors.textTertiary} />
                    <Text style={styles.categoryTransactionsEmptyTitle}>
                      No matching transactions
                    </Text>
                    <Text style={styles.categoryTransactionsEmptyText}>
                      Transactions will appear here when their remarks match this category's keywords.
                    </Text>
                  </View>
                )}
              </ScrollView>

              <View style={styles.categoryTransactionsFooter}>
                <Pressable
                  style={({ pressed }) => [
                    styles.categoryTransactionsBackButton,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => setCategoryActionMode('actions')}
                  accessibilityRole="button"
                  accessibilityLabel="Back to category actions"
                >
                  <Ionicons name="arrow-back" size={18} color={colors.primary} />
                  <Text style={styles.categoryTransactionsBackText}>Back to actions</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.categoryDeleteConfirmation}>
              <View style={styles.categoryDeleteConfirmationIcon}>
                <Ionicons name="trash-outline" size={25} color={colors.danger} />
              </View>
              <Text style={styles.categoryDeleteConfirmationTitle}>
                Delete {activeCategory?.name}?
              </Text>
              <Text style={styles.categoryDeleteConfirmationText}>
                This removes the category from the summary. Your daily expense rows will not be deleted.
              </Text>
              <View style={styles.categoryDeleteButtons}>
                <Pressable
                  disabled={deletingCategory}
                  style={({ pressed }) => [
                    styles.categoryDeleteButton,
                    styles.categoryCancelButton,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => setCategoryActionMode('actions')}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel category deletion"
                >
                  <Text style={styles.categoryCancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={deletingCategory}
                  style={({ pressed }) => [
                    styles.categoryDeleteButton,
                    styles.categoryConfirmDeleteButton,
                    pressed && styles.pressed,
                    deletingCategory && styles.disabled,
                  ]}
                  onPress={deleteActiveCategory}
                  accessibilityRole="button"
                  accessibilityLabel={`Confirm delete ${activeCategory?.name ?? ''} category`}
                  accessibilityState={{ busy: deletingCategory, disabled: deletingCategory }}
                >
                  {deletingCategory ? (
                    <ActivityIndicator size="small" color={colors.onDanger} />
                  ) : (
                    <Ionicons name="trash-outline" size={18} color={colors.onDanger} />
                  )}
                  <Text style={styles.categoryConfirmDeleteText}>
                    {deletingCategory ? 'Deleting...' : 'Delete'}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
    </>
  );
};

const makeStyles = (colors) =>
  StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.backdropStrong },
    sheet: { maxHeight: '90%', backgroundColor: colors.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, ...shadow.card },
    handle: { width: 42, height: 4, borderRadius: radius.full, backgroundColor: colors.border, alignSelf: 'center', marginTop: 9 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 13, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
    title: { color: colors.text, fontSize: 21, fontWeight: '800' },
    iconButton: { width: 48, height: 48, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.inputBg },
    pressed: { opacity: 0.72 },
    body: { padding: 20, gap: 12 },
    outlineButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md },
    outlineButtonText: { color: colors.primary, fontSize: 14, fontWeight: '800' },
    totalCard: { padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.inputBg },
    totalLabel: { color: colors.textTertiary, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
    totalValue: { color: colors.text, fontSize: 25, fontWeight: '800', marginTop: 3, fontVariant: ['tabular-nums'] },
    sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 4 },
    categoryRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card },
    categoryIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
    categoryInfo: { flex: 1, minWidth: 0 },
    categoryName: { color: colors.text, fontSize: 15, fontWeight: '700' },
    categoryMeta: { color: colors.textTertiary, fontSize: 11, lineHeight: 16, marginTop: 2 },
    categoryAmount: { color: colors.text, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
    rowMenuButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full },
    emptyState: { alignItems: 'center', padding: 24, gap: 7, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.md },
    emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
    emptyText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center' },
    notesHeading: { marginTop: 8 },
    notesInput: { minHeight: 100, color: colors.text, fontSize: 15, lineHeight: 21, padding: 13, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.inputBg, outlineStyle: 'none' },
    notesStatus: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: -6 },
    notesSaveStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    notesStatusText: { color: colors.textTertiary, fontSize: 11 },
    footerHint: { color: colors.textTertiary, fontSize: 12, lineHeight: 18, textAlign: 'center' },
    inputLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
    formInput: { minHeight: 50, color: colors.text, fontSize: 16, paddingHorizontal: 13, paddingVertical: 11, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.inputBg, outlineStyle: 'none' },
    keywordWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    keywordChip: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 11, paddingRight: 5, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.full, backgroundColor: colors.primarySoft },
    keywordText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
    keywordRemove: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full },
    keywordEntry: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    keywordInput: { flex: 1, minWidth: 0, minHeight: 48, color: colors.text, fontSize: 15, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.inputBg, outlineStyle: 'none' },
    addKeywordButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md },
    addKeywordText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
    helper: { color: colors.textTertiary, fontSize: 11, lineHeight: 17, marginTop: -6 },
    calculatedAmountCard: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.inputBg },
    calculatedAmountIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.primarySoft },
    calculatedAmountInfo: { flex: 1, minWidth: 0 },
    calculatedAmountValue: { color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
    calculatedAmountMeta: { marginTop: 2, color: colors.textSecondary, fontSize: 11, lineHeight: 16 },
    autoBadge: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, borderRadius: radius.full, backgroundColor: colors.primarySoft },
    autoBadgeText: { color: colors.primary, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
    primaryButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.md, backgroundColor: colors.primary },
    primaryButtonText: { color: colors.card, fontSize: 15, fontWeight: '800' },
    disabled: { opacity: 0.55 },
    infoBanner: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.primarySoft },
    infoText: { flex: 1, color: colors.primary, fontSize: 13, fontWeight: '600' },
    textButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
    textButtonText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
    categoryActionOverlay: { flex: 1, padding: 16, backgroundColor: colors.backdropStrong },
    categoryActionOverlayPhone: { justifyContent: 'flex-end' },
    categoryActionOverlayWeb: { justifyContent: 'center', alignItems: 'center' },
    categoryActionPanel: { width: '100%', overflow: 'hidden', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, ...shadow.card },
    categoryActionPanelPhone: { borderRadius: radius.lg },
    categoryActionPanelWeb: { maxWidth: 400, borderRadius: radius.lg },
    categoryActionHeader: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 18, paddingRight: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
    categoryActionHeading: { flex: 1, minWidth: 0 },
    categoryActionTitle: { color: colors.text, fontSize: 18, lineHeight: 23, fontWeight: '800' },
    categoryActionAmount: { marginTop: 2, color: colors.textSecondary, fontSize: 12, lineHeight: 17, fontVariant: ['tabular-nums'] },
    categoryActionClose: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full },
    categoryActionItem: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, backgroundColor: colors.card },
    categoryActionItemPressed: { backgroundColor: colors.inputBg },
    categoryActionItemIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.primarySoft },
    categoryActionItemText: { flex: 1, minWidth: 0 },
    categoryActionItemTitle: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: '700' },
    categoryActionItemBorder: { borderTopWidth: 1, borderTopColor: colors.border },
    categoryDeleteItem: { borderTopWidth: 1, borderTopColor: colors.border },
    categoryDeleteIcon: { backgroundColor: colors.dangerSoft },
    categoryDeleteText: { color: colors.danger },
    categoryTransactions: { flexShrink: 1 },
    categoryTransactionList: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, gap: 8 },
    categoryTransactionRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.inputBg },
    categoryTransactionDay: { width: 38, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.primarySoft },
    categoryTransactionDayLabel: { color: colors.textTertiary, fontSize: 8, lineHeight: 10, fontWeight: '800', letterSpacing: 0.5 },
    categoryTransactionDayValue: { maxWidth: 32, marginTop: 1, color: colors.primary, fontSize: 13, lineHeight: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
    categoryTransactionRemark: { flex: 1, minWidth: 0, color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: '600' },
    categoryTransactionAmount: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
    categoryTransactionsEmpty: { alignItems: 'center', paddingHorizontal: 20, paddingVertical: 28, gap: 7, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.md },
    categoryTransactionsEmptyTitle: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: '700', textAlign: 'center' },
    categoryTransactionsEmptyText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center' },
    categoryTransactionsFooter: { padding: 12, borderTopWidth: 1, borderTopColor: colors.border },
    categoryTransactionsBackButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, backgroundColor: colors.card },
    categoryTransactionsBackText: { color: colors.primary, fontSize: 14, lineHeight: 19, fontWeight: '800' },
    categoryDeleteConfirmation: { alignItems: 'center', padding: 24 },
    categoryDeleteConfirmationIcon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, backgroundColor: colors.dangerSoft },
    categoryDeleteConfirmationTitle: { marginTop: 16, color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: '800', textAlign: 'center' },
    categoryDeleteConfirmationText: { marginTop: 8, color: colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center' },
    categoryDeleteButtons: { width: '100%', flexDirection: 'row', gap: 12, marginTop: 20 },
    categoryDeleteButton: { minHeight: 50, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: radius.md },
    categoryCancelButton: { backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border },
    categoryCancelButtonText: { color: colors.text, fontSize: 15, fontWeight: '700' },
    categoryConfirmDeleteButton: { backgroundColor: colors.dangerAction },
    categoryConfirmDeleteText: { color: colors.onDanger, fontSize: 15, fontWeight: '800' },
  });

export default ExpenseSummaryModal;
