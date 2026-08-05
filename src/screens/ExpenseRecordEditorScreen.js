import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { noteRepo } from '../db/noteRepo';
import NoteExportModal from '../components/NoteExportModal';
import ExpenseSummaryModal from '../components/ExpenseSummaryModal';
import {
  calculateCategorizedTotal,
  calculateExpenseTotal,
  createExpenseRow,
  formatExpenseAmount,
  isExpenseNoteEmpty,
  moveExpenseRow,
  normalizeExpenseAmountInput,
  parseExpenseAmount,
  parseExpenseNote,
  removeExpenseCategory,
  sanitizeExpenseAmountInput,
  sanitizeExpenseDateInput,
  serializeExpenseNote,
  shouldShowExpenseRowPlaceholder,
  upsertExpenseCategory,
} from '../utils/expense-record.mjs';
import { radius, shadow, useTheme } from '../theme';

const ExpenseRecordEditorScreen = ({ route, navigation }) => {
  const { noteId } = route.params;
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const initialRows = useMemo(() => [createExpenseRow()], []);

  const [title, setTitle] = useState('');
  const [rows, setRows] = useState(initialRows);
  const [categories, setCategories] = useState([]);
  const [summaryNote, setSummaryNote] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [lockPassword, setLockPassword] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [focusedCell, setFocusedCell] = useState(null);
  const [draggingRowId, setDraggingRowId] = useState(null);
  const [isDraggingRow, setIsDraggingRow] = useState(false);
  const [dragPreview, setDragPreview] = useState(null);
  const [isOverDeleteTarget, setIsOverDeleteTarget] = useState(false);

  const saveTimeout = useRef(null);
  const inputRefs = useRef({});
  const latest = useRef({
    title: '',
    rows: initialRows,
    categories: [],
    summaryNote: '',
    hasPassword: false,
    isPinned: false,
    deleted: false,
  });

  const total = calculateExpenseTotal(rows);
  const invalidAmountCount = rows.filter(
    (row) => row.amount.trim() && parseExpenseAmount(row.amount) === null
  ).length;

  const loadRecord = useCallback(async () => {
    try {
      const note = await noteRepo.getById(noteId);
      if (!note) return;

      const parsed = parseExpenseNote(note.content);
      const loadedRows = (
        parsed.rows.length ? parsed.rows : [createExpenseRow()]
      ).map((row) => ({
        ...row,
        amount: normalizeExpenseAmountInput(row.amount),
      }));
      const legacyRemark = parsed.rows[0]?.remark.trim();
      const loadedTitle =
        parsed.sourceVersion === 1 && note.title.trim() === legacyRemark
          ? ''
          : note.title;

      setTitle(loadedTitle);
      setRows(loadedRows);
      setCategories(parsed.categories);
      setSummaryNote(parsed.summaryNote);
      setHasPassword(!!note.password);
      setIsPinned(!!note.is_pinned);
      latest.current = {
        ...latest.current,
        title: loadedTitle,
        rows: loadedRows,
        categories: parsed.categories,
        summaryNote: parsed.summaryNote,
        hasPassword: !!note.password,
        isPinned: !!note.is_pinned,
      };
    } catch {
      Alert.alert('Error', 'Failed to load expense record');
    }
  }, [noteId]);

  const scheduleSave = useCallback(
    (
      nextTitle,
      nextRows,
      nextCategories = latest.current.categories,
      nextSummaryNote = latest.current.summaryNote
    ) => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      setSaveStatus('Saving...');

      saveTimeout.current = setTimeout(async () => {
        saveTimeout.current = null;
        try {
          await noteRepo.update(noteId, {
            title: nextTitle.trim(),
            content: serializeExpenseNote(
              nextRows,
              nextCategories,
              nextSummaryNote
            ),
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
    scheduleSave(
      nextTitle,
      nextRows,
      latest.current.categories,
      latest.current.summaryNote
    );
  };

  const persistCategories = async (nextCategories) => {
    const previousCategories = latest.current.categories;
    if (saveTimeout.current) {
      clearTimeout(saveTimeout.current);
      saveTimeout.current = null;
    }
    latest.current.categories = nextCategories;
    setCategories(nextCategories);
    setSaveStatus('Saving...');
    try {
      await noteRepo.update(noteId, {
        title: latest.current.title.trim(),
        content: serializeExpenseNote(
          latest.current.rows,
          nextCategories,
          latest.current.summaryNote
        ),
      });
      setSaveStatus('Saved');
    } catch (error) {
      latest.current.categories = previousCategories;
      setCategories(previousCategories);
      console.error('Expense category save failed:', error);
      setSaveStatus('Could not save');
      scheduleSave(
        latest.current.title,
        latest.current.rows,
        previousCategories,
        latest.current.summaryNote
      );
      throw error;
    }
  };

  const handleSaveCategory = async (result) => {
    const nextCategories = upsertExpenseCategory(latest.current.categories, result);
    await persistCategories(nextCategories);
  };

  const handleDeleteCategory = async (categoryId) => {
    const nextCategories = removeExpenseCategory(latest.current.categories, categoryId);
    try {
      await persistCategories(nextCategories);
    } catch {
      Alert.alert('Error', 'Failed to delete the saved category.');
    }
  };

  const handleSummaryNoteChange = (value) => {
    setSummaryNote(value);
    latest.current.summaryNote = value;
    scheduleSave(
      latest.current.title,
      latest.current.rows,
      latest.current.categories,
      value
    );
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

  const confirmRemoveRow = (rowId) => {
    const currentRows = latest.current.rows;
    const rowIndex = currentRows.findIndex((row) => row.id === rowId);
    if (rowIndex < 0) return;

    const row = currentRows[rowIndex];
    const amount = parseExpenseAmount(row.amount);
    Alert.alert(
      `Delete expense row ${rowIndex + 1}?`,
      [
        `Date: ${row.date.trim() || 'Not entered'}`,
        `Remark: ${row.remark.trim() || 'Not entered'}`,
        `Amount: ${amount === null ? row.amount.trim() || 'Not entered' : `RM ${formatExpenseAmount(amount)}`}`,
        '',
        'This row will be removed from the expense note.',
      ].join('\n'),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete row',
          style: 'destructive',
          onPress: () => removeRow(rowId),
        },
      ]
    );
  };

  const moveRow = (rowId, direction) => {
    const nextRows = moveExpenseRow(latest.current.rows, rowId, direction);
    if (nextRows === latest.current.rows) return;

    setRows(nextRows);
    updateDraft(latest.current.title, nextRows);
  };

  const reorderRow = (rowId, targetIndex) => {
    const currentRows = latest.current.rows;
    const currentIndex = currentRows.findIndex((row) => row.id === rowId);
    const boundedIndex = Math.max(0, Math.min(targetIndex, currentRows.length - 1));
    if (currentIndex < 0 || currentIndex === boundedIndex) return;

    const nextRows = [...currentRows];
    const [movedRow] = nextRows.splice(currentIndex, 1);
    nextRows.splice(boundedIndex, 0, movedRow);
    setRows(nextRows);
    updateDraft(latest.current.title, nextRows);
  };

  const createRowDragResponder = (rowId, startIndex) => {
    let longPressTimeout = null;
    let longPressTriggered = false;
    let overDeleteTarget = false;
    const rowsBeforeDrag = latest.current.rows;

    const cancelLongPress = () => {
      if (!longPressTimeout) return;
      clearTimeout(longPressTimeout);
      longPressTimeout = null;
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dy) > 4,
      onPanResponderGrant: () => {
        Keyboard.dismiss();
        setDraggingRowId(rowId);
        longPressTimeout = setTimeout(() => {
          longPressTimeout = null;
          longPressTriggered = true;
          setDraggingRowId(null);
          confirmRemoveRow(rowId);
        }, 650);
      },
      onPanResponderMove: (_, gestureState) => {
        if (longPressTriggered) return;
        if (Math.abs(gestureState.dy) <= 4) return;
        cancelLongPress();
        setIsDraggingRow(true);
        const currentRow = latest.current.rows.find((row) => row.id === rowId);
        const deleteTargetTop = windowHeight - Math.max(96, insets.bottom + 88);
        overDeleteTarget =
          Math.abs(gestureState.moveX - windowWidth / 2) <= 76 &&
          gestureState.moveY >= deleteTargetTop;
        setIsOverDeleteTarget(overDeleteTarget);
        setDragPreview({
          row: currentRow,
          x: gestureState.moveX,
          y: gestureState.moveY,
        });

        if (!overDeleteTarget) {
          const rowOffset = Math.round(gestureState.dy / 48);
          reorderRow(rowId, startIndex + rowOffset);
        }
      },
      onPanResponderRelease: () => {
        cancelLongPress();
        setDraggingRowId(null);
        setIsDraggingRow(false);
        setDragPreview(null);
        setIsOverDeleteTarget(false);
        if (overDeleteTarget) {
          setRows(rowsBeforeDrag);
          updateDraft(latest.current.title, rowsBeforeDrag);
          confirmRemoveRow(rowId);
        }
      },
      onPanResponderTerminate: () => {
        cancelLongPress();
        setDraggingRowId(null);
        setIsDraggingRow(false);
        setDragPreview(null);
        setIsOverDeleteTarget(false);
      },
      onPanResponderTerminationRequest: () => false,
    });
  };

  const focusNextRow = (rowIndex) => {
    const nextRow = rows[rowIndex + 1];
    if (nextRow) {
      focusCell(nextRow.id, 'date');
    } else {
      addRow(true);
    }
  };

  const handleAmountBlur = (row) => {
    setFocusedCell(null);
    const normalizedAmount = normalizeExpenseAmountInput(row.amount);
    if (normalizedAmount !== row.amount) {
      handleRowChange(row.id, 'amount', normalizedAmount);
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
        isExpenseNoteEmpty(
          draft.title,
          draft.rows,
          draft.categories,
          draft.summaryNote
        ) &&
        !draft.hasPassword &&
        !draft.isPinned
      ) {
        noteRepo.hardDelete(noteId).catch(() => {});
      } else if (pending) {
        noteRepo
          .update(noteId, {
            title: draft.title.trim(),
            content: serializeExpenseNote(
              draft.rows,
              draft.categories,
              draft.summaryNote
            ),
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

        <View
          style={[
            styles.headerTitleField,
            focusedCell === 'title' && styles.headerTitleFieldFocused,
          ]}
        >
          <Ionicons name="receipt-outline" size={18} color={colors.primary} />
          <TextInput
            style={styles.headerTitleInput}
            value={title}
            onChangeText={handleTitleChange}
            onFocus={() => setFocusedCell('title')}
            onBlur={() => setFocusedCell(null)}
            placeholder="Expense title"
            placeholderTextColor={colors.textTertiary}
            returnKeyType="next"
            onSubmitEditing={() => focusCell(rows[0].id, 'date')}
            accessibilityLabel="Expense note title"
            accessibilityHint="Edits the title of this expense note"
          />
        </View>

        <TouchableOpacity
          onPress={() => setShowActionsMenu(true)}
          style={styles.headerButton}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="More expense note actions"
          accessibilityHint="Shows pin, password, export, and delete actions"
          accessibilityState={{ expanded: showActionsMenu }}
        >
          <Ionicons name="ellipsis-vertical" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        scrollEnabled={!isDraggingRow}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(32, insets.bottom + 20) },
        ]}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.editorContent}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryIcon}>
              <Ionicons name="wallet-outline" size={22} color={colors.primary} />
            </View>
            <View style={styles.summaryContent}>
              <Text style={styles.totalLabel}>TOTAL</Text>
              <Text style={styles.totalText}>
                RM {formatExpenseAmount(total)}
              </Text>
            </View>
          </View>

          <View style={styles.summaryActionRow}>
            <View>
              <Text style={styles.summaryActionTitle}>Monthly categories</Text>
              <Text style={styles.summaryActionHint}>
                {categories.length
                  ? `${categories.length} saved · RM ${formatExpenseAmount(calculateCategorizedTotal(categories))}`
                  : 'Group matching expense remarks'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.summaryButton}
              onPress={() => setShowSummaryModal(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Open monthly expense summary"
            >
              <Ionicons name="bar-chart-outline" size={19} color={colors.primary} />
              <Text style={styles.summaryButtonText}>Summary</Text>
            </TouchableOpacity>
          </View>

          {/* <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.sectionTitle}>Expense entries</Text>
              <Text style={styles.sectionHint}>Tap any cell to edit</Text>
            </View>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveBadgeText}>Auto total</Text>
            </View>
          </View> */}

          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <View style={[styles.actionColumn, styles.actionHeaderColumn]} />
              <Text style={[styles.headerCell, styles.dateColumn]}>Day</Text>
              <Text style={[styles.headerCell, styles.remarkColumn]}>Remark</Text>
              <Text style={[styles.headerCell, styles.amountColumn]}>RM</Text>
            </View>

            {rows.map((row, index) => {
              const invalidAmount =
                !!row.amount.trim() && parseExpenseAmount(row.amount) === null;
              const showPlaceholder = shouldShowExpenseRowPlaceholder(rows, index);
              const dragResponder = createRowDragResponder(row.id, index);

              return (
                <View
                  key={row.id}
                  style={[
                    styles.tableRow,
                    index % 2 === 0 ? styles.evenRow : styles.oddRow,
                    focusedCell?.startsWith(`${row.id}:`) && styles.focusedRow,
                    draggingRowId === row.id && styles.draggingRow,
                  ]}
                >
                  <View
                    style={[styles.actionColumn, styles.rowActionColumn]}
                    {...dragResponder.panHandlers}
                    accessible
                    accessibilityRole="adjustable"
                    accessibilityLabel={`Reorder expense row ${index + 1}`}
                    accessibilityHint="Drag up or down to reorder. Long press to delete this row."
                    accessibilityActions={[
                      { name: 'increment', label: 'Move row down' },
                      { name: 'decrement', label: 'Move row up' },
                      { name: 'activate', label: 'Delete row' },
                    ]}
                    onAccessibilityAction={({ nativeEvent }) => {
                      if (nativeEvent.actionName === 'increment') moveRow(row.id, 'down');
                      if (nativeEvent.actionName === 'decrement') moveRow(row.id, 'up');
                      if (nativeEvent.actionName === 'activate') confirmRemoveRow(row.id);
                    }}
                  >
                    <View
                      style={[
                        styles.rowActionsIcon,
                        draggingRowId === row.id && styles.rowActionsIconDragging,
                      ]}
                    >
                      <FontAwesome5
                        name="grip-vertical"
                        size={16}
                        color={colors.textSecondary}
                      />
                    </View>
                  </View>
                  <View
                    style={[
                      styles.tableCellColumn,
                      styles.dateColumn,
                      focusedCell === `${row.id}:date` && styles.focusedInput,
                    ]}
                  >
                    <TextInput
                      ref={(ref) => {
                        inputRefs.current[`${row.id}:date`] = ref;
                      }}
                      style={[styles.cellInput, styles.singleLineCellInput]}
                      value={row.date}
                      onChangeText={(value) =>
                        handleRowChange(row.id, 'date', sanitizeExpenseDateInput(value))
                      }
                      placeholder={showPlaceholder ? '1' : undefined}
                      placeholderTextColor={colors.textTertiary}
                      inputMode="numeric"
                      keyboardType="number-pad"
                      multiline
                      numberOfLines={1}
                      scrollEnabled={false}
                      submitBehavior="submit"
                      returnKeyType="next"
                      onFocus={() => setFocusedCell(`${row.id}:date`)}
                      onBlur={() => setFocusedCell(null)}
                      onSubmitEditing={() => focusCell(row.id, 'remark')}
                      selectTextOnFocus
                      accessibilityLabel={`Day for expense row ${index + 1}`}
                    />
                  </View>
                  <View style={[styles.tableCellColumn, styles.remarkColumn]}>
                    <Text
                      style={styles.remarkMeasure}
                      numberOfLines={3}
                      accessible={false}
                      importantForAccessibility="no-hide-descendants"
                    >
                      {row.remark || (showPlaceholder ? 'Enter remark' : ' ')}
                    </Text>
                    <TextInput
                      ref={(ref) => {
                        inputRefs.current[`${row.id}:remark`] = ref;
                      }}
                      style={[
                        StyleSheet.absoluteFill,
                        styles.cellInput,
                        styles.remarkInput,
                        focusedCell === `${row.id}:remark` && styles.focusedInput,
                      ]}
                      value={row.remark}
                      onChangeText={(value) => handleRowChange(row.id, 'remark', value)}
                      placeholder={showPlaceholder ? 'Enter remark' : undefined}
                      placeholderTextColor={colors.textTertiary}
                      multiline
                      scrollEnabled={false}
                      returnKeyType="next"
                      onFocus={() => setFocusedCell(`${row.id}:remark`)}
                      onBlur={() => setFocusedCell(null)}
                      onSubmitEditing={() => focusCell(row.id, 'amount')}
                      accessibilityLabel={`Remark for expense row ${index + 1}`}
                    />
                  </View>
                  <View
                    style={[
                      styles.tableCellColumn,
                      styles.amountColumn,
                      invalidAmount && styles.invalidCell,
                      focusedCell === `${row.id}:amount` && styles.focusedInput,
                    ]}
                  >
                    <TextInput
                      ref={(ref) => {
                        inputRefs.current[`${row.id}:amount`] = ref;
                      }}
                      style={[
                        styles.cellInput,
                        styles.singleLineCellInput,
                        styles.amountInput,
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
                      placeholder={showPlaceholder ? '0.00' : undefined}
                      placeholderTextColor={colors.textTertiary}
                      inputMode="decimal"
                      keyboardType="decimal-pad"
                      multiline
                      numberOfLines={1}
                      scrollEnabled={false}
                      submitBehavior="submit"
                      returnKeyType="next"
                      onFocus={() => setFocusedCell(`${row.id}:amount`)}
                      onBlur={() => handleAmountBlur(row)}
                      onSubmitEditing={() => focusNextRow(index)}
                      selectTextOnFocus
                      accessibilityLabel={`Amount for expense row ${index + 1}`}
                    />
                  </View>
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

      {isDraggingRow && dragPreview?.row && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View
            style={[
              styles.dragPreview,
              isOverDeleteTarget && styles.dragPreviewDeleting,
              {
                width: Math.min(340, windowWidth - 32),
                left: Math.max(
                  16,
                  Math.min(
                    dragPreview.x - Math.min(340, windowWidth - 32) / 2,
                    windowWidth - Math.min(340, windowWidth - 32) - 16
                  )
                ),
                top: Math.max(insets.top + 8, dragPreview.y - 76),
              },
            ]}
          >
            <FontAwesome5
              name="grip-vertical"
              size={15}
              color={colors.textSecondary}
            />
            <Text style={styles.dragPreviewDate} numberOfLines={1}>
              {dragPreview.row.date.trim() || 'No date'}
            </Text>
            <Text style={styles.dragPreviewRemark} numberOfLines={1}>
              {dragPreview.row.remark.trim() || 'No remark'}
            </Text>
            <Text style={styles.dragPreviewAmount} numberOfLines={1}>
              {dragPreview.row.amount.trim()
                ? `RM ${dragPreview.row.amount.trim()}`
                : 'No amount'}
            </Text>
          </View>

          <View
            style={[
              styles.dragDeleteTarget,
              isOverDeleteTarget && styles.dragDeleteTargetActive,
              {
                left: windowWidth / 2 - 58,
                bottom: Math.max(16, insets.bottom + 8),
              },
            ]}
          >
            <Ionicons
              name={isOverDeleteTarget ? 'trash' : 'trash-outline'}
              size={25}
              color={isOverDeleteTarget ? colors.card : colors.danger}
            />
            <Text
              style={[
                styles.dragDeleteTargetText,
                isOverDeleteTarget && styles.dragDeleteTargetTextActive,
              ]}
            >
              Drop to delete
            </Text>
          </View>
        </View>
      )}

      <Modal
        visible={showActionsMenu}
        animationType="fade"
        transparent
        onRequestClose={() => setShowActionsMenu(false)}
      >
        <View style={styles.actionsMenuOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowActionsMenu(false)}
            accessible={false}
          />
          <View
            style={[styles.actionsMenu, { top: insets.top + 60 }]}
            accessibilityViewIsModal
          >
            <Pressable
              style={({ pressed }) => [
                styles.actionsMenuItem,
                pressed && styles.actionsMenuItemPressed,
              ]}
              onPress={() => {
                setShowActionsMenu(false);
                setShowExportModal(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Export expense note"
            >
              <Ionicons name="share-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.actionsMenuText}>Export PDF or image</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.actionsMenuItem,
                pressed && styles.actionsMenuItemPressed,
              ]}
              onPress={() => {
                setShowActionsMenu(false);
                handleTogglePin();
              }}
              accessibilityRole="button"
              accessibilityLabel={isPinned ? 'Unpin expense note' : 'Pin expense note'}
            >
              <Ionicons
                name={isPinned ? 'pin' : 'pin-outline'}
                size={20}
                color={isPinned ? colors.primary : colors.textSecondary}
              />
              <Text style={styles.actionsMenuText}>
                {isPinned ? 'Unpin note' : 'Pin note'}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.actionsMenuItem,
                pressed && styles.actionsMenuItemPressed,
              ]}
              onPress={() => {
                setShowActionsMenu(false);
                setShowLockModal(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={
                hasPassword
                  ? 'Manage expense note password'
                  : 'Set expense note password'
              }
            >
              <Ionicons
                name={hasPassword ? 'lock-closed' : 'lock-open-outline'}
                size={20}
                color={hasPassword ? colors.folder : colors.textSecondary}
              />
              <Text style={styles.actionsMenuText}>
                {hasPassword ? 'Password protection' : 'Lock note'}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.actionsMenuItem,
                styles.actionsMenuDeleteItem,
                pressed && styles.actionsMenuItemPressed,
              ]}
              onPress={() => {
                setShowActionsMenu(false);
                handleDelete();
              }}
              accessibilityRole="button"
              accessibilityLabel="Delete expense note"
            >
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
              <Text style={[styles.actionsMenuText, styles.actionsMenuDeleteText]}>
                Delete note
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <ExpenseSummaryModal
        visible={showSummaryModal}
        onClose={() => setShowSummaryModal(false)}
        rows={rows}
        categories={categories}
        summaryNote={summaryNote}
        saveStatus={saveStatus}
        onSave={handleSaveCategory}
        onDelete={handleDeleteCategory}
        onNoteChange={handleSummaryNoteChange}
      />

      <NoteExportModal
        visible={showExportModal}
        onClose={() => setShowExportModal(false)}
        title={title}
        rows={rows}
        total={total}
        categories={categories}
        summaryNote={summaryNote}
        type="expense"
      />

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
      width: 44,
      height: 44,
      borderRadius: radius.full,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitleField: {
      flex: 1,
      minWidth: 0,
      height: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 11,
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
    },
    headerTitleFieldFocused: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    headerTitleInput: {
      flex: 1,
      minWidth: 0,
      height: 42,
      paddingVertical: 0,
      color: colors.text,
      fontSize: 16,
      fontWeight: '700',
      outlineStyle: 'none',
    },
    actionsMenuOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15,23,42,0.12)',
    },
    actionsMenu: {
      position: 'absolute',
      right: 12,
      width: 244,
      overflow: 'hidden',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      ...shadow.card,
    },
    actionsMenuItem: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      backgroundColor: colors.card,
    },
    actionsMenuItemPressed: {
      backgroundColor: colors.inputBg,
    },
    actionsMenuDeleteItem: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    actionsMenuText: {
      flex: 1,
      fontSize: 16,
      color: colors.text,
    },
    actionsMenuDeleteText: {
      color: colors.danger,
      fontWeight: '600',
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
    summaryCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 12,
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: radius.lg,
      paddingHorizontal: 16,
      paddingVertical: 13,
    },
    summaryIcon: {
      width: 42,
      height: 42,
      borderRadius: radius.md,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    summaryContent: {
      alignItems: 'flex-end',
    },
    summaryActionRow: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: 2,
    },
    summaryActionTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '800',
    },
    summaryActionHint: {
      color: colors.textTertiary,
      fontSize: 11,
      marginTop: 2,
    },
    summaryButton: {
      minWidth: 116,
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: radius.md,
      backgroundColor: colors.card,
    },
    summaryButtonText: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '800',
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
      lineHeight: 20,
      fontWeight: '800',
      textAlignVertical: 'top',
      paddingHorizontal: 10,
      paddingVertical: 13,
      borderRightWidth: 1,
      borderRightColor: 'rgba(255,255,255,0.18)',
    },
    tableCellColumn: {
      borderRightWidth: 1,
      borderRightColor: colors.border,
    },
    cellInput: {
      color: colors.text,
      fontSize: 15,
      lineHeight: 20,
      textAlignVertical: 'top',
      paddingHorizontal: 10,
      paddingVertical: 11,
      outlineStyle: 'none',
    },
    singleLineCellInput: {
      height: 48,
      alignSelf: 'stretch',
    },
    focusedRow: {
      backgroundColor: colors.primarySoft,
    },
    draggingRow: {
      backgroundColor: colors.primarySoft,
      opacity: 0.9,
    },
    focusedInput: {
      backgroundColor: colors.card,
      color: colors.text,
    },
    dateColumn: {
      width: 60,
    },
    remarkColumn: {
      flex: 1,
      minWidth: 100,
    },
    remarkInput: {
      overflow: 'hidden',
    },
    remarkMeasure: {
      maxHeight: 82,
      color: 'transparent',
      fontSize: 15,
      lineHeight: 20,
      paddingHorizontal: 10,
      paddingVertical: 11,
    },
    amountColumn: {
      width: 76,
      textAlign: 'right',
    },
    amountInput: {
      textAlign: 'right',
      fontVariant: ['tabular-nums'],
    },
    actionColumn: {
      width: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRightWidth: 1,
      borderRightColor: colors.border,
    },
    actionHeaderColumn: {
      borderRightColor: 'rgba(255,255,255,0.18)',
    },
    rowActionColumn: {
      justifyContent: 'flex-start',
      paddingTop: 7,
    },
    rowActionsIcon: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowActionsIconDragging: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    dragPreview: {
      position: 'absolute',
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      backgroundColor: colors.card,
      borderWidth: 2,
      borderColor: colors.primary,
      borderRadius: radius.md,
      ...shadow.card,
    },
    dragPreviewDeleting: {
      borderColor: colors.danger,
      backgroundColor: colors.dangerSoft,
    },
    dragPreviewDate: {
      width: 54,
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '700',
    },
    dragPreviewRemark: {
      flex: 1,
      color: colors.text,
      fontSize: 14,
      fontWeight: '700',
    },
    dragPreviewAmount: {
      maxWidth: 92,
      color: colors.text,
      fontSize: 13,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },
    dragDeleteTarget: {
      position: 'absolute',
      width: 116,
      minHeight: 68,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      backgroundColor: colors.card,
      borderWidth: 2,
      borderColor: colors.danger,
      borderRadius: radius.lg,
      ...shadow.card,
    },
    dragDeleteTargetActive: {
      backgroundColor: colors.danger,
    },
    dragDeleteTargetText: {
      color: colors.danger,
      fontSize: 11,
      fontWeight: '800',
    },
    dragDeleteTargetTextActive: {
      color: colors.card,
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
