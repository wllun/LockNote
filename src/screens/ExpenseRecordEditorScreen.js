import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Gesture,
  GestureDetector,
  ScrollView,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
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
  moveExpenseRowToIndex,
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

const EXPENSE_ROW_MIN_HEIGHT = 48;
const EXPENSE_REMARK_MAX_HEIGHT = 82;
const DELETE_TARGET_HEIGHT = 88;
const DELETE_TARGET_HORIZONTAL_MARGIN = 24;
const DELETE_TARGET_TOLERANCE = 20;

const ExpenseRowDragHandle = ({
  rowId,
  rowIndex,
  colors,
  styles,
  dragX,
  dragY,
  dragAreaX,
  dragAreaY,
  onDragStart,
  onDragUpdate,
  onDragEnd,
  onDragCancel,
  onMove,
  onDelete,
}) => {
  const callbacks = useRef({
    onDragStart,
    onDragUpdate,
    onDragEnd,
    onDragCancel,
    onMove,
    onDelete,
  });
  callbacks.current = {
    onDragStart,
    onDragUpdate,
    onDragEnd,
    onDragCancel,
    onMove,
    onDelete,
  };

  const startDrag = useCallback(
    () => callbacks.current.onDragStart(rowId),
    [rowId]
  );
  const updateDrag = useCallback(
    (translationY, absoluteX, absoluteY) =>
      callbacks.current.onDragUpdate(
        rowId,
        translationY,
        absoluteX,
        absoluteY
      ),
    [rowId]
  );
  const endDrag = useCallback(
    (translationY, absoluteX, absoluteY) =>
      callbacks.current.onDragEnd(
        rowId,
        translationY,
        absoluteX,
        absoluteY
      ),
    [rowId]
  );
  const cancelDrag = useCallback(
    () => callbacks.current.onDragCancel(rowId),
    [rowId]
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(5)
        .shouldCancelWhenOutside(false)
        .runOnJS(true)
        .onStart((event) => {
          dragX.value = event.absoluteX - dragAreaX;
          dragY.value = event.absoluteY - dragAreaY;
          startDrag();
        })
        .onUpdate((event) => {
          dragX.value = event.absoluteX - dragAreaX;
          dragY.value = event.absoluteY - dragAreaY;
          updateDrag(
            event.translationY,
            event.absoluteX,
            event.absoluteY
          );
        })
        .onEnd((event) => {
          dragX.value = event.absoluteX - dragAreaX;
          dragY.value = event.absoluteY - dragAreaY;
          endDrag(
            event.translationY,
            event.absoluteX,
            event.absoluteY
          );
        })
        .onFinalize((_, success) => {
          if (!success) cancelDrag();
        }),
    [
      cancelDrag,
      dragAreaX,
      dragAreaY,
      dragX,
      dragY,
      endDrag,
      startDrag,
      updateDrag,
    ]
  );

  return (
    <GestureDetector gesture={panGesture}>
      <View
        collapsable={false}
        style={[styles.actionColumn, styles.rowDragHandle]}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`Move expense row ${rowIndex + 1}`}
        accessibilityHint="Drag to another row to move, or drag to the recycle bin to delete"
        accessibilityActions={[
          { name: 'increment', label: 'Move row down' },
          { name: 'decrement', label: 'Move row up' },
          { name: 'activate', label: 'Delete row' },
        ]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === 'increment') {
            callbacks.current.onMove(rowId, 'down');
          }
          if (nativeEvent.actionName === 'decrement') {
            callbacks.current.onMove(rowId, 'up');
          }
          if (nativeEvent.actionName === 'activate') {
            callbacks.current.onDelete(rowId);
          }
        }}
      >
        <Ionicons name="reorder-three-outline" size={25} color={colors.textSecondary} />
      </View>
    </GestureDetector>
  );
};

