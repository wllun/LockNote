import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  calculateCategorizedTotal,
  calculateExpenseCategory,
  findExpenseCategory,
  formatExpenseAmount,
  normalizeExpenseAmountInput,
  parseExpenseAmount,
  sanitizeExpenseAmountInput,
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
  saveStatus,
  onSave,
  onDelete,
  onNoteChange,
}) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState('list');
  const [categoryId, setCategoryId] = useState(null);
  const [categoryName, setCategoryName] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [keywords, setKeywords] = useState([]);
  const [amount, setAmount] = useState('');
  const [calculation, setCalculation] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setMode('list');
    setCategoryId(null);
    setCategoryName('');
    setKeywordInput('');
    setKeywords([]);
    setAmount('');
    setCalculation(null);
    setSaving(false);
  }, [visible]);

  const categorizedTotal = calculateCategorizedTotal(categories);
  const categoryWithSameName = categoryName.trim()
    ? findExpenseCategory(categories, categoryName)
    : null;
  const isUpdating = !!categoryId || !!categoryWithSameName;
  const summaryNoteCharacterCount = String(summaryNote ?? '').length;
  const isSummaryNoteNearLimit =
    summaryNoteCharacterCount >= EXPENSE_SUMMARY_NOTE_MAX_CHARACTERS * 0.9;

  const startForm = (category = null) => {
    setCategoryId(category?.id ?? null);
    setCategoryName(category?.name ?? '');
    setKeywordInput('');
    setKeywords(category?.keywords ?? []);
    setAmount(category ? String(category.amount.toFixed(2)) : '');
    setCalculation(
      category?.keywords?.length
        ? { matchCount: category.match_count, amount: category.amount }
        : null
    );
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
    setCalculation(null);
  };

  const removeKeyword = (keywordToRemove) => {
    setKeywords(keywords.filter((keyword) => keyword !== keywordToRemove));
    setCalculation(null);
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

  const calculate = () => {
    const nextKeywords = keywordsWithPendingInput();
    if (!nextKeywords.length) {
      Alert.alert('Add a keyword', 'Add at least one remark keyword to calculate from the table.');
      return;
    }
    setKeywords(nextKeywords);
    setKeywordInput('');
    const result = calculateExpenseCategory(rows, nextKeywords);
    setCalculation(result);
    setAmount(result.amount.toFixed(2));
  };

  const save = async () => {
    const name = cleanText(categoryName);
    if (!name) {
      Alert.alert('Enter a category name', 'Give this saved category a name such as Food or Petrol.');
      return;
    }
    const normalizedAmount = normalizeExpenseAmountInput(amount);
    const parsedAmount = parseExpenseAmount(normalizedAmount);
    if (parsedAmount === null) {
      Alert.alert('Enter a valid amount', 'Use a positive amount with up to two decimal places.');
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
    const currentCalculation = nextKeywords.length
      ? calculateExpenseCategory(rows, nextKeywords)
      : { matchCount: 0 };
    setSaving(true);
    try {
      await onSave({
        id: categoryId,
        name,
        keywords: nextKeywords,
        amount: parsedAmount,
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
    Alert.alert(category.name, `RM ${formatExpenseAmount(category.amount)}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Edit category', onPress: () => startForm(category) },
      {
        text: 'Delete category',
        style: 'destructive',
        onPress: () =>
          Alert.alert(
            'Delete category?',
            `Remove ${category.name} from this monthly summary? Your expense rows will not be deleted.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => onDelete(category.id),
              },
            ]
          ),
      },
    ]);
  };

  const categoryDescription = (category) =>
    category.keywords.length
      ? `${category.keywords.join(', ')} · ${category.match_count} matching ${
          category.match_count === 1 ? 'entry' : 'entries'
        }`
      : 'Manual amount';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
        <View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          accessibilityViewIsModal
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>THIS EXPENSE NOTE</Text>
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
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
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
                <Text style={styles.totalValue}>RM {formatExpenseAmount(categorizedTotal)}</Text>
              </View>

              <Text style={styles.sectionTitle}>Saved categories</Text>
              {categories.length ? (
                categories.map((category) => (
                  <View key={category.id} style={styles.categoryRow}>
                    <View style={styles.categoryIcon}>
                      <Ionicons
                        name={category.keywords.length ? 'search-outline' : 'create-outline'}
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
                      RM {formatExpenseAmount(category.amount)}
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
                    Add a category and calculate from remarks, or enter an amount yourself.
                  </Text>
                </View>
              )}

              <Text style={[styles.sectionTitle, styles.notesHeading]}>Notes</Text>
              <TextInput
                style={styles.notesInput}
                value={summaryNote}
                onChangeText={onNoteChange}
                placeholder="Add notes about this monthly summary..."
                placeholderTextColor={colors.textTertiary}
                multiline
                textAlignVertical="top"
                maxLength={EXPENSE_SUMMARY_NOTE_MAX_CHARACTERS}
                accessibilityLabel="Monthly summary notes"
                accessibilityHint={`Maximum ${EXPENSE_SUMMARY_NOTE_MAX_CHARACTERS.toLocaleString()} characters`}
              />
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
                    {saveStatus === 'Saving...'
                      ? 'Saving notes...'
                      : saveStatus === 'Could not save'
                        ? 'Could not save notes'
                        : 'Notes saved automatically'}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.notesCharacterCount,
                    isSummaryNoteNearLimit && styles.notesCharacterCountWarning,
                  ]}
                  accessibilityLiveRegion="polite"
                  accessibilityLabel={`${summaryNoteCharacterCount.toLocaleString()} of ${EXPENSE_SUMMARY_NOTE_MAX_CHARACTERS.toLocaleString()} summary note characters used`}
                >
                  {summaryNoteCharacterCount.toLocaleString()} /{' '}
                  {EXPENSE_SUMMARY_NOTE_MAX_CHARACTERS.toLocaleString()}
                </Text>
              </View>
              <Text
                style={[
                  styles.notesLimitMessage,
                  isSummaryNoteNearLimit && styles.notesCharacterCountWarning,
                ]}
              >
                {summaryNoteCharacterCount >= EXPENSE_SUMMARY_NOTE_MAX_CHARACTERS
                  ? 'Summary note character limit reached'
                  : isSummaryNoteNearLimit
                    ? `${(EXPENSE_SUMMARY_NOTE_MAX_CHARACTERS - summaryNoteCharacterCount).toLocaleString()} characters remaining`
                    : `Maximum ${EXPENSE_SUMMARY_NOTE_MAX_CHARACTERS.toLocaleString()} characters`}
              </Text>
              <Text style={styles.footerHint}>
                Use keywords to calculate, or type an amount directly.
              </Text>
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
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

              <Text style={styles.inputLabel}>Match remarks (optional)</Text>
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
              <Text style={styles.helper}>Leave empty to enter the amount yourself.</Text>

              <Pressable
                style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}
                onPress={calculate}
                accessibilityRole="button"
                accessibilityLabel="Calculate category amount from table"
              >
                <Ionicons name="search-outline" size={19} color={colors.primary} />
                <Text style={styles.outlineButtonText}>Calculate from table</Text>
              </Pressable>

              <Text style={styles.inputLabel}>Amount (RM)</Text>
              <TextInput
                style={styles.formInput}
                value={amount}
                onChangeText={(value) => setAmount(sanitizeExpenseAmountInput(value))}
                onBlur={() => setAmount(normalizeExpenseAmountInput(amount))}
                placeholder="0.00"
                placeholderTextColor={colors.textTertiary}
                inputMode="decimal"
                keyboardType="decimal-pad"
                accessibilityLabel="Saved category amount in ringgit"
              />
              {calculation && (
                <Text style={styles.helper}>
                  Calculated from {calculation.matchCount} matching {calculation.matchCount === 1 ? 'entry' : 'entries'} · You can edit this amount.
                </Text>
              )}

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

              {categories.length > 0 && (
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
  );
};

