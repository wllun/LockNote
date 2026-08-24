import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { AppAlert as Alert } from '../utils/app-alert';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import {
  Gesture,
  GestureDetector,
  ScrollView,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { noteRepo } from '../db/noteRepo';
import EditorUndoButton from '../components/editor-undo-button';
import NoteExportModal from '../components/NoteExportModal';
import NoteShareModal from '../components/NoteShareModal';
import CollaborationFooter from '../components/CollaborationFooter';
import { collaborationService } from '../services/collaborationService';
import PasswordModal from '../components/PasswordModal';
import ExpenseSummaryModal from '../components/ExpenseSummaryModal';
import DestructiveConfirmationModal from '../components/DestructiveConfirmationModal';
import KeyboardAwareModalContent from '../components/keyboard-aware-modal-content';
import { confirmDestructiveAction } from '../utils/confirm-action';
import { useEditorUndo } from '../utils/use-editor-undo';
import { useDragAutoScroll } from '../utils/use-drag-auto-scroll';
import { verifyPassword } from '../utils/crypto';
import { monthlyCommitmentTemplate } from '../utils/monthly-commitment-template';
import {
  EXPENSE_COMMITMENT_NAME_MAX_CHARACTERS,
  EXPENSE_REMARK_MAX_CHARACTERS,
} from '../utils/note-limits.mjs';
import {
  applyMonthlyCommitmentTemplate,
  calculateExpenseCategory,
  calculateExpenseGrandTotal,
  calculateMonthlyCommitmentTotals,
  createExpenseRow,
  createMonthlyCommitment,
  createMonthlyCommitmentTemplate,
  formatExpenseAmount,
  isExpenseNoteEmpty,
  isPointWithinDropTarget,
  moveExpenseRow,
  moveExpenseRowToIndex,
  moveMonthlyCommitment,
  moveMonthlyCommitmentToIndex,
  normalizeExpenseAmountInput,
  parseExpenseAmount,
  parseExpenseNote,
  recalculateExpenseCategories,
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
const DELETE_TARGET_SIZE = 56;
const DELETE_TARGET_TOLERANCE = 28;
const MONTHLY_COMMITMENT_MIN_HEIGHT = 68;
const DRAG_PREVIEW_MAX_WIDTH = 280;
const DRAG_PREVIEW_POINTER_OFFSET = 50;
const DRAG_ACTIVATION_DELAY_MS = 1000;

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
  itemLabel = 'expense row',
}) => {
  const [isHolding, setIsHolding] = useState(false);
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
  const beginHold = useCallback(() => setIsHolding(true), []);
  const endHold = useCallback(() => setIsHolding(false), []);
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(DRAG_ACTIVATION_DELAY_MS)
        .shouldCancelWhenOutside(false)
        .onBegin(() => {
          runOnJS(beginHold)();
        })
        .onStart((event) => {
          dragX.value = event.absoluteX - dragAreaX;
          dragY.value = event.absoluteY - dragAreaY;
          runOnJS(startDrag)();
        })
        .onUpdate((event) => {
          dragX.value = event.absoluteX - dragAreaX;
          dragY.value = event.absoluteY - dragAreaY;
          runOnJS(updateDrag)(
            event.translationY,
            event.absoluteX,
            event.absoluteY
          );
        })
        .onEnd((event) => {
          dragX.value = event.absoluteX - dragAreaX;
          dragY.value = event.absoluteY - dragAreaY;
          runOnJS(endDrag)(
            event.translationY,
            event.absoluteX,
            event.absoluteY
          );
        })
        .onFinalize((_, success) => {
          runOnJS(endHold)();
          if (!success) runOnJS(cancelDrag)();
        }),
    [
      beginHold,
      cancelDrag,
      dragAreaX,
      dragAreaY,
      dragX,
      dragY,
      endHold,
      endDrag,
      startDrag,
      updateDrag,
    ]
  );

  return (
    <GestureDetector gesture={panGesture}>
      <View
        collapsable={false}
        style={[
          styles.actionColumn,
          styles.rowDragHandle,
          isHolding && styles.rowDragHandleHolding,
        ]}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`Move ${itemLabel} ${rowIndex + 1}`}
        accessibilityHint="Hold still for one second, then drag to move or delete"
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
        <MaterialIcons
          name="drag-indicator"
          size={25}
          color={isHolding ? colors.primary : colors.textSecondary}
          style={styles.dragIndicatorIcon}
        />
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
  const [monthlyCommitments, setMonthlyCommitments] = useState([]);
  const [isCommitmentsExpanded, setIsCommitmentsExpanded] = useState(true);
  const [savedCommitmentTemplate, setSavedCommitmentTemplate] = useState([]);
  const [isSavingCommitmentTemplate, setIsSavingCommitmentTemplate] = useState(false);
  const [commitmentTemplateMessage, setCommitmentTemplateMessage] = useState('');
  const [commitmentDraft, setCommitmentDraft] = useState(null);
  const [hasPassword, setHasPassword] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showDeletePasswordModal, setShowDeletePasswordModal] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [lockPassword, setLockPassword] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [focusedCell, setFocusedCell] = useState(null);
  const [remarkInputHeights, setRemarkInputHeights] = useState({});
  const [activeDrag, setActiveDrag] = useState(null);
  const [pendingDeletion, setPendingDeletion] = useState(null);
  const [dragAreaBounds, setDragAreaBounds] = useState({
    x: 0,
    y: 0,
    width: windowWidth,
    height: 0,
  });

  const saveTimeout = useRef(null);
  const inputRefs = useRef({});
  const scrollRef = useRef(null);
  const dragAreaRef = useRef(null);
  const dragAreaBoundsRef = useRef(dragAreaBounds);
  const rowLayouts = useRef({});
  const commitmentLayouts = useRef({});
  const dragRowLayoutsRef = useRef({});
  const deleteTargetBoundsRef = useRef(null);
  const activeDragRef = useRef(null);
  const dragTranslationYRef = useRef(0);
  const dragAbsoluteXRef = useRef(0);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const latest = useRef({
    title: '',
    rows: initialRows,
    categories: [],
    summaryNote: '',
    monthlyCommitments: [],
    hasPassword: false,
    isPinned: false,
    cloudId: null,
    deleted: false,
  });
  const { canUndo, remember, takeUndo, clearUndo } = useEditorUndo();
  const getUndoSnapshot = useCallback(() => ({
    title: latest.current.title,
    rows: latest.current.rows,
    categories: latest.current.categories,
    summaryNote: latest.current.summaryNote,
    monthlyCommitments: latest.current.monthlyCommitments,
  }), []);

  const commitmentTotals = calculateMonthlyCommitmentTotals(monthlyCommitments);
  const total = calculateExpenseGrandTotal(rows, monthlyCommitments);
  const savedCommitmentTotals = calculateMonthlyCommitmentTotals(
    savedCommitmentTemplate
  );
  const currentCommitmentsMatchSavedTemplate =
    !!monthlyCommitments.length &&
    JSON.stringify(
      createMonthlyCommitmentTemplate(monthlyCommitments).commitments
    ) === JSON.stringify(savedCommitmentTemplate);
  const invalidAmountCount = rows.filter(
    (row) => row.amount.trim() && parseExpenseAmount(row.amount) === null
  ).length;
  const focusedRemarkRow = rows.find(
    (row) => focusedCell === `${row.id}:remark`
  );
  const focusedRemarkCharacterCount = focusedRemarkRow?.remark.length ?? 0;
  const isFocusedRemarkNearLimit =
    !!focusedRemarkRow &&
    focusedRemarkCharacterCount >= EXPENSE_REMARK_MAX_CHARACTERS * 0.9;
  const deleteTargetBottom = Math.max(16, insets.bottom + 8);
  const dragPreviewWidth = Math.min(
    DRAG_PREVIEW_MAX_WIDTH,
    Math.max(0, windowWidth - 64)
  );
  const rowsWithoutDraggedRow = activeDrag?.kind === 'expense'
    ? rows.filter((row) => row.id !== activeDrag.rowId)
    : [];
  const insertionBeforeRowId = activeDrag?.kind === 'expense'
    ? rowsWithoutDraggedRow[activeDrag.targetIndex]?.id ?? null
    : null;
  const showEndInsertionGap =
    activeDrag?.kind === 'expense' &&
    activeDrag.targetIndex >= rowsWithoutDraggedRow.length;
  const commitmentsWithoutDraggedItem = activeDrag?.kind === 'commitment'
    ? monthlyCommitments.filter((item) => item.id !== activeDrag.rowId)
    : [];
  const insertionBeforeCommitmentId = activeDrag?.kind === 'commitment'
    ? commitmentsWithoutDraggedItem[activeDrag.targetIndex]?.id ?? null
    : null;
  const showEndCommitmentGap =
    activeDrag?.kind === 'commitment' &&
    activeDrag.targetIndex >= commitmentsWithoutDraggedItem.length;
  const dragPreviewStyle = useAnimatedStyle(() => {
    const availableWidth = dragAreaBounds.width || windowWidth;
    const left = Math.max(
      16,
      Math.min(
        dragX.value - dragPreviewWidth / 2,
        availableWidth - dragPreviewWidth - 16
      )
    );
    const top = Math.max(
      insets.top + 8,
      dragY.value - DRAG_PREVIEW_POINTER_OFFSET
    );
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
      const loadedCategories = recalculateExpenseCategories(
        loadedRows,
        parsed.categories
      );
      setCategories(loadedCategories);
      setSummaryNote(parsed.summaryNote);
      setMonthlyCommitments(parsed.monthlyCommitments);
      setHasPassword(!!note.password);
      setIsPinned(!!note.is_pinned);
      latest.current = {
        ...latest.current,
        title: loadedTitle,
        rows: loadedRows,
        categories: loadedCategories,
        summaryNote: parsed.summaryNote,
        monthlyCommitments: parsed.monthlyCommitments,
        hasPassword: !!note.password,
        isPinned: !!note.is_pinned,
        cloudId: note.cloud_id,
      };
      clearUndo();
    } catch {
      Alert.alert('Error', 'Failed to load expense record');
    }
  }, [clearUndo, noteId]);

  const loadSavedCommitmentTemplate = useCallback(async () => {
    try {
      setSavedCommitmentTemplate(await monthlyCommitmentTemplate.load());
    } catch (error) {
      console.error('Monthly commitment template load failed:', error);
    }
  }, []);

  const scheduleSave = useCallback(
    (
      nextTitle,
      nextRows,
      nextCategories = latest.current.categories,
      nextSummaryNote = latest.current.summaryNote,
      nextMonthlyCommitments = latest.current.monthlyCommitments
    ) => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      setSaveStatus('Saving...');

      saveTimeout.current = setTimeout(async () => {
        saveTimeout.current = null;
        try {
          await collaborationService.save(noteId, {
            title: nextTitle.trim(),
            content: serializeExpenseNote(
              nextRows,
              nextCategories,
              nextSummaryNote,
              nextMonthlyCommitments
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

  const handleUndo = () => {
    const snapshot = takeUndo();
    if (!snapshot) return;

    setTitle(snapshot.title);
    setRows(snapshot.rows);
    setCategories(snapshot.categories);
    setSummaryNote(snapshot.summaryNote);
    setMonthlyCommitments(snapshot.monthlyCommitments);
    latest.current.title = snapshot.title;
    latest.current.rows = snapshot.rows;
    latest.current.categories = snapshot.categories;
    latest.current.summaryNote = snapshot.summaryNote;
    latest.current.monthlyCommitments = snapshot.monthlyCommitments;
    scheduleSave(
      snapshot.title,
      snapshot.rows,
      snapshot.categories,
      snapshot.summaryNote,
      snapshot.monthlyCommitments
    );
  };

  const updateDraft = (nextTitle, nextRows) => {
    const nextCategories = recalculateExpenseCategories(
      nextRows,
      latest.current.categories
    );
    latest.current.title = nextTitle;
    latest.current.rows = nextRows;
    latest.current.categories = nextCategories;
    setCategories(nextCategories);
    scheduleSave(
      nextTitle,
      nextRows,
      nextCategories,
      latest.current.summaryNote,
      latest.current.monthlyCommitments
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
      await collaborationService.save(noteId, {
        title: latest.current.title.trim(),
        content: serializeExpenseNote(
          latest.current.rows,
          nextCategories,
          latest.current.summaryNote,
          latest.current.monthlyCommitments
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
        latest.current.summaryNote,
        latest.current.monthlyCommitments
      );
      throw error;
    }
  };

  const handleSaveCategory = async (result) => {
    const previousSnapshot = getUndoSnapshot();
    const calculation = calculateExpenseCategory(
      latest.current.rows,
      result.keywords
    );
    const nextCategories = upsertExpenseCategory(latest.current.categories, {
      ...result,
      amount: calculation.amount,
      matchCount: calculation.matchCount,
    });
    await persistCategories(nextCategories);
    remember(previousSnapshot);
  };

  const handleDeleteCategory = async (categoryId) => {
    const previousSnapshot = getUndoSnapshot();
    const nextCategories = removeExpenseCategory(latest.current.categories, categoryId);
    try {
      await persistCategories(nextCategories);
      remember(previousSnapshot);
    } catch {
      Alert.alert('Error', 'Failed to delete the saved category.');
    }
  };

  const handleSummaryNoteChange = (value) => {
    remember(getUndoSnapshot(), 'summary-note');
    setSummaryNote(value);
    latest.current.summaryNote = value;
    scheduleSave(
      latest.current.title,
      latest.current.rows,
      latest.current.categories,
      value,
      latest.current.monthlyCommitments
    );
  };

  const updateMonthlyCommitments = (nextCommitments) => {
    remember(getUndoSnapshot());
    latest.current.monthlyCommitments = nextCommitments;
    setMonthlyCommitments(nextCommitments);
    scheduleSave(
      latest.current.title,
      latest.current.rows,
      latest.current.categories,
      latest.current.summaryNote,
      nextCommitments
    );
  };

  const openNewCommitment = () => {
    setCommitmentDraft(createMonthlyCommitment());
  };

  const openCommitment = (commitment) => {
    setCommitmentDraft({ ...commitment });
  };

  const handleCommitmentDraftChange = (field, value) => {
    setCommitmentDraft((current) =>
      current ? { ...current, [field]: value } : current
    );
  };

  const saveCommitment = () => {
    if (!commitmentDraft) return;
    const remark = commitmentDraft.remark.trim();
    const day = sanitizeExpenseDateInput(commitmentDraft.day).slice(0, 2);
    const amount = parseExpenseAmount(commitmentDraft.amount);
    if (!remark) {
      Alert.alert('Bill name required', 'Enter a name for this monthly bill.');
      return;
    }
    if (day && (Number(day) < 1 || Number(day) > 31)) {
      Alert.alert('Check due day', 'Due day must be between 1 and 31.');
      return;
    }
    if (amount === null) {
      Alert.alert('Check amount', 'Enter a valid monthly amount.');
      return;
    }

    const savedCommitment = {
      ...commitmentDraft,
      day,
      remark,
      amount: normalizeExpenseAmountInput(commitmentDraft.amount),
    };
    const exists = latest.current.monthlyCommitments.some(
      (item) => item.id === savedCommitment.id
    );
    updateMonthlyCommitments(
      exists
        ? latest.current.monthlyCommitments.map((item) =>
            item.id === savedCommitment.id ? savedCommitment : item
          )
        : [...latest.current.monthlyCommitments, savedCommitment]
    );
    setCommitmentDraft(null);
  };

  const toggleCommitmentPaid = (commitmentId) => {
    updateMonthlyCommitments(
      latest.current.monthlyCommitments.map((item) =>
        item.id === commitmentId ? { ...item, isPaid: !item.isPaid } : item
      )
    );
  };

  const resetCommitmentPaidStatus = () => {
    confirmDestructiveAction({
      title: 'Reset paid status?',
      confirmLabel: 'Reset',
      variant: 'warning',
      iconName: 'refresh-outline',
      details: [
        {
          label: 'Monthly bills',
          value: `${latest.current.monthlyCommitments.filter((item) => item.isPaid).length} of ${latest.current.monthlyCommitments.length} paid`,
          iconName: 'calendar-outline',
        },
      ],
      onConfirm: () =>
        updateMonthlyCommitments(
          latest.current.monthlyCommitments.map((item) => ({
            ...item,
            isPaid: false,
          }))
        ),
    });
  };

  const saveCommitmentsForNextNote = async () => {
    if (!latest.current.monthlyCommitments.length || isSavingCommitmentTemplate) {
      return;
    }

    setIsSavingCommitmentTemplate(true);
    setCommitmentTemplateMessage('');
    try {
      const saved = await monthlyCommitmentTemplate.save(
        latest.current.monthlyCommitments
      );
      setSavedCommitmentTemplate(saved);
      setCommitmentTemplateMessage(
        `Saved ${saved.length} ${saved.length === 1 ? 'bill' : 'bills'} for your next expense note.`
      );
    } catch (error) {
      console.error('Monthly commitment template save failed:', error);
      Alert.alert('Could not save bills', 'Please try saving the bill list again.');
    } finally {
      setIsSavingCommitmentTemplate(false);
    }
  };

  const applySavedCommitments = () => {
    const applied = applyMonthlyCommitmentTemplate({
      version: 1,
      commitments: savedCommitmentTemplate,
    });
    if (!applied.length) return;

    updateMonthlyCommitments(applied);
    setCommitmentTemplateMessage(
      `Applied ${applied.length} ${applied.length === 1 ? 'bill' : 'bills'} with all paid boxes cleared.`
    );
  };

  const removeCommitment = (commitmentId) => {
    updateMonthlyCommitments(
      latest.current.monthlyCommitments.filter((item) => item.id !== commitmentId)
    );
  };

  const confirmRemoveCommitment = (commitmentId) => {
    const item = latest.current.monthlyCommitments.find(
      (commitment) => commitment.id === commitmentId
    );
    if (!item) return;
    const amount = parseExpenseAmount(item.amount);
    setPendingDeletion({
      kind: 'commitment',
      itemId: commitmentId,
      title: 'Delete monthly bill?',
      description: 'Review the bill below before removing it from your checklist.',
      details: [
        {
          label: 'Bill',
          value: item.remark.trim() || 'Untitled bill',
          numberOfLines: 3,
        },
        {
          label: 'Due day',
          value: item.day.trim() ? `Day ${item.day.trim()}` : 'Not set',
        },
        {
          label: 'Amount',
          value:
            amount === null
              ? item.amount.trim() || 'Not entered'
              : `RM ${formatExpenseAmount(amount)}`,
        },
        {
          label: 'Status',
          value: item.isPaid ? 'Paid' : 'Not paid',
        },
      ],
      confirmLabel: 'Delete bill',
    });
  };

  const moveCommitment = (commitmentId, direction) => {
    const nextCommitments = moveMonthlyCommitment(
      latest.current.monthlyCommitments,
      commitmentId,
      direction
    );
    if (nextCommitments !== latest.current.monthlyCommitments) {
      updateMonthlyCommitments(nextCommitments);
    }
  };

  const handleTitleChange = (value) => {
    remember(getUndoSnapshot(), 'title');
    setTitle(value);
    updateDraft(value, latest.current.rows);
  };

  const handleRowChange = (rowId, field, value) => {
    remember(getUndoSnapshot(), `row:${rowId}:${field}`);
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
    remember(getUndoSnapshot());
    setRows(nextRows);
    updateDraft(latest.current.title, nextRows);
    if (focus) focusCell(newRow.id, 'date');
  };

  const removeRow = (rowId) => {
    const remainingRows = latest.current.rows.filter((row) => row.id !== rowId);
    const nextRows = remainingRows.length ? remainingRows : [createExpenseRow()];
    remember(getUndoSnapshot());
    setRows(nextRows);
    updateDraft(latest.current.title, nextRows);
  };

  const confirmRemoveRow = (rowId) => {
    const currentRows = latest.current.rows;
    const rowIndex = currentRows.findIndex((row) => row.id === rowId);
    if (rowIndex < 0) return;

    const row = currentRows[rowIndex];
    const amount = parseExpenseAmount(row.amount);
    setPendingDeletion({
      kind: 'row',
      itemId: rowId,
      title: `Delete expense row ${rowIndex + 1}?`,
      description: 'Review the details below before removing this row from the expense note.',
      details: [
        { label: 'Day', value: row.date.trim() || 'Not entered' },
        {
          label: 'Remark',
          value: row.remark.trim() || 'Not entered',
          numberOfLines: 3,
        },
        {
          label: 'Amount',
          value:
            amount === null
              ? row.amount.trim() || 'Not entered'
              : `RM ${formatExpenseAmount(amount)}`,
        },
      ],
      confirmLabel: 'Delete row',
    });
  };

  const handleConfirmDeletion = () => {
    const deletion = pendingDeletion;
    if (!deletion) return;

    setPendingDeletion(null);
    if (deletion.kind === 'commitment') {
      removeCommitment(deletion.itemId);
    } else {
      removeRow(deletion.itemId);
    }
  };

  const moveRow = (rowId, direction) => {
    const nextRows = moveExpenseRow(latest.current.rows, rowId, direction);
    if (nextRows === latest.current.rows) return;

    remember(getUndoSnapshot());
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

  const getDragTargetIndex = (rowId, translationY, kind = 'expense') => {
    const currentItems =
      kind === 'commitment'
        ? latest.current.monthlyCommitments
        : latest.current.rows;
    const sourceIndex = currentItems.findIndex((item) => item.id === rowId);
    if (sourceIndex < 0) return 0;

    const dragLayouts = dragRowLayoutsRef.current;
    const sourceLayout = dragLayouts[rowId];
    if (!sourceLayout) {
      return Math.max(
        0,
        Math.min(
          currentItems.length - 1,
          sourceIndex +
            Math.round(
              translationY /
                (kind === 'commitment'
                  ? MONTHLY_COMMITMENT_MIN_HEIGHT
                  : EXPENSE_ROW_MIN_HEIGHT)
            )
        )
      );
    }

    const projectedCenter =
      sourceLayout.y + sourceLayout.height / 2 + translationY;
    const remainingItems = currentItems.filter((item) => item.id !== rowId);
    for (let index = 0; index < remainingItems.length; index += 1) {
      const layout = dragLayouts[remainingItems[index].id];
      if (layout && projectedCenter < layout.y + layout.height / 2) {
        return index;
      }
    }
    return remainingItems.length;
  };

  const isPointOverDeleteTarget = (absoluteX, absoluteY) => {
    if (!Number.isFinite(absoluteX) || !Number.isFinite(absoluteY)) return false;

    const measuredTarget = deleteTargetBoundsRef.current;
    const dragBounds = dragAreaBoundsRef.current;
    if (!measuredTarget && (!dragBounds.width || !dragBounds.height)) return false;

    const target =
      measuredTarget ?? {
        left:
          dragBounds.x +
          Math.max(0, (dragBounds.width - DELETE_TARGET_SIZE) / 2),
        top:
          dragBounds.y +
          dragBounds.height -
          deleteTargetBottom -
          DELETE_TARGET_SIZE,
        width: DELETE_TARGET_SIZE,
        height: DELETE_TARGET_SIZE,
      };
    return isPointWithinDropTarget(
      absoluteX,
      absoluteY,
      target,
      DELETE_TARGET_TOLERANCE
    );
  };

  const applyDragPosition = (
    rowId,
    effectiveTranslationY,
    absoluteX,
    absoluteY
  ) => {
    const currentDrag = activeDragRef.current;
    if (!currentDrag || currentDrag.rowId !== rowId) return;

    const targetIndex = getDragTargetIndex(
      rowId,
      effectiveTranslationY,
      currentDrag.kind
    );
    const overDelete = isPointOverDeleteTarget(absoluteX, absoluteY);
    if (
      currentDrag.targetIndex === targetIndex &&
      currentDrag.overDelete === overDelete
    ) return;

    const nextDrag = { ...currentDrag, targetIndex, overDelete };
    activeDragRef.current = nextDrag;
    setActiveDrag(nextDrag);
  };

  const dragAutoScroll = useDragAutoScroll({
    scrollRef,
    mode: 'scroll-view',
    onAutoScroll: ({ scrollDelta, pointerY }) => {
      const currentDrag = activeDragRef.current;
      if (!currentDrag) return;
      applyDragPosition(
        currentDrag.rowId,
        dragTranslationYRef.current + scrollDelta,
        dragAbsoluteXRef.current,
        pointerY
      );
    },
  });

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

  const handleDragStart = (rowId, kind = 'expense') => {
    Keyboard.dismiss();
    measureDragArea();
    const currentItems =
      kind === 'commitment'
        ? latest.current.monthlyCommitments
        : latest.current.rows;
    const layouts = kind === 'commitment' ? commitmentLayouts.current : rowLayouts.current;
    const startIndex = currentItems.findIndex((item) => item.id === rowId);
    if (startIndex < 0) return;

    dragRowLayoutsRef.current = Object.fromEntries(
      currentItems.map((item) => [
        item.id,
        layouts[item.id]
          ? { ...layouts[item.id] }
          : null,
      ])
    );
    deleteTargetBoundsRef.current = null;

    const nextDrag = {
      kind,
      rowId,
      row: currentItems[startIndex],
      startIndex,
      targetIndex: startIndex,
      overDelete: false,
    };
    activeDragRef.current = nextDrag;
    setActiveDrag(nextDrag);
    dragTranslationYRef.current = 0;
    dragAutoScroll.startAutoScroll();
  };

  const handleDragUpdate = (
    rowId,
    translationY,
    absoluteX,
    absoluteY
  ) => {
    const currentDrag = activeDragRef.current;
    if (!currentDrag || currentDrag.rowId !== rowId) return;
    const overDelete = isPointOverDeleteTarget(absoluteX, absoluteY);
    dragTranslationYRef.current = translationY;
    dragAbsoluteXRef.current = absoluteX;
    dragAutoScroll.updateAutoScrollPointer(absoluteY, { blocked: overDelete });
    applyDragPosition(
      rowId,
      dragAutoScroll.getEffectiveTranslation(translationY),
      absoluteX,
      absoluteY
    );
  };

  const handleDragEnd = (
    rowId,
    translationY,
    absoluteX,
    absoluteY
  ) => {
    const currentDrag = activeDragRef.current;
    if (!currentDrag || currentDrag.rowId !== rowId) return;

    const targetIndex = getDragTargetIndex(
      rowId,
      dragAutoScroll.getEffectiveTranslation(translationY),
      currentDrag.kind
    );
    const shouldDelete =
      currentDrag.overDelete ||
      isPointOverDeleteTarget(absoluteX, absoluteY);
    activeDragRef.current = null;
    dragRowLayoutsRef.current = {};
    deleteTargetBoundsRef.current = null;
    dragAutoScroll.stopAutoScroll();
    setActiveDrag(null);

    if (shouldDelete) {
      if (currentDrag.kind === 'commitment') confirmRemoveCommitment(rowId);
      else confirmRemoveRow(rowId);
      return;
    }

    if (currentDrag.kind === 'commitment') {
      const nextCommitments = moveMonthlyCommitmentToIndex(
        latest.current.monthlyCommitments,
        rowId,
        targetIndex
      );
      if (nextCommitments !== latest.current.monthlyCommitments) {
        updateMonthlyCommitments(nextCommitments);
      }
    } else {
      const nextRows = moveExpenseRowToIndex(
        latest.current.rows,
        rowId,
        targetIndex
      );
      if (nextRows !== latest.current.rows) {
        remember(getUndoSnapshot());
        setRows(nextRows);
        updateDraft(latest.current.title, nextRows);
      }
    }
  };

  const handleDragCancel = (rowId) => {
    if (activeDragRef.current?.rowId !== rowId) return;
    activeDragRef.current = null;
    dragRowLayoutsRef.current = {};
    deleteTargetBoundsRef.current = null;
    dragAutoScroll.stopAutoScroll();
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

  const deleteExpenseRecord = async () => {
    try {
      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current);
        saveTimeout.current = null;
      }
      latest.current.deleted = true;
      await collaborationService.delete(noteId);
      navigation.goBack();
    } catch {
      latest.current.deleted = false;
      Alert.alert('Error', 'Failed to delete expense record');
    }
  };

  const confirmDelete = () => {
    confirmDestructiveAction({
      title: 'Delete this expense record?',
      message: 'The daily expenses, monthly bills, total, and summary will be removed.',
      details: [
        {
          label: 'Expense record',
          value: title.trim() || 'Untitled expense record',
          iconName: 'receipt-outline',
        },
      ],
      confirmLabel: 'Delete record',
      onConfirm: deleteExpenseRecord,
    });
  };

  const handleDelete = () => {
    if (hasPassword) {
      setShowDeletePasswordModal(true);
      return;
    }
    confirmDelete();
  };

  useEffect(() => {
    loadRecord();
    loadSavedCommitmentTemplate();
  }, [loadRecord, loadSavedCommitmentTemplate]);

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
          draft.summaryNote,
          draft.monthlyCommitments
        ) &&
        !draft.hasPassword &&
        !draft.isPinned &&
        !draft.cloudId
      ) {
        noteRepo.hardDelete(noteId).catch(() => {});
      } else if (pending) {
        collaborationService
          .save(noteId, {
            title: draft.title.trim(),
            content: serializeExpenseNote(
              draft.rows,
              draft.categories,
              draft.summaryNote,
              draft.monthlyCommitments
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

        <EditorUndoButton
          canUndo={canUndo}
          colors={colors}
          disabledStyle={styles.headerButtonDisabled}
          onUndo={handleUndo}
          style={styles.headerButton}
        />

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
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(32, insets.bottom + 20) },
        ]}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        scrollEnabled={!activeDrag}
        onScroll={dragAutoScroll.handleScroll}
        scrollEventThrottle={16}
        onLayout={dragAutoScroll.handleViewportLayout}
        onContentSizeChange={dragAutoScroll.handleContentSizeChange}
      >
        <View style={styles.editorContent}>
          <View style={styles.summaryCard}>
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
            <View style={styles.summaryContent}>
              <Text style={styles.totalLabel}>GRAND TOTAL</Text>
              <Text style={styles.totalText}>
                RM {formatExpenseAmount(total)}
              </Text>
            </View>
          </View>

          <View style={styles.commitmentHeading}>
            <View style={styles.commitmentHeadingCopy}>
              <Text style={styles.sectionTitle}>Monthly commitments</Text>
              <View style={styles.commitmentStatusRow}>
                <Text style={styles.commitmentProgress} numberOfLines={1}>
                  {commitmentTotals.paidCount} of {commitmentTotals.count} paid · RM{' '}
                  {formatExpenseAmount(commitmentTotals.remaining)} left
                </Text>
              </View>
            </View>
            <View style={styles.commitmentHeadingActions}>
              {commitmentTotals.paidCount > 0 && (
                <Pressable
                  style={({ pressed }) => [
                    styles.resetPaidIconButton,
                    pressed && styles.actionsMenuItemPressed,
                  ]}
                  onPress={resetCommitmentPaidStatus}
                  accessibilityRole="button"
                  accessibilityLabel="Reset all monthly bills to unpaid"
                >
                  <Ionicons name="refresh-outline" size={18} color={colors.primary} />
                </Pressable>
              )}
              <Pressable
                style={({ pressed }) => [
                  styles.commitmentDisclosureButton,
                  pressed && styles.actionsMenuItemPressed,
                ]}
                onPress={() => setIsCommitmentsExpanded((expanded) => !expanded)}
                accessibilityRole="button"
                accessibilityLabel={`${isCommitmentsExpanded ? 'Collapse' : 'Expand'} monthly commitments`}
                accessibilityHint="Shows or hides monthly bills and their actions"
                accessibilityState={{ expanded: isCommitmentsExpanded }}
              >
                <Ionicons
                  name={isCommitmentsExpanded ? 'chevron-up' : 'chevron-down'}
                  size={19}
                  color={colors.primary}
                />
              </Pressable>
            </View>
          </View>

          {isCommitmentsExpanded && (
            <View style={styles.commitmentExpandedContent}>
              <View style={styles.commitmentCard}>
            {!monthlyCommitments.length && (
              <View style={styles.commitmentEmpty}>
                <View style={styles.commitmentEmptyIcon}>
                  <Ionicons name="calendar-outline" size={21} color={colors.primary} />
                </View>
                <View style={styles.commitmentInfo}>
                  <Text style={styles.commitmentName}>No monthly bills yet</Text>
                  <Text style={styles.commitmentMeta}>
                    Add rent, subscriptions, insurance, or other fixed bills.
                  </Text>
                </View>
              </View>
            )}

            {!monthlyCommitments.length && !!savedCommitmentTemplate.length && (
              <View style={styles.savedTemplateCallout}>
                <View style={styles.savedTemplateIcon}>
                  <Ionicons name="copy-outline" size={20} color={colors.primary} />
                </View>
                <View style={styles.savedTemplateCopy}>
                  <Text style={styles.savedTemplateTitle}>Use your saved bills</Text>
                  <Text style={styles.savedTemplateHint}>
                    {savedCommitmentTemplate.length}{' '}
                    {savedCommitmentTemplate.length === 1 ? 'bill' : 'bills'} · RM{' '}
                    {formatExpenseAmount(savedCommitmentTotals.total)} · all unpaid
                  </Text>
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.applyTemplateButton,
                    pressed && styles.actionsMenuItemPressed,
                  ]}
                  onPress={applySavedCommitments}
                  accessibilityRole="button"
                  accessibilityLabel={`Apply ${savedCommitmentTemplate.length} saved monthly bills, all unpaid`}
                >
                  <Text style={styles.applyTemplateText}>Apply</Text>
                </Pressable>
              </View>
            )}

            {monthlyCommitments.map((commitment, index) => (
              <React.Fragment key={commitment.id}>
                {insertionBeforeCommitmentId === commitment.id && (
                  <View style={styles.rowInsertionGap}>
                    <View style={styles.rowInsertionDot} />
                    <View style={styles.rowInsertionLine} />
                    <Text style={styles.rowInsertionText}>Bill moves here</Text>
                  </View>
                )}
                <View
                  onLayout={({ nativeEvent }) => {
                    commitmentLayouts.current[commitment.id] = nativeEvent.layout;
                  }}
                  style={[
                    styles.commitmentRow,
                    activeDrag?.kind === 'commitment' &&
                      activeDrag.rowId === commitment.id &&
                      styles.draggingRow,
                  ]}
                >
                  <ExpenseRowDragHandle
                    rowId={commitment.id}
                    rowIndex={index}
                    colors={colors}
                    styles={styles}
                    dragX={dragX}
                    dragY={dragY}
                    dragAreaX={dragAreaBounds.x}
                    dragAreaY={dragAreaBounds.y}
                    onDragStart={(id) => handleDragStart(id, 'commitment')}
                    onDragUpdate={handleDragUpdate}
                    onDragEnd={handleDragEnd}
                    onDragCancel={handleDragCancel}
                    onMove={moveCommitment}
                    onDelete={confirmRemoveCommitment}
                    itemLabel="monthly bill"
                  />
                  <Pressable
                    style={({ pressed }) => [
                      styles.commitmentCheckboxTouch,
                      pressed && styles.actionsMenuItemPressed,
                    ]}
                    onPress={() => toggleCommitmentPaid(commitment.id)}
                    accessibilityRole="checkbox"
                    accessibilityLabel={`Mark ${commitment.remark} as ${commitment.isPaid ? 'unpaid' : 'paid'}`}
                    accessibilityState={{ checked: commitment.isPaid }}
                  >
                    <View
                      style={[
                        styles.commitmentCheckbox,
                        commitment.isPaid && styles.commitmentCheckboxChecked,
                      ]}
                    >
                      {commitment.isPaid && (
                        <Ionicons name="checkmark" size={16} color={colors.card} />
                      )}
                    </View>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.commitmentInfoButton,
                      pressed && styles.commitmentPressed,
                    ]}
                    onPress={() => openCommitment(commitment)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${commitment.remark}`}
                  >
                    <Text
                      style={[
                        styles.commitmentName,
                        commitment.isPaid && styles.commitmentNamePaid,
                      ]}
                      numberOfLines={1}
                    >
                      {commitment.remark}
                    </Text>
                    <Text style={styles.commitmentMeta} numberOfLines={1}>
                      {commitment.day ? `Due day ${commitment.day}` : 'No due day'}
                      {commitment.isPaid ? ' · Paid' : ''}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.commitmentAmountButton,
                      pressed && styles.commitmentPressed,
                    ]}
                    onPress={() => openCommitment(commitment)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit amount for ${commitment.remark}`}
                  >
                    <Text style={styles.commitmentAmount} numberOfLines={1}>
                      RM {formatExpenseAmount(commitment.amount)}
                    </Text>
                  </Pressable>
                </View>
              </React.Fragment>
            ))}

            {showEndCommitmentGap && (
              <View style={styles.rowInsertionGap}>
                <View style={styles.rowInsertionDot} />
                <View style={styles.rowInsertionLine} />
                <Text style={styles.rowInsertionText}>Bill moves here</Text>
              </View>
            )}
              </View>

            <View style={styles.commitmentActions}>
              <TouchableOpacity
                style={styles.addCommitmentButton}
                onPress={openNewCommitment}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Add"
              >
                <Ionicons name="add-circle" size={23} color={colors.primary} />
                <Text style={styles.addCommitmentText}>Add</Text>
              </TouchableOpacity>
              {!!monthlyCommitments.length && (
                <Pressable
                  style={({ pressed }) => [
                    styles.saveTemplateButton,
                    pressed && styles.actionsMenuItemPressed,
                    currentCommitmentsMatchSavedTemplate &&
                      styles.saveTemplateButtonComplete,
                  ]}
                  onPress={saveCommitmentsForNextNote}
                  disabled={
                    isSavingCommitmentTemplate ||
                    currentCommitmentsMatchSavedTemplate
                  }
                  accessibilityRole="button"
                  accessibilityLabel={
                    isSavingCommitmentTemplate
                      ? 'Saving monthly bills for the next expense note'
                      : currentCommitmentsMatchSavedTemplate
                      ? 'Monthly bills saved for the next expense note'
                      : 'Save monthly bills for the next expense note'
                  }
                  accessibilityState={{
                    disabled:
                      isSavingCommitmentTemplate ||
                      currentCommitmentsMatchSavedTemplate,
                    busy: isSavingCommitmentTemplate,
                  }}
                >
                  <Ionicons
                    name={
                      isSavingCommitmentTemplate
                        ? 'hourglass-outline'
                        : currentCommitmentsMatchSavedTemplate
                        ? 'checkmark-circle-outline'
                        : 'copy-outline'
                    }
                    size={20}
                    color={colors.primary}
                  />
                </Pressable>
              )}
            </View>

              {!!commitmentTemplateMessage && (
                <Text
                  style={styles.commitmentTemplateMessage}
                  accessibilityLiveRegion="polite"
                >
                  {commitmentTemplateMessage}
                </Text>
              )}
            </View>
          )}

          <View style={styles.expenseTableHeading}>
            <View>
              <Text style={styles.sectionTitle}>Daily Expense</Text>
            </View>
          </View>

          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <View style={[styles.actionColumn, styles.actionHeaderColumn]} />
              <Text
                style={[styles.headerCell, styles.dateColumn, styles.dateHeaderCell]}
              >
                Day
              </Text>
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
                      activeDrag?.kind === 'expense' &&
                        activeDrag.rowId === row.id &&
                        styles.draggingRow,
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
                      style={[
                        styles.cellInput,
                        styles.singleLineCellInput,
                        styles.dateInput,
                      ]}
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
                      underlineColorAndroid="transparent"
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
                      maxLength={EXPENSE_REMARK_MAX_CHARACTERS}
                      placeholder={showPlaceholder ? 'Enter remark' : undefined}
                      placeholderTextColor={colors.textTertiary}
                      multiline
                      scrollEnabled={false}
                      underlineColorAndroid="transparent"
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
                      accessibilityHint={`Maximum ${EXPENSE_REMARK_MAX_CHARACTERS} characters`}
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
                      underlineColorAndroid="transparent"
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
          </View>

          <View style={styles.addRowActions}>
            <TouchableOpacity
              style={styles.addRowButton}
              onPress={() => addRow(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Add expense row"
            >
              <Ionicons name="add-circle" size={23} color={colors.primary} />
              <Text style={styles.addRowText}>Add row</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.expenseInputLimitRow}>
            <Text
              style={[
                styles.expenseInputLimitText,
                isFocusedRemarkNearLimit && styles.expenseInputLimitWarning,
              ]}
              accessibilityLiveRegion="polite"
            >
              {focusedRemarkRow
                ? focusedRemarkCharacterCount >= EXPENSE_REMARK_MAX_CHARACTERS
                  ? 'Remark character limit reached'
                  : isFocusedRemarkNearLimit
                    ? `${EXPENSE_REMARK_MAX_CHARACTERS - focusedRemarkCharacterCount} remark characters remaining`
                    : `Remark limit: ${EXPENSE_REMARK_MAX_CHARACTERS} characters`
                : `Each expense remark allows up to ${EXPENSE_REMARK_MAX_CHARACTERS} characters.`}
            </Text>
            {!!focusedRemarkRow && (
              <Text
                style={[
                  styles.expenseInputLimitCount,
                  isFocusedRemarkNearLimit && styles.expenseInputLimitWarning,
                ]}
                accessibilityLabel={`${focusedRemarkCharacterCount} of ${EXPENSE_REMARK_MAX_CHARACTERS} remark characters used`}
              >
                {focusedRemarkCharacterCount} / {EXPENSE_REMARK_MAX_CHARACTERS}
              </Text>
            )}
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

      <CollaborationFooter noteId={noteId} onRemoteNote={loadRecord} />

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
            <MaterialIcons
              name="drag-indicator"
              size={25}
              color={activeDrag.overDelete ? colors.danger : colors.primary}
              style={styles.dragIndicatorIcon}
            />
            <View style={styles.dragPreviewContent}>
              <Text style={styles.dragPreviewRemark} numberOfLines={1}>
                {activeDrag.row.remark.trim() ||
                  (activeDrag.kind === 'commitment'
                    ? 'Monthly bill'
                    : 'Empty expense row')}
              </Text>
              <Text
                style={[
                  styles.dragPreviewDestination,
                  activeDrag.overDelete && styles.dragPreviewDestinationDeleting,
                ]}
              >
                {activeDrag.overDelete
                  ? 'Release to delete'
                  : `Move to ${activeDrag.kind === 'commitment' ? 'bill' : 'row'} ${activeDrag.targetIndex + 1}`}
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
            <Ionicons
              name={activeDrag.overDelete ? 'trash' : 'trash-outline'}
              size={24}
              color={activeDrag.overDelete ? colors.card : colors.danger}
            />
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
              style={({ pressed }) => [styles.actionsMenuItem, pressed && styles.actionsMenuItemPressed]}
              onPress={() => { setShowActionsMenu(false); setShowShareModal(true); }}
              accessibilityRole="button"
            >
              <Ionicons name="people-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.actionsMenuText}>Share with people</Text>
            </Pressable>
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
                {isPinned ? 'Unpin' : 'Pin'}
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
                {hasPassword ? 'Password protection' : 'Lock'}
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
                Delete
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

      <DestructiveConfirmationModal
        visible={!!pendingDeletion}
        title={pendingDeletion?.title ?? ''}
        description={pendingDeletion?.description ?? ''}
        details={pendingDeletion?.details ?? []}
        confirmLabel={pendingDeletion?.confirmLabel ?? 'Delete'}
        onCancel={() => setPendingDeletion(null)}
        onConfirm={handleConfirmDeletion}
      />

      <NoteExportModal
        visible={showExportModal}
        onClose={() => setShowExportModal(false)}
        title={title}
        rows={rows}
        total={total}
        categories={categories}
        summaryNote={summaryNote}
        monthlyCommitments={monthlyCommitments}
        type="expense"
      />
      <NoteShareModal visible={showShareModal} noteId={noteId} onClose={() => setShowShareModal(false)} onChanged={loadRecord} onLeft={() => navigation.goBack()} />

      <PasswordModal
        visible={showDeletePasswordModal}
        onClose={() => setShowDeletePasswordModal(false)}
        onVerify={async (password) => {
          const note = await noteRepo.getById(noteId);
          return !!note?.password && verifyPassword(password, note.password);
        }}
        onVerified={async () => {
          setShowDeletePasswordModal(false);
          await deleteExpenseRecord();
        }}
        title="Delete this locked expense record?"
        subtitle="Enter its password to confirm deletion. Daily expenses, monthly bills, total, and summary will be removed."
        verifyLabel="Delete record"
        variant="danger"
        details={[
          {
            label: 'Expense record',
            value: title.trim() || 'Untitled expense record',
            iconName: 'receipt-outline',
          },
        ]}
      />

      <Modal
        visible={!!commitmentDraft}
        animationType="fade"
        transparent
        onRequestClose={() => setCommitmentDraft(null)}
      >
        <KeyboardAwareModalContent>
          <View style={[styles.modalContent, styles.commitmentModalContent]}>
            <View style={styles.commitmentModalHeader}>
              <View>
                <Text style={styles.commitmentModalTitle}>
                  {latest.current.monthlyCommitments.some(
                    (item) => item.id === commitmentDraft?.id
                  )
                    ? 'Edit bill'
                    : 'Add bill'}
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.commitmentModalClose,
                  pressed && styles.actionsMenuItemPressed,
                ]}
                onPress={() => setCommitmentDraft(null)}
                accessibilityRole="button"
                accessibilityLabel="Close monthly bill form"
              >
                <Ionicons name="close" size={21} color={colors.text} />
              </Pressable>
            </View>

            <View style={styles.commitmentForm}>
              <View style={styles.commitmentInputLabelRow}>
                <Text style={styles.commitmentInputLabel}>Bill name</Text>
                <Text style={styles.commitmentInputLimit}>
                  Maximum {EXPENSE_COMMITMENT_NAME_MAX_CHARACTERS} characters
                </Text>
              </View>
              <TextInput
                style={styles.commitmentInput}
                value={commitmentDraft?.remark ?? ''}
                onChangeText={(value) => handleCommitmentDraftChange('remark', value)}
                placeholder="e.g. Internet subscription"
                placeholderTextColor={colors.textTertiary}
                maxLength={EXPENSE_COMMITMENT_NAME_MAX_CHARACTERS}
                autoFocus
                returnKeyType="next"
                accessibilityLabel="Monthly bill name"
                accessibilityHint={`Maximum ${EXPENSE_COMMITMENT_NAME_MAX_CHARACTERS} characters`}
              />

              <View style={styles.commitmentFormRow}>
                <View style={styles.commitmentFormField}>
                  <Text style={styles.commitmentInputLabel}>Due day (optional)</Text>
                  <TextInput
                    style={styles.commitmentInput}
                    value={commitmentDraft?.day ?? ''}
                    onChangeText={(value) =>
                      handleCommitmentDraftChange(
                        'day',
                        sanitizeExpenseDateInput(value).slice(0, 2)
                      )
                    }
                    placeholder="1–31"
                    placeholderTextColor={colors.textTertiary}
                    inputMode="numeric"
                    keyboardType="number-pad"
                    maxLength={2}
                    accessibilityLabel="Monthly bill due day"
                  />
                </View>
                <View style={styles.commitmentFormField}>
                  <Text style={styles.commitmentInputLabel}>Amount (RM)</Text>
                  <TextInput
                    style={[styles.commitmentInput, styles.commitmentAmountInput]}
                    value={commitmentDraft?.amount ?? ''}
                    onChangeText={(value) =>
                      handleCommitmentDraftChange(
                        'amount',
                        sanitizeExpenseAmountInput(value)
                      )
                    }
                    placeholder="0.00"
                    placeholderTextColor={colors.textTertiary}
                    inputMode="decimal"
                    keyboardType="decimal-pad"
                    accessibilityLabel="Monthly bill amount in ringgit"
                  />
                </View>
              </View>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                activeOpacity={0.7}
                onPress={() => setCommitmentDraft(null)}
                accessibilityRole="button"
                accessibilityLabel="Cancel monthly bill changes"
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.setButton]}
                activeOpacity={0.7}
                onPress={saveCommitment}
                accessibilityRole="button"
                accessibilityLabel="Save monthly bill"
              >
                <Text style={[styles.modalButtonText, styles.setButtonText]}>
                  Save bill
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAwareModalContent>
      </Modal>

      <Modal visible={showLockModal} animationType="fade" transparent>
        <KeyboardAwareModalContent>
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
        </KeyboardAwareModalContent>
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
    headerButtonDisabled: { opacity: 0.38 },
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
      backgroundColor: colors.backdropSoft,
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
    rowActionsOverlay: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingHorizontal: 12,
      backgroundColor: colors.backdrop,
    },
    rowActionsSheet: {
      width: '100%',
      maxWidth: 480,
      overflow: 'hidden',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      ...shadow.card,
    },
    rowActionsHeader: {
      gap: 4,
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: colors.inputBg,
    },
    rowActionsTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '800',
    },
    rowActionsDescription: {
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    rowActionsItem: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      backgroundColor: colors.card,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    rowActionsItemPressed: {
      backgroundColor: colors.primarySoft,
    },
    rowActionsItemDisabled: {
      backgroundColor: colors.inputBg,
    },
    rowActionsItemText: {
      flex: 1,
      color: colors.text,
      fontSize: 16,
      fontWeight: '600',
    },
    rowActionsItemTextDisabled: {
      color: colors.textTertiary,
    },
    rowActionsDeleteItem: {
      borderTopColor: colors.border,
    },
    rowActionsDeleteText: {
      color: colors.danger,
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
      justifyContent: 'space-between',
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
    hiddenLegacySummaryRow: {
      display: 'none',
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
    commitmentHeading: {
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: 2,
    },
    commitmentHeadingCopy: {
      flex: 1,
      minWidth: 0,
    },
    commitmentStatusRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    commitmentProgress: {
      flexShrink: 1,
      color: colors.textSecondary,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '700',
      textAlign: 'left',
      fontVariant: ['tabular-nums'],
    },
    commitmentHeadingActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    resetPaidIconButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.full,
    },
    commitmentDisclosureButton: {
      width: 44,
      height: 44,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
      borderRadius: radius.full,
    },
    commitmentExpandedContent: {
      gap: 8,
    },
    commitmentCard: {
      overflow: 'hidden',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      ...shadow.card,
    },
    commitmentEmpty: {
      minHeight: 76,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    commitmentEmptyIcon: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      backgroundColor: colors.primarySoft,
    },
    savedTemplateCallout: {
      minHeight: 72,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.primarySoft,
    },
    savedTemplateIcon: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      backgroundColor: colors.card,
    },
    savedTemplateCopy: {
      flex: 1,
      minWidth: 0,
    },
    savedTemplateTitle: {
      color: colors.text,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '800',
    },
    savedTemplateHint: {
      color: colors.textSecondary,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 1,
    },
    applyTemplateButton: {
      minWidth: 68,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
    },
    applyTemplateText: {
      color: colors.card,
      fontSize: 12,
      fontWeight: '800',
    },
    commitmentRow: {
      minHeight: MONTHLY_COMMITMENT_MIN_HEIGHT,
      flexDirection: 'row',
      alignItems: 'stretch',
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.card,
    },
    commitmentCheckboxTouch: {
      width: 48,
      minHeight: MONTHLY_COMMITMENT_MIN_HEIGHT,
      alignItems: 'center',
      justifyContent: 'center',
    },
    commitmentCheckbox: {
      width: 24,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.textTertiary,
      borderRadius: 7,
      backgroundColor: colors.card,
    },
    commitmentCheckboxChecked: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    commitmentInfo: {
      flex: 1,
      minWidth: 0,
    },
    commitmentInfoButton: {
      flex: 1,
      minWidth: 0,
      minHeight: MONTHLY_COMMITMENT_MIN_HEIGHT,
      justifyContent: 'center',
      paddingVertical: 9,
      paddingRight: 6,
    },
    commitmentPressed: {
      opacity: 0.65,
    },
    commitmentName: {
      color: colors.text,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '700',
    },
    commitmentNamePaid: {
      color: colors.textSecondary,
      textDecorationLine: 'line-through',
    },
    commitmentMeta: {
      color: colors.textTertiary,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 2,
    },
    commitmentAmountButton: {
      minWidth: 96,
      minHeight: MONTHLY_COMMITMENT_MIN_HEIGHT,
      alignItems: 'flex-end',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    commitmentAmount: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '800',
      textAlign: 'right',
      fontVariant: ['tabular-nums'],
    },
    commitmentActions: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 8,
    },
    addCommitmentButton: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingHorizontal: 14,
      backgroundColor: colors.primarySoft,
      borderRadius: radius.full,
    },
    addCommitmentText: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '800',
    },
    saveTemplateButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.full,
      backgroundColor: colors.card,
    },
    saveTemplateButtonComplete: {
      backgroundColor: colors.primarySoft,
    },
    commitmentTemplateMessage: {
      color: colors.textSecondary,
      fontSize: 11,
      lineHeight: 16,
      paddingHorizontal: 4,
      marginTop: -4,
    },
    expenseTableHeading: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 2,
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
      includeFontPadding: false,
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
    focusedInput: {
      backgroundColor: colors.card,
      color: colors.text,
    },
    dateColumn: {
      width: 44,
    },
    dateHeaderCell: {
      paddingHorizontal: 4,
      textAlign: 'center',
    },
    dateInput: {
      paddingHorizontal: 4,
      textAlign: 'center',
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
    rowDragHandleHolding: {
      backgroundColor: colors.primarySoft,
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
      opacity: 0.65,
      minHeight: 50,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 10,
      paddingVertical: 6,
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
    dragIndicatorIcon: {
      opacity: 0.65,
    },
    dragPreviewContent: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    dragPreviewRemark: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '700',
    },
    dragPreviewDestination: {
      color: colors.primary,
      fontSize: 10,
      fontWeight: '700',
    },
    dragPreviewDestinationDeleting: {
      color: colors.danger,
    },
    dragPreviewAmount: {
      maxWidth: 78,
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
      textAlign: 'right',
    },
    dragDeleteTarget: {
      position: 'absolute',
      left: '50%',
      width: DELETE_TARGET_SIZE,
      height: DELETE_TARGET_SIZE,
      marginLeft: -DELETE_TARGET_SIZE / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.dangerSoft,
      borderWidth: 2,
      borderColor: colors.danger,
      borderRadius: radius.full,
      ...shadow.card,
    },
    dragDeleteTargetActive: {
      backgroundColor: colors.danger,
      borderColor: colors.card,
    },
    invalidCell: {
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
    },
    addRowActions: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingHorizontal: 2,
    },
    addRowButton: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingHorizontal: 14,
      backgroundColor: colors.primarySoft,
      borderRadius: radius.full,
    },
    addRowText: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '800',
    },
    expenseInputLimitRow: {
      minHeight: 24,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: 4,
    },
    expenseInputLimitText: {
      flex: 1,
      color: colors.textTertiary,
      fontSize: 11,
      lineHeight: 16,
    },
    expenseInputLimitCount: {
      color: colors.textTertiary,
      fontSize: 11,
      fontVariant: ['tabular-nums'],
    },
    expenseInputLimitWarning: {
      color: colors.danger,
      fontWeight: '700',
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
    modalContent: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      padding: 24,
      width: '100%',
      maxWidth: 400,
      alignItems: 'center',
      ...shadow.card,
    },
    commitmentModalContent: {
      alignItems: 'stretch',
      padding: 20,
    },
    commitmentModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 18,
    },
    commitmentModalTitle: {
      color: colors.text,
      fontSize: 20,
      fontWeight: '800',
    },
    commitmentModalClose: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.full,
      backgroundColor: colors.inputBg,
    },
    commitmentForm: {
      gap: 8,
    },
    commitmentFormRow: {
      flexDirection: 'row',
      gap: 10,
    },
    commitmentFormField: {
      flex: 1,
      minWidth: 0,
    },
    commitmentInputLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    commitmentInputLabel: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '700',
    },
    commitmentInputLimit: {
      color: colors.textTertiary,
      fontSize: 10,
      lineHeight: 14,
      textAlign: 'right',
    },
    commitmentInput: {
      minHeight: 50,
      color: colors.text,
      fontSize: 16,
      paddingHorizontal: 13,
      paddingVertical: 11,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.inputBg,
      outlineStyle: 'none',
      marginBottom: 6,
    },
    commitmentAmountInput: {
      textAlign: 'right',
      fontVariant: ['tabular-nums'],
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