const ExpenseRecordEditorScreen = ({ route, navigation }) => {
  const { noteId } = route.params;
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
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
  const [remarkInputHeights, setRemarkInputHeights] = useState({});
  const [activeDrag, setActiveDrag] = useState(null);
  const [dragAreaBounds, setDragAreaBounds] = useState({
    x: 0,
    y: 0,
    width: windowWidth,
    height: 0,
  });

  const saveTimeout = useRef(null);
  const inputRefs = useRef({});
  const dragAreaRef = useRef(null);
  const dragAreaBoundsRef = useRef(dragAreaBounds);
  const rowLayouts = useRef({});
  const dragRowLayoutsRef = useRef({});
  const deleteTargetBoundsRef = useRef(null);
  const activeDragRef = useRef(null);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
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
  const deleteTargetBottom = Math.max(16, insets.bottom + 8);
  const dragPreviewWidth = Math.min(340, windowWidth - 32);
  const rowsWithoutDraggedRow = activeDrag
    ? rows.filter((row) => row.id !== activeDrag.rowId)
    : [];
  const insertionBeforeRowId = activeDrag
    ? rowsWithoutDraggedRow[activeDrag.targetIndex]?.id ?? null
    : null;
  const showEndInsertionGap =
    !!activeDrag && activeDrag.targetIndex >= rowsWithoutDraggedRow.length;
  const dragPreviewStyle = useAnimatedStyle(() => {
    const availableWidth = dragAreaBounds.width || windowWidth;
    const left = Math.max(
      16,
      Math.min(
        dragX.value - dragPreviewWidth / 2,
        availableWidth - dragPreviewWidth - 16
      )
    );
    const top = Math.max(insets.top + 8, dragY.value - 64);
    return {
      transform: [{ translateX: left }, { translateY: top }],
    };
  });

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

  const handleRemarkContentSizeChange = (rowId, contentHeight) => {
    const nextHeight = Math.max(
      EXPENSE_ROW_MIN_HEIGHT,
      Math.min(EXPENSE_REMARK_MAX_HEIGHT, Math.ceil(contentHeight))
    );
    setRemarkInputHeights((currentHeights) =>
      currentHeights[rowId] === nextHeight
        ? currentHeights
        : { ...currentHeights, [rowId]: nextHeight }
    );
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

  const storeDragAreaBounds = (x, y, width, height) => {
    const nextBounds = { x, y, width, height };
    dragAreaBoundsRef.current = nextBounds;
    setDragAreaBounds((currentBounds) =>
      currentBounds.x === x &&
      currentBounds.y === y &&
      currentBounds.width === width &&
      currentBounds.height === height
        ? currentBounds
        : nextBounds
    );
  };

  const measureDragArea = (event) => {
    const fallbackLayout = event?.nativeEvent?.layout;
    requestAnimationFrame(() => {
      const dragArea = dragAreaRef.current;
      if (typeof dragArea?.measureInWindow === 'function') {
        dragArea.measureInWindow(storeDragAreaBounds);
        return;
      }

      if (typeof dragArea?.getBoundingClientRect === 'function') {
        const bounds = dragArea.getBoundingClientRect();
        storeDragAreaBounds(bounds.left, bounds.top, bounds.width, bounds.height);
        return;
      }

      if (fallbackLayout) {
        storeDragAreaBounds(
          fallbackLayout.x ?? 0,
          fallbackLayout.y ?? 0,
          fallbackLayout.width,
          fallbackLayout.height
        );
      }
    });
  };

  const getDragTargetIndex = (rowId, translationY) => {
    const currentRows = latest.current.rows;
    const sourceIndex = currentRows.findIndex((row) => row.id === rowId);
    if (sourceIndex < 0) return 0;

    const dragLayouts = dragRowLayoutsRef.current;
    const sourceLayout = dragLayouts[rowId];
    if (!sourceLayout) {
      return Math.max(
        0,
        Math.min(
          currentRows.length - 1,
          sourceIndex + Math.round(translationY / EXPENSE_ROW_MIN_HEIGHT)
        )
      );
    }

    const projectedCenter =
      sourceLayout.y + sourceLayout.height / 2 + translationY;
    const remainingRows = currentRows.filter((row) => row.id !== rowId);
    for (let index = 0; index < remainingRows.length; index += 1) {
      const layout = dragLayouts[remainingRows[index].id];
      if (layout && projectedCenter < layout.y + layout.height / 2) {
        return index;
      }
    }
    return remainingRows.length;
  };

  const isPointOverDeleteTarget = (absoluteX, absoluteY) => {
    if (!Number.isFinite(absoluteX) || !Number.isFinite(absoluteY)) return false;

    const measuredTarget = deleteTargetBoundsRef.current;
    const dragBounds = dragAreaBoundsRef.current;
    if (!measuredTarget && (!dragBounds.width || !dragBounds.height)) return false;

    const target =
      measuredTarget ?? {
        left: dragBounds.x + DELETE_TARGET_HORIZONTAL_MARGIN,
        top:
          dragBounds.y +
          dragBounds.height -
          deleteTargetBottom -
          DELETE_TARGET_HEIGHT,
        width: Math.max(
          0,
          dragBounds.width - DELETE_TARGET_HORIZONTAL_MARGIN * 2
        ),
        height: DELETE_TARGET_HEIGHT,
      };
    return (
      absoluteX >= target.left - DELETE_TARGET_TOLERANCE &&
      absoluteX <= target.left + target.width + DELETE_TARGET_TOLERANCE &&
      absoluteY >= target.top - DELETE_TARGET_TOLERANCE &&
      absoluteY <= target.top + target.height + DELETE_TARGET_TOLERANCE
    );
  };

  const handleDeleteTargetLayout = ({ nativeEvent }) => {
    const dragBounds = dragAreaBoundsRef.current;
    const { x, y, width, height } = nativeEvent.layout;
    deleteTargetBoundsRef.current = {
      left: dragBounds.x + x,
      top: dragBounds.y + y,
      width,
      height,
    };
  };

  const handleDragStart = (rowId) => {
    Keyboard.dismiss();
    measureDragArea();
    const currentRows = latest.current.rows;
    const startIndex = currentRows.findIndex((row) => row.id === rowId);
    if (startIndex < 0) return;

    dragRowLayoutsRef.current = Object.fromEntries(
      currentRows.map((row) => [
        row.id,
        rowLayouts.current[row.id]
          ? { ...rowLayouts.current[row.id] }
          : null,
      ])
    );
    deleteTargetBoundsRef.current = null;

    const nextDrag = {
      rowId,
      row: currentRows[startIndex],
      startIndex,
      targetIndex: startIndex,
      overDelete: false,
    };
    activeDragRef.current = nextDrag;
    setActiveDrag(nextDrag);
  };

  const handleDragUpdate = (
    rowId,
    translationY,
    absoluteX,
    absoluteY
  ) => {
    const currentDrag = activeDragRef.current;
    if (!currentDrag || currentDrag.rowId !== rowId) return;

    const targetIndex = getDragTargetIndex(rowId, translationY);
    const overDelete = isPointOverDeleteTarget(absoluteX, absoluteY);
    if (
      currentDrag.targetIndex === targetIndex &&
      currentDrag.overDelete === overDelete
    ) {
      return;
    }

    const nextDrag = { ...currentDrag, targetIndex, overDelete };
    activeDragRef.current = nextDrag;
    setActiveDrag(nextDrag);
  };

  const handleDragEnd = (
    rowId,
    translationY,
    absoluteX,
    absoluteY
  ) => {
    const currentDrag = activeDragRef.current;
    if (!currentDrag || currentDrag.rowId !== rowId) return;

    const targetIndex = getDragTargetIndex(rowId, translationY);
    const shouldDelete =
      currentDrag.overDelete ||
      isPointOverDeleteTarget(absoluteX, absoluteY);
    activeDragRef.current = null;
    dragRowLayoutsRef.current = {};
    deleteTargetBoundsRef.current = null;
    setActiveDrag(null);

    if (shouldDelete) {
      removeRow(rowId);
      return;
    }

    const nextRows = moveExpenseRowToIndex(
      latest.current.rows,
      rowId,
      targetIndex
    );
    if (nextRows === latest.current.rows) return;
    setRows(nextRows);
    updateDraft(latest.current.title, nextRows);
  };

  const handleDragCancel = (rowId) => {
    if (activeDragRef.current?.rowId !== rowId) return;
    activeDragRef.current = null;
    dragRowLayoutsRef.current = {};
    deleteTargetBoundsRef.current = null;
    setActiveDrag(null);
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
      ref={dragAreaRef}
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      onLayout={measureDragArea}
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
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(32, insets.bottom + 20) },
        ]}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        scrollEnabled={!activeDrag}
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

              return (
                <React.Fragment key={row.id}>
                  {activeDrag && insertionBeforeRowId === row.id && (
                    <View style={styles.rowInsertionGap}>
                      <View style={styles.rowInsertionDot} />
                      <View style={styles.rowInsertionLine} />
                      <Text style={styles.rowInsertionText}>Row moves here</Text>
                    </View>
                  )}
                  <View
                    onLayout={({ nativeEvent }) => {
                      rowLayouts.current[row.id] = nativeEvent.layout;
                    }}
                    style={[
                      styles.tableRow,
                      index % 2 === 0 ? styles.evenRow : styles.oddRow,
                      focusedCell?.startsWith(`${row.id}:`) && styles.focusedRow,
                      activeDrag?.rowId === row.id && styles.draggingRow,
                    ]}
                  >
                    <ExpenseRowDragHandle
                      rowId={row.id}
                      rowIndex={index}
                      colors={colors}
                      styles={styles}
                      dragX={dragX}
                      dragY={dragY}
                      dragAreaX={dragAreaBounds.x}
                      dragAreaY={dragAreaBounds.y}
                      onDragStart={handleDragStart}
                      onDragUpdate={handleDragUpdate}
                      onDragEnd={handleDragEnd}
                      onDragCancel={handleDragCancel}
                      onMove={moveRow}
                      onDelete={confirmRemoveRow}
                    />
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
                    <TextInput
                      ref={(ref) => {
                        inputRefs.current[`${row.id}:remark`] = ref;
                      }}
                      style={[
                        styles.cellInput,
                        styles.remarkInput,
                        {
                          height:
                            remarkInputHeights[row.id] ?? EXPENSE_ROW_MIN_HEIGHT,
                        },
                        focusedCell === `${row.id}:remark` && styles.focusedInput,
                      ]}
                      value={row.remark}
                      onChangeText={(value) => handleRowChange(row.id, 'remark', value)}
                      placeholder={showPlaceholder ? 'Enter remark' : undefined}
                      placeholderTextColor={colors.textTertiary}
                      multiline
                      scrollEnabled={false}
                      onContentSizeChange={({ nativeEvent }) =>
                        handleRemarkContentSizeChange(
                          row.id,
                          nativeEvent.contentSize.height
                        )
                      }
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
                </React.Fragment>
              );
            })}

            {showEndInsertionGap && (
              <View style={styles.rowInsertionGap}>
                <View style={styles.rowInsertionDot} />
                <View style={styles.rowInsertionLine} />
                <Text style={styles.rowInsertionText}>Row moves here</Text>
              </View>
            )}

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

      {activeDrag && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Animated.View
            style={[
              styles.dragPreview,
              activeDrag.overDelete && styles.dragPreviewDeleting,
              { width: dragPreviewWidth },
              dragPreviewStyle,
            ]}
          >
            <Ionicons
              name="reorder-three-outline"
              size={24}
              color={activeDrag.overDelete ? colors.danger : colors.primary}
            />
            <View style={styles.dragPreviewContent}>
              <Text style={styles.dragPreviewRemark} numberOfLines={1}>
                {activeDrag.row.remark.trim() || 'Empty expense row'}
              </Text>
              <Text
                style={[
                  styles.dragPreviewDestination,
                  activeDrag.overDelete && styles.dragPreviewDestinationDeleting,
                ]}
              >
                {activeDrag.overDelete
                  ? 'Release to delete'
                  : `Move to row ${activeDrag.targetIndex + 1}`}
              </Text>
            </View>
            <Text style={styles.dragPreviewAmount} numberOfLines={1}>
              {activeDrag.row.amount.trim()
                ? `RM ${activeDrag.row.amount.trim()}`
                : 'No amount'}
            </Text>
          </Animated.View>

          <View
            onLayout={handleDeleteTargetLayout}
            style={[
              styles.dragDeleteTarget,
              activeDrag.overDelete && styles.dragDeleteTargetActive,
              { bottom: deleteTargetBottom },
            ]}
          >
            <View
              style={[
                styles.dragDeleteTargetIcon,
                activeDrag.overDelete && styles.dragDeleteTargetIconActive,
              ]}
            >
              <Ionicons
                name={activeDrag.overDelete ? 'trash' : 'trash-outline'}
                size={24}
                color={activeDrag.overDelete ? colors.danger : colors.card}
              />
            </View>
            <View style={styles.dragDeleteTargetCopy}>
              <Text
                style={[
                  styles.dragDeleteTargetText,
                  activeDrag.overDelete && styles.dragDeleteTargetTextActive,
                ]}
              >
                {activeDrag.overDelete
                  ? 'Release to delete'
                  : 'Drag here to delete'}
              </Text>
              <Text
                style={[
                  styles.dragDeleteTargetHint,
                  activeDrag.overDelete && styles.dragDeleteTargetHintActive,
                ]}
              >
                Large drop zone
              </Text>
            </View>
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
      minHeight: EXPENSE_ROW_MIN_HEIGHT,
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
      height: EXPENSE_ROW_MIN_HEIGHT,
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
      minHeight: EXPENSE_ROW_MIN_HEIGHT,
      maxHeight: EXPENSE_REMARK_MAX_HEIGHT,
      overflow: 'hidden',
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
    rowDragHandle: {
      minHeight: EXPENSE_ROW_MIN_HEIGHT,
      alignSelf: 'stretch',
      backgroundColor: 'transparent',
    },
    draggingRow: {
      backgroundColor: colors.primarySoft,
      opacity: 0.35,
    },
    rowInsertionGap: {
      height: 28,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 10,
      backgroundColor: colors.primarySoft,
    },
    rowInsertionDot: {
      width: 10,
      height: 10,
      borderWidth: 2,
      borderColor: colors.primary,
      borderRadius: radius.full,
      backgroundColor: colors.card,
    },
    rowInsertionLine: {
      flex: 1,
      height: 3,
      backgroundColor: colors.primary,
      borderRadius: radius.full,
    },
    rowInsertionText: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: '700',
    },
    dragPreview: {
      position: 'absolute',
      left: 0,
      top: 0,
      minHeight: 62,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.card,
      borderWidth: 2,
      borderColor: colors.primary,
      borderRadius: radius.md,
      ...shadow.card,
    },
    dragPreviewDeleting: {
      backgroundColor: colors.dangerSoft,
      borderColor: colors.danger,
    },
    dragPreviewContent: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    dragPreviewRemark: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '700',
    },
    dragPreviewDestination: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: '700',
    },
    dragPreviewDestinationDeleting: {
      color: colors.danger,
    },
    dragPreviewAmount: {
      maxWidth: 94,
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
      textAlign: 'right',
    },
    dragDeleteTarget: {
      position: 'absolute',
      left: DELETE_TARGET_HORIZONTAL_MARGIN,
      right: DELETE_TARGET_HORIZONTAL_MARGIN,
      height: DELETE_TARGET_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      paddingHorizontal: 20,
      backgroundColor: colors.dangerSoft,
      borderWidth: 3,
      borderColor: colors.danger,
      borderRadius: radius.lg,
      ...shadow.card,
    },
    dragDeleteTargetActive: {
      backgroundColor: colors.danger,
      borderColor: colors.card,
    },
    dragDeleteTargetIcon: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.full,
      backgroundColor: colors.danger,
    },
    dragDeleteTargetIconActive: {
      backgroundColor: colors.card,
    },
    dragDeleteTargetCopy: {
      gap: 2,
    },
    dragDeleteTargetText: {
      color: colors.danger,
      fontSize: 14,
      fontWeight: '800',
    },
    dragDeleteTargetTextActive: {
      color: colors.card,
    },
    dragDeleteTargetHint: {
      color: colors.danger,
      fontSize: 11,
      fontWeight: '600',
    },
    dragDeleteTargetHintActive: {
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