const makeStyles = (colors) =>
  StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.52)' },
    sheet: { maxHeight: '90%', backgroundColor: colors.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, ...shadow.card },
    handle: { width: 42, height: 4, borderRadius: radius.full, backgroundColor: colors.border, alignSelf: 'center', marginTop: 9 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 13, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
    eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 0.9 },
    title: { color: colors.text, fontSize: 21, fontWeight: '800', marginTop: 2 },
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
    notesStatus: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: -6 },
    notesSaveStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    notesStatusText: { color: colors.textTertiary, fontSize: 11 },
    notesCharacterCount: { color: colors.textTertiary, fontSize: 11, fontVariant: ['tabular-nums'] },
    notesCharacterCountWarning: { color: colors.danger, fontWeight: '700' },
    notesLimitMessage: { color: colors.textTertiary, fontSize: 11, lineHeight: 16, marginTop: -8, textAlign: 'right' },
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
    primaryButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.md, backgroundColor: colors.primary },
    primaryButtonText: { color: colors.card, fontSize: 15, fontWeight: '800' },
    disabled: { opacity: 0.55 },
    infoBanner: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.primarySoft },
    infoText: { flex: 1, color: colors.primary, fontSize: 13, fontWeight: '600' },
    textButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
    textButtonText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  });

export default ExpenseSummaryModal;
