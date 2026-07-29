import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { noteRepo } from '../db/noteRepo';
import {
  calculateExpenseTotal,
  createExpenseRow,
  expenseRowHasContent,
  formatExpenseAmount,
  isExpenseNoteEmpty,
  parseExpenseAmount,
  parseExpenseNote,
  sanitizeExpenseAmountInput,
  sanitizeExpenseDateInput,
  serializeExpenseNote,
} from '../utils/expense-record.mjs';
import { radius, shadow, useTheme } from '../theme';

const ExpenseRecordEditorScreen = ({ route, navigation }) => {
  const { noteId } = route.params;
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const initialRows = useMemo(() => [createExpenseRow()], []);

  const [title, setTitle] = useState('');
  const [rows, setRows] = useState(initialRows);
  const [hasPassword, setHasPassword] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [lockPassword, setLockPassword] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [focusedCell, setFocusedCell] = useState(null);

  const saveTimeout = useRef(null);
  const inputRefs = useRef({});
  const latest = useRef({
    title: '',
    rows: initialRows,
    hasPassword: false,
    isPinned: false,
    deleted: false,
  });

  const populatedRows = rows.filter(expenseRowHasContent);
  const total = calculateExpenseTotal(populatedRows);
  const invalidAmountCount = rows.filter(
    (row) => row.amount.trim() && parseExpenseAmount(row.amount) === null
  ).length;

  const loadRecord = useCallback(async () => {
    try {
      const note = await noteRepo.getById(noteId);
      if (!note) return;

      const parsed = parseExpenseNote(note.content);
      const loadedRows = parsed.rows.length ? parsed.rows : [createExpenseRow()];
      const legacyRemark = parsed.rows[0]?.remark.trim();
      const loadedTitle =
        parsed.sourceVersion === 1 && note.title.trim() === legacyRemark
          ? ''
          : note.title;

      setTitle(loadedTitle);
      setRows(loadedRows);
      setHasPassword(!!note.password);
      setIsPinned(!!note.is_pinned);
      latest.current = {
        ...latest.current,
        title: loadedTitle,
        rows: loadedRows,
        hasPassword: !!note.password,
        isPinned: !!note.is_pinned,
      };
    } catch {
      Alert.alert('Error', 'Failed to load expense record');
    }
  }, [noteId]);

  const scheduleSave = useCallback(
    (nextTitle, nextRows) => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      setSaveStatus('Saving...');

      saveTimeout.current = setTimeout(async () => {
        saveTimeout.current = null;
        try {
          await noteRepo.update(noteId, {
            title: nextTitle.trim(),
            content: serializeExpenseNote(nextRows),
          });
          setSaveStatus('Saved');
        } catch (error) {
          console.error('Expense auto-save failed:', error);
          setSaveStatus('Could not save');
        }
      }, 800);
    },
    [noteId]
  );

  const updateDraft = (nextTitle, nextRows) => {
    latest.current.title = nextTitle;
    latest.current.rows = nextRows;
    scheduleSave(nextTitle, nextRows);
  };

  const handleTitleChange = (value) => {
    setTitle(value);
    updateDraft(value, latest.current.rows);
  };

  const handleRowChange = (rowId, field, value) => {
    const nextRows = latest.current.rows.map((row) =>
      row.id === rowId ? { ...row, [field]: value } : row
    );
    setRows(nextRows);
    updateDraft(latest.current.title, nextRows);
  };

  const focusCell = (rowId, field) => {
    setTimeout(() => inputRefs.current[`${rowId}:${field}`]?.focus(), 40);
  };

  const addRow = (focus = true) => {
    const newRow = createExpenseRow();
    const nextRows = [...latest.current.rows, newRow];
    setRows(nextRows);
    updateDraft(latest.current.title, nextRows);
    if (focus) focusCell(newRow.id, 'date');
  };

  const removeRow = (rowId) => {
    const remainingRows = latest.current.rows.filter((row) => row.id !== rowId);
    const nextRows = remainingRows.length ? remainingRows : [createExpenseRow()];
    setRows(nextRows);
    updateDraft(latest.current.title, nextRows);
  };

  const focusNextRow = (rowIndex) => {
    const nextRow = rows[rowIndex + 1];
    if (nextRow) {
      focusCell(nextRow.id, 'date');
    } else {
      addRow(true);
    }
  };

  const handleSetPassword = async () => {
    if (!lockPassword.trim()) {
      Alert.alert('Error', 'Please enter a password');
      return;
    }

    try {
      await noteRepo.update(noteId, { password: lockPassword });
      setHasPassword(true);
      latest.current.hasPassword = true;
      setShowLockModal(false);
      setLockPassword('');
    } catch {
      Alert.alert('Error', 'Failed to set password');
    }
  };

  const handleRemovePassword = async () => {
    try {
      await noteRepo.update(noteId, { password: null });
      setHasPassword(false);
      latest.current.hasPassword = false;
      setShowLockModal(false);
      setLockPassword('');
    } catch {
      Alert.alert('Error', 'Failed to remove password');
    }
  };

  const handleTogglePin = async () => {
    const nextPinned = !isPinned;
    try {
      await noteRepo.update(noteId, { is_pinned: nextPinned });
      setIsPinned(nextPinned);
      latest.current.isPinned = nextPinned;
    } catch {
      Alert.alert('Error', 'Failed to update pin');
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Expense Record',
      'Are you sure you want to delete this expense record?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (saveTimeout.current) {
                clearTimeout(saveTimeout.current);
                saveTimeout.current = null;
              }
              latest.current.deleted = true;
              await noteRepo.softDelete(noteId);
              navigation.goBack();
            } catch {
              Alert.alert('Error', 'Failed to delete expense record');
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    loadRecord();
  }, [loadRecord]);

  useEffect(() => {
    return () => {
      const pending = saveTimeout.current;
      if (pending) {
        clearTimeout(pending);
        saveTimeout.current = null;
      }

      const draft = latest.current;
      if (draft.deleted) return;

      if (
        isExpenseNoteEmpty(draft.title, draft.rows) &&
        !draft.hasPassword &&
        !draft.isPinned
      ) {
        noteRepo.hardDelete(noteId).catch(() => {});
      } else if (pending) {
        noteRepo
          .update(noteId, {
            title: draft.title.trim(),
            content: serializeExpenseNote(draft.rows),
          })
          .catch(() => {});
      }
    };
  }, [noteId]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerButton}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.headerTitle}>
          <View style={styles.headerTitleIcon}>
            <Ionicons name="receipt-outline" size={16} color={colors.primary} />
          </View>
          <Text style={styles.headerTitleText} numberOfLines={1}>
            Expense Ledger
          </Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={handleTogglePin}
            style={[styles.headerButton, isPinned && styles.headerButtonActive]}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={isPinned ? 'Unpin expense note' : 'Pin expense note'}
          >
            <Ionicons
              name={isPinned ? 'pin' : 'pin-outline'}
              size={20}
              color={isPinned ? colors.primary : colors.textSecondary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowLockModal(true)}
            style={[styles.headerButton, hasPassword && styles.headerButtonActive]}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={
              hasPassword ? 'Manage expense note password' : 'Set expense note password'
            }
          >
            <Ionicons
              name={hasPassword ? 'lock-closed' : 'lock-open-outline'}
              size={20}
              color={hasPassword ? colors.folder : colors.textSecondary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleDelete}
            style={[styles.headerButton, styles.deleteHeaderButton]}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Delete expense note"
          >
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(32, insets.bottom + 20) },
        ]}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.editorContent}>
          <View style={styles.heroCard}>
            <View style={styles.heroTitleRow}>
              <View style={styles.heroIcon}>
                <Ionicons name="wallet-outline" size={24} color={colors.primary} />
              </View>
              <View style={styles.heroTitleText}>
                <Text style={styles.eyebrow}>EXPENSE LEDGER</Text>
                <TextInput
                  style={[
                    styles.titleInput,
                    focusedCell === 'title' && styles.titleInputFocused,
                  ]}
                  value={title}
                  onChangeText={handleTitleChange}
                  onFocus={() => setFocusedCell('title')}
                  onBlur={() => setFocusedCell(null)}
                  placeholder="Expense Jun 2026"
                  placeholderTextColor={colors.textTertiary}
                  returnKeyType="next"
                  onSubmitEditing={() => focusCell(rows[0].id, 'date')}
                  accessibilityLabel="Expense note title"
                />
              </View>
            </View>

            <View style={styles.heroStats}>
              <View style={styles.statBlock}>
                <View style={styles.statIcon}>
                  <Ionicons name="list-outline" size={17} color={colors.primary} />
                </View>
                <View>
                  <Text style={styles.statValue}>{populatedRows.length}</Text>
                  <Text style={styles.statLabel}>
                    {populatedRows.length === 1 ? 'Entry' : 'Entries'}
                  </Text>
                </View>
              </View>
              <View style={styles.totalBlock}>
                <Text style={styles.totalLabel}>RUNNING TOTAL</Text>
                <Text style={styles.totalText}>{formatExpenseAmount(total)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.sectionTitle}>Expense entries</Text>
              <Text style={styles.sectionHint}>Tap any cell to edit</Text>
            </View>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveBadgeText}>Auto total</Text>
            </View>
          </View>

          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={[styles.headerCell, styles.dateColumn]}>Date</Text>
              <Text style={[styles.headerCell, styles.remarkColumn]}>Remark</Text>
              <Text style={[styles.headerCell, styles.amountColumn]}>Amount</Text>
              <View style={styles.actionColumn} />
            </View>

            {rows.map((row, index) => {
              const invalidAmount =
                !!row.amount.trim() && parseExpenseAmount(row.amount) === null;

              return (
                <View
                  key={row.id}
                  style={[
                    styles.tableRow,
                    index % 2 === 0 ? styles.evenRow : styles.oddRow,
                    focusedCell?.startsWith(`${row.id}:`) && styles.focusedRow,
                  ]}
                >
                  <TextInput
                    ref={(ref) => {
                      inputRefs.current[`${row.id}:date`] = ref;
                    }}
                    style={[
                      styles.cellInput,
                      styles.dateColumn,
                      focusedCell === `${row.id}:date` && styles.focusedInput,
                    ]}
                    value={row.date}
                    onChangeText={(value) =>
                      handleRowChange(row.id, 'date', sanitizeExpenseDateInput(value))
                    }
                    placeholder="1"
                    placeholderTextColor={colors.textTertiary}
                    inputMode="numeric"
                    keyboardType="number-pad"
                    returnKeyType="next"
                    onFocus={() => setFocusedCell(`${row.id}:date`)}
                    onBlur={() => setFocusedCell(null)}
                    onSubmitEditing={() => focusCell(row.id, 'remark')}
                    selectTextOnFocus
                    accessibilityLabel={`Date for expense row ${index + 1}`}
                  />
                  <TextInput
                    ref={(ref) => {
                      inputRefs.current[`${row.id}:remark`] = ref;
                    }}
                    style={[
                      styles.cellInput,
                      styles.remarkColumn,
                      focusedCell === `${row.id}:remark` && styles.focusedInput,
                    ]}
                    value={row.remark}
                    onChangeText={(value) => handleRowChange(row.id, 'remark', value)}
                    placeholder="Enter remark"
                    placeholderTextColor={colors.textTertiary}
                    returnKeyType="next"
                    onFocus={() => setFocusedCell(`${row.id}:remark`)}
                    onBlur={() => setFocusedCell(null)}
                    onSubmitEditing={() => focusCell(row.id, 'amount')}
                    accessibilityLabel={`Remark for expense row ${index + 1}`}
                  />
                  <TextInput
                    ref={(ref) => {
                      inputRefs.current[`${row.id}:amount`] = ref;
                    }}
                    style={[
                      styles.cellInput,
                      styles.amountColumn,
                      invalidAmount && styles.invalidCell,
                      focusedCell === `${row.id}:amount` && styles.focusedInput,
                    ]}
                    value={row.amount}
                    onChangeText={(value) =>
                      handleRowChange(
                        row.id,
                        'amount',
                        sanitizeExpenseAmountInput(value)
                      )
                    }
                    placeholder="0.00"
                    placeholderTextColor={colors.textTertiary}
                    inputMode="decimal"
                    keyboardType="decimal-pad"
                    returnKeyType="next"
                    onFocus={() => setFocusedCell(`${row.id}:amount`)}
                    onBlur={() => setFocusedCell(null)}
                    onSubmitEditing={() => focusNextRow(index)}
                    selectTextOnFocus
                    accessibilityLabel={`Amount for expense row ${index + 1}`}
                  />
                  <TouchableOpacity
                    style={styles.actionColumn}
                    onPress={() => removeRow(row.id)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete expense row ${index + 1}`}
                  >
                    <View style={styles.removeRowIcon}>
                      <Ionicons name="close" size={16} color={colors.danger} />
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })}

            <TouchableOpacity
              style={styles.addRowButton}
              onPress={() => addRow(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Add expense row"
            >
              <View style={styles.addRowIcon}>
                <Ionicons name="add" size={17} color={colors.card} />
              </View>
              <Text style={styles.addRowText}>Add row</Text>
              <Text style={styles.addRowHint}>or press Enter after an amount</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.statusRow}>
            <View style={styles.saveStatus}>
              <Ionicons
                name={
                  saveStatus === 'Could not save'
                    ? 'alert-circle-outline'
                    : 'cloud-done-outline'
                }
                size={15}
                color={saveStatus === 'Could not save' ? colors.danger : colors.textTertiary}
              />
              <Text
                style={[
                  styles.saveStatusText,
                  saveStatus === 'Could not save' && { color: colors.danger },
                ]}
              >
                {saveStatus || 'Changes save automatically'}
              </Text>
            </View>
            {invalidAmountCount > 0 && (
              <Text style={styles.validationText}>
                Check {invalidAmountCount} amount
              </Text>
            )}
          </View>
        </View>
      </ScrollView>

      <Modal visible={showLockModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconCircle}>
              <Ionicons
                name={hasPassword ? 'lock-closed' : 'lock-open-outline'}
                size={26}
                color={colors.primary}
              />
            </View>
            <Text style={styles.modalTitle}>
              {hasPassword ? 'Password Protection' : 'Set Password'}
            </Text>
            {hasPassword ? (
              <Text style={styles.modalDescription}>
                This expense note is password protected.
              </Text>
            ) : (
              <TextInput
                style={styles.modalInput}
                placeholder="Enter password"
                placeholderTextColor={colors.textTertiary}
                value={lockPassword}
                onChangeText={setLockPassword}
                secureTextEntry
                autoFocus
              />
            )}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                activeOpacity={0.7}
                onPress={() => {
                  setShowLockModal(false);
                  setLockPassword('');
                }}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              {hasPassword ? (
                <TouchableOpacity
                  style={[styles.modalButton, styles.removeButton]}
                  activeOpacity={0.7}
                  onPress={handleRemovePassword}
                >
                  <Text style={[styles.modalButtonText, styles.removeButtonText]}>
                    Remove Lock
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.modalButton, styles.setButton]}
                  activeOpacity={0.7}
                  onPress={handleSetPassword}
                >
                  <Text style={[styles.modalButtonText, styles.setButtonText]}>
                    Set Lock
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const makeStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerButton: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerButtonActive: {
      backgroundColor: colors.folderSoft,
    },
    headerTitle: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    headerTitleIcon: {
      width: 30,
      height: 30,
      borderRadius: radius.sm,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleText: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '700',
    },
    headerActions: {
      flexDirection: 'row',
      gap: 6,
    },
    deleteHeaderButton: {
      backgroundColor: colors.dangerSoft,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      padding: 16,
      alignItems: 'center',
    },
    editorContent: {
      width: '100%',
      maxWidth: 920,
      gap: 16,
    },
    heroCard: {
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: radius.lg,
      padding: 18,
      gap: 18,
      overflow: 'hidden',
    },
    heroTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    heroIcon: {
      width: 50,
      height: 50,
      borderRadius: radius.md,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadow.card,
    },
    heroTitleText: {
      flex: 1,
    },
    eyebrow: {
      color: colors.primary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.4,
    },
    titleInput: {
      color: colors.text,
      fontSize: 25,
      fontWeight: '800',
      paddingHorizontal: 0,
      paddingTop: 3,
      paddingBottom: 5,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    titleInputFocused: {
      borderBottomColor: colors.primary,
    },
    heroStats: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 14,
    },
    statBlock: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    statIcon: {
      width: 34,
      height: 34,
      borderRadius: radius.sm,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statValue: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },
    statLabel: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: '600',
    },
    totalBlock: {
      alignItems: 'flex-end',
      backgroundColor: colors.card,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: 9,
      minWidth: 118,
    },
    totalLabel: {
      color: colors.textTertiary,
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.8,
    },
    totalText: {
      color: colors.primary,
      fontSize: 20,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },
    sectionHeading: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 2,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '800',
    },
    sectionHint: {
      color: colors.textTertiary,
      fontSize: 11,
      marginTop: 2,
    },
    liveBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.primarySoft,
      borderRadius: radius.full,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    liveDot: {
      width: 6,
      height: 6,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
    },
    liveBadgeText: {
      color: colors.primary,
      fontSize: 10,
      fontWeight: '800',
    },
    table: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      overflow: 'hidden',
      ...shadow.card,
    },
    tableRow: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'stretch',
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    tableHeader: {
      minHeight: 46,
      backgroundColor: colors.primary,
    },
    evenRow: {
      backgroundColor: colors.inputBg,
    },
    oddRow: {
      backgroundColor: colors.card,
    },
    headerCell: {
      color: colors.card,
      fontSize: 14,
      fontWeight: '800',
      paddingHorizontal: 10,
      paddingVertical: 13,
      borderRightWidth: 1,
      borderRightColor: 'rgba(255,255,255,0.18)',
    },
    cellInput: {
      color: colors.text,
      fontSize: 15,
      paddingHorizontal: 10,
      paddingVertical: 11,
      borderRightWidth: 1,
      borderRightColor: colors.border,
      outlineStyle: 'none',
    },
    focusedRow: {
      backgroundColor: colors.primarySoft,
    },
    focusedInput: {
      backgroundColor: colors.card,
      color: colors.text,
    },
    dateColumn: {
      width: 78,
    },
    remarkColumn: {
      flex: 1,
      minWidth: 100,
    },
    amountColumn: {
      width: 105,
      fontVariant: ['tabular-nums'],
    },
    actionColumn: {
      width: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    removeRowIcon: {
      width: 28,
      height: 28,
      borderRadius: radius.full,
      backgroundColor: colors.dangerSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    invalidCell: {
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
    },
    addRowButton: {
      minHeight: 54,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      backgroundColor: colors.primarySoft,
    },
    addRowIcon: {
      width: 26,
      height: 26,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addRowText: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '800',
    },
    addRowHint: {
      color: colors.textTertiary,
      fontSize: 10,
    },
    statusRow: {
      minHeight: 24,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: 2,
    },
    saveStatus: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.card,
      borderRadius: radius.full,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    saveStatusText: {
      color: colors.textTertiary,
      fontSize: 12,
    },
    validationText: {
      color: colors.danger,
      fontSize: 12,
      fontWeight: '600',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15,23,42,0.45)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    modalContent: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      padding: 24,
      width: '100%',
      maxWidth: 400,
      alignItems: 'center',
      ...shadow.card,
    },
    modalIconCircle: {
      width: 56,
      height: 56,
      borderRadius: radius.full,
      backgroundColor: colors.primarySoft,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 14,
    },
    modalTitle: {
      fontSize: 19,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    modalDescription: {
      fontSize: 15,
      color: colors.textSecondary,
      marginBottom: 20,
      textAlign: 'center',
    },
    modalInput: {
      backgroundColor: colors.inputBg,
      borderRadius: radius.md,
      padding: 14,
      marginBottom: 16,
      fontSize: 16,
      color: colors.text,
      alignSelf: 'stretch',
    },
    modalButtons: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 8,
      alignSelf: 'stretch',
    },
    modalButton: {
      flex: 1,
      padding: 14,
      borderRadius: radius.md,
      alignItems: 'center',
    },
    cancelButton: {
      backgroundColor: colors.inputBg,
    },
    setButton: {
      backgroundColor: colors.primary,
    },
    removeButton: {
      backgroundColor: colors.dangerSoft,
    },
    modalButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    setButtonText: {
      color: colors.card,
    },
    removeButtonText: {
      color: colors.danger,
    },
  });

export default ExpenseRecordEditorScreen;
