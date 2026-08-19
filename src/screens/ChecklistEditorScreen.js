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
import { FlatList, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { noteRepo } from '../db/noteRepo';
import EditorUndoButton from '../components/editor-undo-button';
import NoteExportModal from '../components/NoteExportModal';
import PasswordModal from '../components/PasswordModal';
import { verifyPassword } from '../utils/crypto';
import { confirmDestructiveAction } from '../utils/confirm-action';
import { useEditorUndo } from '../utils/use-editor-undo';
import { useDragAutoScroll } from '../utils/use-drag-auto-scroll';
import {
  calculateChecklistProgress,
  CHECKLIST_ITEM_MAX_CHARACTERS,
  CHECKLIST_MAX_ITEMS,
  createChecklistItem,
  isChecklistNoteEmpty,
  moveChecklistItem,
  moveChecklistItemToIndex,
  parseChecklistNote,
  sanitizeChecklistItemText,
  serializeChecklistNote,
} from '../utils/checklist-note.mjs';
import { radius, shadow, useTheme } from '../theme';

const CHECKLIST_ITEM_MIN_HEIGHT = 60;
const CHECKLIST_ITEM_GAP = 10;
const DELETE_TARGET_SIZE = 56;
const DELETE_TARGET_TOLERANCE = 28;
const DRAG_PREVIEW_MAX_WIDTH = 280;
const DRAG_PREVIEW_POINTER_OFFSET = 50;
const DRAG_ACTIVATION_DELAY_MS = 1000;

const ChecklistItemRow = React.memo(({
  item,
  index,
  colors,
  styles,
  onTextChange,
  onToggle,
  onDelete,
  onMove,
  onDragStart,
  onDragUpdate,
  onDragEnd,
  onDragCancel,
  onLayout,
  dragX,
  dragY,
  dragAreaX,
  dragAreaY,
  isDragging,
  isDropTarget,
  itemCount,
}) => {
  const [isHolding, setIsHolding] = useState(false);
  const callbacks = useRef({
    onMove,
    onDelete,
    onDragStart,
    onDragUpdate,
    onDragEnd,
    onDragCancel,
  });
  callbacks.current = {
    onMove,
    onDelete,
    onDragStart,
    onDragUpdate,
    onDragEnd,
    onDragCancel,
  };

  const startDrag = useCallback(() => {
    callbacks.current.onDragStart(item.id);
  }, [item.id]);
  const updateDrag = useCallback((translationY, absoluteX, absoluteY) => {
    callbacks.current.onDragUpdate(item.id, translationY, absoluteX, absoluteY);
  }, [item.id]);
  const endDrag = useCallback((translationY, absoluteX, absoluteY) => {
    callbacks.current.onDragEnd(item.id, translationY, absoluteX, absoluteY);
  }, [item.id]);
  const cancelDrag = useCallback(() => {
    callbacks.current.onDragCancel(item.id);
  }, [item.id]);
  const beginHold = useCallback(() => setIsHolding(true), []);
  const endHold = useCallback(() => setIsHolding(false), []);

  const dragGesture = useMemo(
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
          runOnJS(updateDrag)(event.translationY, event.absoluteX, event.absoluteY);
        })
        .onEnd((event) => {
          dragX.value = event.absoluteX - dragAreaX;
          dragY.value = event.absoluteY - dragAreaY;
          runOnJS(endDrag)(event.translationY, event.absoluteX, event.absoluteY);
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
      endDrag,
      endHold,
      startDrag,
      updateDrag,
    ]
  );

  return (
    <View style={styles.itemShell}>
      {isDropTarget && (
        <View style={styles.rowInsertionGap}>
          <View style={styles.rowInsertionDot} />
          <View style={styles.rowInsertionLine} />
          <Text style={styles.rowInsertionText}>Item moves here</Text>
        </View>
      )}
      <View
        onLayout={onLayout}
        style={[styles.itemRow, isDragging && styles.itemRowDragging]}
      >
        <GestureDetector gesture={dragGesture}>
          <View
            collapsable={false}
            style={[
              styles.dragHandle,
              isHolding && styles.dragHandleHolding,
            ]}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={`Move checklist item ${index + 1}`}
            accessibilityHint="Hold still for one second, then drag to move or delete"
            accessibilityValue={{ text: `Position ${index + 1} of ${itemCount}` }}
            accessibilityActions={[
              { name: 'increment', label: 'Move item down' },
              { name: 'decrement', label: 'Move item up' },
              { name: 'activate', label: 'Delete item' },
            ]}
            onAccessibilityAction={({ nativeEvent }) => {
              if (nativeEvent.actionName === 'increment') {
                callbacks.current.onMove(item.id, 'down');
              }
              if (nativeEvent.actionName === 'decrement') {
                callbacks.current.onMove(item.id, 'up');
              }
              if (nativeEvent.actionName === 'activate') {
                callbacks.current.onDelete(item.id);
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
        <Pressable
          style={({ pressed }) => [
            styles.checkboxButton,
            pressed && styles.pressed,
          ]}
          onPress={() => onToggle(item.id)}
          accessibilityRole="checkbox"
          accessibilityLabel={`Mark ${item.text.trim() || `item ${index + 1}`} as ${item.completed ? 'not completed' : 'completed'}`}
          accessibilityState={{ checked: item.completed }}
        >
          <View style={[styles.checkbox, item.completed && styles.checkboxChecked]}>
            {item.completed && (
              <Ionicons name="checkmark" size={18} color={colors.card} />
            )}
          </View>
        </Pressable>
        <TextInput
          style={[styles.itemInput, item.completed && styles.itemInputCompleted]}
          value={item.text}
          onChangeText={(value) => onTextChange(item.id, value)}
          placeholder={`Item ${index + 1}`}
          placeholderTextColor={colors.textTertiary}
          maxLength={CHECKLIST_ITEM_MAX_CHARACTERS}
          multiline
          returnKeyType="done"
          blurOnSubmit
          accessibilityLabel={`Checklist item ${index + 1}`}
        />
      </View>
    </View>
  );
});

const ChecklistEditorScreen = ({ route, navigation }) => {
  const { noteId } = route.params;
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [title, setTitle] = useState('');
  const [items, setItems] = useState([]);
  const [newItemText, setNewItemText] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showDeletePasswordModal, setShowDeletePasswordModal] = useState(false);
  const [lockPassword, setLockPassword] = useState('');
  const [isTitleFocused, setIsTitleFocused] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [activeDrag, setActiveDrag] = useState(null);
  const [dragAreaBounds, setDragAreaBounds] = useState({
    x: 0,
    y: 0,
    width: windowWidth,
    height: 0,
  });

  const saveTimeout = useRef(null);
  const newItemInputRef = useRef(null);
  const listRef = useRef(null);
  const dragAreaRef = useRef(null);
  const dragAreaBoundsRef = useRef(dragAreaBounds);
  const activeDragRef = useRef(null);
  const itemHeightsRef = useRef({});
  const deleteTargetBoundsRef = useRef(null);
  const dragTranslationYRef = useRef(0);
  const dragAbsoluteXRef = useRef(0);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const latest = useRef({
    title: '',
    items: [],
    newItemText: '',
    hasPassword: false,
    isPinned: false,
    deleted: false,
  });
  const { canUndo, remember, takeUndo, clearUndo } = useEditorUndo();
  const getUndoSnapshot = useCallback(() => ({
    title: latest.current.title,
    items: latest.current.items,
    newItemText: latest.current.newItemText,
  }), []);

  const progress = calculateChecklistProgress(items);
  const itemsWithoutDraggedItem = activeDrag
    ? items.filter((item) => item.id !== activeDrag.itemId)
    : items;
  const insertionBeforeItemId = activeDrag
    ? itemsWithoutDraggedItem[activeDrag.targetIndex]?.id ?? null
    : null;
  const showEndDropIndicator = !!activeDrag &&
    activeDrag.targetIndex >= itemsWithoutDraggedItem.length &&
    activeDrag.targetIndex !== activeDrag.startIndex;
  const deleteTargetBottom = Math.max(16, insets.bottom + 8);
  const dragPreviewWidth = Math.min(
    DRAG_PREVIEW_MAX_WIDTH,
    Math.max(0, windowWidth - 64)
  );
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

  const loadChecklist = useCallback(async () => {
    try {
      const note = await noteRepo.getById(noteId);
      if (!note) return;

      const parsed = parseChecklistNote(note.content);
      setTitle(note.title);
      setItems(parsed.items);
      setHasPassword(!!note.password);
      setIsPinned(!!note.is_pinned);
      latest.current = {
        ...latest.current,
        title: note.title,
        items: parsed.items,
        newItemText: '',
        hasPassword: !!note.password,
        isPinned: !!note.is_pinned,
      };
      clearUndo();
    } catch {
      Alert.alert('Error', 'Failed to load checklist');
    }
  }, [clearUndo, noteId]);

  const scheduleSave = useCallback(
    (nextTitle, nextItems) => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      setSaveStatus('Saving...');
      saveTimeout.current = setTimeout(async () => {
        saveTimeout.current = null;
        try {
          await noteRepo.update(noteId, {
            title: nextTitle,
            content: serializeChecklistNote(nextItems),
          });
          setSaveStatus('Saved');
        } catch (error) {
          console.error('Checklist auto-save failed:', error);
          setSaveStatus('Could not save');
        }
      }, 800);
    },
    [noteId]
  );

  const updateDraft = useCallback((nextTitle, nextItems) => {
    latest.current.title = nextTitle;
    latest.current.items = nextItems;
    scheduleSave(nextTitle, nextItems);
  }, [scheduleSave]);

  const handleTitleChange = (value) => {
    remember(getUndoSnapshot(), 'title');
    setTitle(value);
    updateDraft(value, latest.current.items);
  };

  const handleItemTextChange = useCallback((itemId, value) => {
    remember(getUndoSnapshot(), `item:${itemId}`);
    const nextItems = latest.current.items.map((item) =>
      item.id === itemId
        ? { ...item, text: sanitizeChecklistItemText(value) }
        : item
    );
    setItems(nextItems);
    updateDraft(latest.current.title, nextItems);
  }, [getUndoSnapshot, remember, updateDraft]);

  const toggleItem = useCallback((itemId) => {
    remember(getUndoSnapshot());
    const nextItems = latest.current.items.map((item) =>
      item.id === itemId ? { ...item, completed: !item.completed } : item
    );
    setItems(nextItems);
    updateDraft(latest.current.title, nextItems);
  }, [getUndoSnapshot, remember, updateDraft]);

  const removeItem = useCallback((itemId) => {
    remember(getUndoSnapshot());
    const nextItems = latest.current.items.filter((item) => item.id !== itemId);
    setItems(nextItems);
    updateDraft(latest.current.title, nextItems);
  }, [getUndoSnapshot, remember, updateDraft]);

  const confirmRemoveItem = useCallback((itemId) => {
    const item = latest.current.items.find((entry) => entry.id === itemId);
    if (!item) return;

    confirmDestructiveAction({
      title: 'Delete this checklist item?',
      message: 'This item will be removed from the checklist.',
      details: [
        {
          label: 'Item',
          value: item.text.trim() || 'Empty checklist item',
          iconName: 'checkbox-outline',
        },
      ],
      confirmLabel: 'Delete item',
      onConfirm: () => removeItem(itemId),
    });
  }, [removeItem]);

  const moveItem = useCallback((itemId, direction) => {
    const nextItems = moveChecklistItem(latest.current.items, itemId, direction);
    if (nextItems === latest.current.items) return;

    remember(getUndoSnapshot());
    setItems(nextItems);
    updateDraft(latest.current.title, nextItems);
  }, [getUndoSnapshot, remember, updateDraft]);

  const storeDragAreaBounds = useCallback((x, y, width, height) => {
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
  }, []);

  const measureDragArea = useCallback((event) => {
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
  }, [storeDragAreaBounds]);

  const getDragTargetIndex = useCallback((itemId, translationY) => {
    const currentItems = latest.current.items;
    const sourceIndex = currentItems.findIndex((item) => item.id === itemId);
    if (sourceIndex < 0) return 0;

    let cursor = 0;
    const layouts = Object.fromEntries(
      currentItems.map((item) => {
        const height = itemHeightsRef.current[item.id] ?? CHECKLIST_ITEM_MIN_HEIGHT;
        const layout = { y: cursor, height };
        cursor += height + CHECKLIST_ITEM_GAP;
        return [item.id, layout];
      })
    );
    const sourceLayout = layouts[itemId];
    const projectedCenter =
      sourceLayout.y + sourceLayout.height / 2 + translationY;
    const remainingItems = currentItems.filter((item) => item.id !== itemId);

    for (let index = 0; index < remainingItems.length; index += 1) {
      const layout = layouts[remainingItems[index].id];
      if (projectedCenter < layout.y + layout.height / 2) return index;
    }
    return remainingItems.length;
  }, []);

  const isPointOverDeleteTarget = useCallback((absoluteX, absoluteY) => {
    if (!Number.isFinite(absoluteX) || !Number.isFinite(absoluteY)) return false;

    const dragBounds = dragAreaBoundsRef.current;
    const target = deleteTargetBoundsRef.current ?? {
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
    if (!target.width || !target.height) return false;

    return (
      absoluteX >= target.left - DELETE_TARGET_TOLERANCE &&
      absoluteX <= target.left + target.width + DELETE_TARGET_TOLERANCE &&
      absoluteY >= target.top - DELETE_TARGET_TOLERANCE &&
      absoluteY <= target.top + target.height + DELETE_TARGET_TOLERANCE
    );
  }, [deleteTargetBottom]);

  const applyChecklistDragPosition = useCallback((
    itemId,
    effectiveTranslationY,
    absoluteX,
    absoluteY
  ) => {
    const currentDrag = activeDragRef.current;
    if (!currentDrag || currentDrag.itemId !== itemId) return;
    const targetIndex = getDragTargetIndex(itemId, effectiveTranslationY);
    const overDelete = isPointOverDeleteTarget(absoluteX, absoluteY);
    if (
      targetIndex === currentDrag.targetIndex &&
      overDelete === currentDrag.overDelete
    ) return;
    const nextDrag = { ...currentDrag, targetIndex, overDelete };
    activeDragRef.current = nextDrag;
    setActiveDrag(nextDrag);
  }, [getDragTargetIndex, isPointOverDeleteTarget]);

  const dragAutoScroll = useDragAutoScroll({
    scrollRef: listRef,
    mode: 'flat-list',
    onAutoScroll: ({ scrollDelta, pointerY }) => {
      const currentDrag = activeDragRef.current;
      if (!currentDrag) return;
      const effectiveTranslationY = dragTranslationYRef.current + scrollDelta;
      applyChecklistDragPosition(
        currentDrag.itemId,
        effectiveTranslationY,
        dragAbsoluteXRef.current,
        pointerY
      );
    },
  });

  const handleItemLayout = useCallback((itemId, height) => {
    itemHeightsRef.current[itemId] = Math.max(CHECKLIST_ITEM_MIN_HEIGHT, height);
  }, []);

  const handleDeleteTargetLayout = useCallback(({ nativeEvent }) => {
    const dragBounds = dragAreaBoundsRef.current;
    const { x, y, width, height } = nativeEvent.layout;
    deleteTargetBoundsRef.current = {
      left: dragBounds.x + x,
      top: dragBounds.y + y,
      width,
      height,
    };
  }, []);

  const handleDragStart = useCallback((itemId) => {
    Keyboard.dismiss();
    measureDragArea();
    const startIndex = latest.current.items.findIndex((item) => item.id === itemId);
    if (startIndex < 0) return;

    deleteTargetBoundsRef.current = null;
    const nextDrag = {
      itemId,
      item: latest.current.items[startIndex],
      startIndex,
      targetIndex: startIndex,
      overDelete: false,
    };
    activeDragRef.current = nextDrag;
    setActiveDrag(nextDrag);
    dragTranslationYRef.current = 0;
    dragAutoScroll.startAutoScroll();
  }, [dragAutoScroll, measureDragArea]);

  const handleDragUpdate = useCallback((itemId, translationY, absoluteX, absoluteY) => {
    const currentDrag = activeDragRef.current;
    if (!currentDrag || currentDrag.itemId !== itemId) return;
    const overDelete = isPointOverDeleteTarget(absoluteX, absoluteY);
    dragTranslationYRef.current = translationY;
    dragAbsoluteXRef.current = absoluteX;
    dragAutoScroll.updateAutoScrollPointer(absoluteY, { blocked: overDelete });
    const effectiveTranslationY = dragAutoScroll.getEffectiveTranslation(translationY);
    applyChecklistDragPosition(
      itemId,
      effectiveTranslationY,
      absoluteX,
      absoluteY
    );
  }, [applyChecklistDragPosition, dragAutoScroll, isPointOverDeleteTarget]);

  const finishDrag = useCallback(() => {
    activeDragRef.current = null;
    deleteTargetBoundsRef.current = null;
    dragAutoScroll.stopAutoScroll();
    setActiveDrag(null);
  }, [dragAutoScroll]);

  const handleDragEnd = useCallback((
    itemId,
    translationY,
    absoluteX,
    absoluteY
  ) => {
    const currentDrag = activeDragRef.current;
    if (!currentDrag || currentDrag.itemId !== itemId) return;

    const targetIndex = getDragTargetIndex(
      itemId,
      dragAutoScroll.getEffectiveTranslation(translationY)
    );
    const shouldDelete =
      currentDrag.overDelete ||
      isPointOverDeleteTarget(absoluteX, absoluteY);
    finishDrag();
    if (shouldDelete) {
      confirmRemoveItem(itemId);
      return;
    }

    const nextItems = moveChecklistItemToIndex(
      latest.current.items,
      itemId,
      targetIndex
    );
    if (nextItems === latest.current.items) return;

    remember(getUndoSnapshot());
    setItems(nextItems);
    updateDraft(latest.current.title, nextItems);
  }, [confirmRemoveItem, dragAutoScroll, finishDrag, getDragTargetIndex, getUndoSnapshot, isPointOverDeleteTarget, remember, updateDraft]);

  const handleDragCancel = useCallback((itemId) => {
    if (activeDragRef.current?.itemId !== itemId) return;
    finishDrag();
  }, [finishDrag]);

  const addItem = () => {
    const text = newItemText.trim();
    if (!text) return;
    if (latest.current.items.length >= CHECKLIST_MAX_ITEMS) {
      Alert.alert('Checklist full', `A checklist can contain up to ${CHECKLIST_MAX_ITEMS} items.`);
      return;
    }

    const nextItems = [
      ...latest.current.items,
      createChecklistItem({ text }),
    ];
    remember(getUndoSnapshot());
    setItems(nextItems);
    setNewItemText('');
    latest.current.newItemText = '';
    updateDraft(latest.current.title, nextItems);
    requestAnimationFrame(() => newItemInputRef.current?.focus());
  };

  const handleNewItemTextChange = (value) => {
    remember(getUndoSnapshot(), 'new-item');
    const nextValue = sanitizeChecklistItemText(value);
    setNewItemText(nextValue);
    latest.current.newItemText = nextValue;
  };

  const handleUndo = () => {
    const snapshot = takeUndo();
    if (!snapshot) return;

    setTitle(snapshot.title);
    setItems(snapshot.items);
    setNewItemText(snapshot.newItemText);
    latest.current.newItemText = snapshot.newItemText;
    updateDraft(snapshot.title, snapshot.items);
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
    const next = !isPinned;
    try {
      await noteRepo.update(noteId, { is_pinned: next });
      setIsPinned(next);
      latest.current.isPinned = next;
    } catch {
      Alert.alert('Error', 'Failed to update pin');
    }
  };

  const deleteChecklist = async () => {
    try {
      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current);
        saveTimeout.current = null;
      }
      latest.current.deleted = true;
      await noteRepo.softDelete(noteId);
      navigation.goBack();
    } catch {
      latest.current.deleted = false;
      Alert.alert('Error', 'Failed to delete checklist');
    }
  };

  const confirmDelete = () => {
    confirmDestructiveAction({
      title: 'Delete this checklist?',
      message: 'This checklist and all its items will be removed from your notes.',
      details: [
        {
          label: 'Checklist',
          value: title.trim() || 'Untitled checklist',
          iconName: 'checkbox-outline',
        },
      ],
      confirmLabel: 'Delete checklist',
      onConfirm: deleteChecklist,
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
    loadChecklist();
  }, [loadChecklist]);

  useEffect(() => {
    return () => {
      const pending = saveTimeout.current;
      if (pending) {
        clearTimeout(pending);
        saveTimeout.current = null;
      }

      const { title: latestTitle, items: latestItems, hasPassword: password, isPinned: pinned, deleted } = latest.current;
      if (deleted) return;
      if (isChecklistNoteEmpty(latestTitle, latestItems) && !password && !pinned) {
        noteRepo.hardDelete(noteId).catch(() => {});
      } else if (pending) {
        noteRepo.update(noteId, {
          title: latestTitle,
          content: serializeChecklistNote(latestItems),
        }).catch(() => {});
      }
    };
  }, [noteId]);

  const renderItem = useCallback(({ item, index }) => (
    <ChecklistItemRow
      item={item}
      index={index}
      colors={colors}
      styles={styles}
      onTextChange={handleItemTextChange}
      onToggle={toggleItem}
      onDelete={confirmRemoveItem}
      onMove={moveItem}
      onDragStart={handleDragStart}
      onDragUpdate={handleDragUpdate}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      onLayout={({ nativeEvent }) => handleItemLayout(item.id, nativeEvent.layout.height)}
      dragX={dragX}
      dragY={dragY}
      dragAreaX={dragAreaBounds.x}
      dragAreaY={dragAreaBounds.y}
      isDragging={activeDrag?.itemId === item.id}
      isDropTarget={insertionBeforeItemId === item.id && activeDrag?.itemId !== item.id}
      itemCount={items.length}
    />
  ), [
    activeDrag,
    colors,
    confirmRemoveItem,
    dragAreaBounds.x,
    dragAreaBounds.y,
    dragX,
    dragY,
    handleDragCancel,
    handleDragEnd,
    handleDragStart,
    handleDragUpdate,
    handleItemLayout,
    handleItemTextChange,
    insertionBeforeItemId,
    items.length,
    moveItem,
    styles,
    toggleItem,
  ]);

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
            isTitleFocused && styles.headerTitleFieldFocused,
          ]}
        >
          <Ionicons name="checkbox-outline" size={19} color={colors.primary} />
          <TextInput
            style={styles.headerTitleInput}
            placeholder="Checklist title"
            placeholderTextColor={colors.textTertiary}
            value={title}
            onChangeText={handleTitleChange}
            onFocus={() => setIsTitleFocused(true)}
            onBlur={() => setIsTitleFocused(false)}
            returnKeyType="next"
            onSubmitEditing={() => newItemInputRef.current?.focus()}
            accessibilityLabel="Checklist title"
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
          accessibilityLabel="More checklist actions"
          accessibilityHint="Shows pin, password, export, and delete actions"
          accessibilityState={{ expanded: showActionsMenu }}
        >
          <Ionicons name="ellipsis-vertical" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        extraData={activeDrag}
        scrollEnabled={!activeDrag}
        removeClippedSubviews={false}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        onScroll={dragAutoScroll.handleScroll}
        scrollEventThrottle={16}
        onLayout={dragAutoScroll.handleViewportLayout}
        onContentSizeChange={dragAutoScroll.handleContentSizeChange}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 16 },
        ]}
        ListHeaderComponent={
          <View style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <View>
                <Text style={styles.progressEyebrow}>PROGRESS</Text>
                <Text style={styles.progressValue}>
                  {progress.total
                    ? `${progress.completed} of ${progress.total} completed`
                    : 'Start your checklist'}
                </Text>
              </View>
              <Text style={styles.progressPercent}>{progress.percent}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[styles.progressFill, { width: `${progress.percent}%` }]}
              />
            </View>
            <Text
              style={[
                styles.saveStatus,
                saveStatus === 'Could not save' && styles.saveStatusError,
              ]}
              accessibilityLiveRegion="polite"
            >
              {saveStatus || 'Changes save automatically'}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="checkbox-outline" size={30} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>No items yet</Text>
            <Text style={styles.emptyHint}>Add the first item below.</Text>
          </View>
        }
        ListFooterComponent={
          <>
            {showEndDropIndicator && (
              <View style={styles.rowInsertionGap}>
                <View style={styles.rowInsertionDot} />
                <View style={styles.rowInsertionLine} />
                <Text style={styles.rowInsertionText}>Item moves here</Text>
              </View>
            )}
            <View style={styles.addCard}>
              <Text style={styles.addLabel}>ADD ITEM</Text>
              <View style={styles.addRow}>
                <TextInput
                  ref={newItemInputRef}
                  style={styles.addInput}
                  value={newItemText}
                  onChangeText={handleNewItemTextChange}
                  placeholder="What needs to be done?"
                  placeholderTextColor={colors.textTertiary}
                  maxLength={CHECKLIST_ITEM_MAX_CHARACTERS}
                  returnKeyType="done"
                  onSubmitEditing={addItem}
                  accessibilityLabel="New checklist item"
                />
                <Pressable
                  style={({ pressed }) => [
                    styles.addButton,
                    !newItemText.trim() && styles.addButtonDisabled,
                    pressed && newItemText.trim() && styles.pressed,
                  ]}
                  disabled={!newItemText.trim()}
                  onPress={addItem}
                  accessibilityRole="button"
                  accessibilityLabel="Add checklist item"
                  accessibilityState={{ disabled: !newItemText.trim() }}
                >
                  <Ionicons name="add" size={22} color={colors.card} />
                </Pressable>
              </View>
              <Text style={styles.itemLimit}>
                {items.length} / {CHECKLIST_MAX_ITEMS} items
              </Text>
            </View>
          </>
        }
      />

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
              <Text style={styles.dragPreviewText} numberOfLines={1}>
                {activeDrag.item.text.trim() || 'Empty checklist item'}
              </Text>
              <Text
                style={[
                  styles.dragPreviewDestination,
                  activeDrag.overDelete && styles.dragPreviewDestinationDeleting,
                ]}
              >
                {activeDrag.overDelete
                  ? 'Release to delete'
                  : `Move to item ${activeDrag.targetIndex + 1}`}
              </Text>
            </View>
            <Ionicons
              name={activeDrag.item.completed ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={activeDrag.item.completed ? colors.primary : colors.textSecondary}
            />
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
              onPress={() => {
                setShowActionsMenu(false);
                setShowExportModal(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Export checklist"
            >
              <Ionicons name="share-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.actionsMenuText}>Export PDF or image</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.actionsMenuItem, pressed && styles.actionsMenuItemPressed]}
              onPress={() => {
                setShowActionsMenu(false);
                handleTogglePin();
              }}
              accessibilityRole="button"
              accessibilityLabel={isPinned ? 'Unpin checklist' : 'Pin checklist'}
            >
              <Ionicons
                name={isPinned ? 'pin' : 'pin-outline'}
                size={20}
                color={isPinned ? colors.primary : colors.textSecondary}
              />
              <Text style={styles.actionsMenuText}>{isPinned ? 'Unpin checklist' : 'Pin checklist'}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.actionsMenuItem, pressed && styles.actionsMenuItemPressed]}
              onPress={() => {
                setShowActionsMenu(false);
                setShowLockModal(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={hasPassword ? 'Manage checklist password' : 'Set checklist password'}
            >
              <Ionicons
                name={hasPassword ? 'lock-closed' : 'lock-open-outline'}
                size={20}
                color={hasPassword ? colors.folder : colors.textSecondary}
              />
              <Text style={styles.actionsMenuText}>{hasPassword ? 'Password protection' : 'Lock checklist'}</Text>
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
              accessibilityLabel="Delete checklist"
            >
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
              <Text style={[styles.actionsMenuText, styles.actionsMenuDeleteText]}>Delete checklist</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <NoteExportModal
        visible={showExportModal}
        onClose={() => setShowExportModal(false)}
        title={title}
        checklistItems={items}
        type="checklist"
      />

      <PasswordModal
        visible={showDeletePasswordModal}
        onClose={() => setShowDeletePasswordModal(false)}
        onVerify={async (password) => {
          const note = await noteRepo.getById(noteId);
          return !!note?.password && verifyPassword(password, note.password);
        }}
        onVerified={async () => {
          setShowDeletePasswordModal(false);
          await deleteChecklist();
        }}
        title="Delete this locked checklist?"
        subtitle="Enter its password to confirm deletion. This checklist and all its items will be removed."
        verifyLabel="Delete checklist"
        variant="danger"
        details={[
          {
            label: 'Checklist',
            value: title.trim() || 'Untitled checklist',
            iconName: 'checkbox-outline',
          },
        ]}
      />

      <Modal
        visible={showLockModal}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setShowLockModal(false);
          setLockPassword('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconCircle}>
              <Ionicons
                name={hasPassword ? 'lock-closed' : 'lock-open-outline'}
                size={26}
                color={colors.primary}
              />
            </View>
            <Text style={styles.modalTitle}>{hasPassword ? 'Password Protection' : 'Set Password'}</Text>
            {hasPassword ? (
              <Text style={styles.modalDescription}>This checklist is password protected.</Text>
            ) : (
              <TextInput
                style={styles.modalInput}
                placeholder="Enter password"
                placeholderTextColor={colors.textTertiary}
                value={lockPassword}
                onChangeText={setLockPassword}
                secureTextEntry
                autoFocus
                accessibilityLabel="Checklist password"
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
                  <Text style={[styles.modalButtonText, styles.removeButtonText]}>Remove Lock</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.modalButton, styles.setButton]}
                  activeOpacity={0.7}
                  onPress={handleSetPassword}
                >
                  <Text style={[styles.modalButtonText, styles.setButtonText]}>Set Lock</Text>
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
    container: { flex: 1, backgroundColor: colors.background },
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
    headerTitleFieldFocused: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
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
    listContent: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16, gap: 10 },
    progressCard: {
      padding: 16,
      gap: 10,
      marginBottom: 6,
      borderRadius: radius.lg,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadow.card,
    },
    progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
    progressEyebrow: { color: colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
    progressValue: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 3 },
    progressPercent: { color: colors.primary, fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
    progressTrack: { height: 8, borderRadius: radius.full, overflow: 'hidden', backgroundColor: colors.inputBg },
    progressFill: { height: '100%', borderRadius: radius.full, backgroundColor: colors.primary },
    saveStatus: { color: colors.textTertiary, fontSize: 12 },
    saveStatusError: { color: colors.danger, fontWeight: '600' },
    itemShell: {
      position: 'relative',
      zIndex: 1,
    },
    itemRow: {
      minHeight: CHECKLIST_ITEM_MIN_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingRight: 8,
      paddingVertical: 4,
      borderRadius: radius.md,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    itemRowDragging: {
      backgroundColor: colors.primarySoft,
      opacity: 0.35,
    },
    dragHandle: {
      width: 44,
      minHeight: 48,
      alignSelf: 'stretch',
      alignItems: 'center',
      justifyContent: 'center',
    },
    dragHandleHolding: {
      backgroundColor: colors.primarySoft,
    },
    dragIndicatorIcon: {
      opacity: 0.65,
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
    checkboxButton: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
    checkbox: {
      width: 26,
      height: 26,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: colors.textTertiary,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
    },
    checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
    itemInput: {
      flex: 1,
      minWidth: 0,
      minHeight: 48,
      paddingVertical: 11,
      color: colors.text,
      fontSize: 16,
      lineHeight: 22,
      outlineStyle: 'none',
    },
    itemInputCompleted: { color: colors.textTertiary, textDecorationLine: 'line-through' },
    pressed: { opacity: 0.68 },
    emptyState: { alignItems: 'center', gap: 6, paddingHorizontal: 24, paddingVertical: 32 },
    emptyIcon: { width: 56, height: 56, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
    emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
    emptyHint: { color: colors.textSecondary, fontSize: 14 },
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
    dragPreviewContent: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    dragPreviewText: {
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
    addCard: {
      gap: 9,
      marginTop: 6,
      padding: 14,
      borderRadius: radius.md,
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    addLabel: { color: colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
    addRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    addInput: {
      flex: 1,
      minWidth: 0,
      minHeight: 48,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: radius.md,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.text,
      fontSize: 16,
      outlineStyle: 'none',
    },
    addButton: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
    addButtonDisabled: { opacity: 0.4 },
    itemLimit: { color: colors.textTertiary, fontSize: 11, fontVariant: ['tabular-nums'] },
    actionsMenuOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.12)' },
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
    actionsMenuItem: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, backgroundColor: colors.card },
    actionsMenuItemPressed: { backgroundColor: colors.inputBg },
    actionsMenuDeleteItem: { borderTopWidth: 1, borderTopColor: colors.border },
    actionsMenuText: { flex: 1, fontSize: 16, color: colors.text },
    actionsMenuDeleteText: { color: colors.danger, fontWeight: '600' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    modalContent: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 24, width: '100%', maxWidth: 400, alignItems: 'center', ...shadow.card },
    modalIconCircle: { width: 56, height: 56, borderRadius: radius.full, backgroundColor: colors.primarySoft, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
    modalTitle: { fontSize: 19, fontWeight: '700', color: colors.text, marginBottom: 8, textAlign: 'center' },
    modalDescription: { fontSize: 15, color: colors.textSecondary, marginBottom: 20, textAlign: 'center' },
    modalInput: { backgroundColor: colors.inputBg, borderRadius: radius.md, padding: 14, marginBottom: 16, fontSize: 16, color: colors.text, alignSelf: 'stretch' },
    modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8, alignSelf: 'stretch' },
    modalButton: { flex: 1, minHeight: 48, padding: 14, borderRadius: radius.md, alignItems: 'center' },
    cancelButton: { backgroundColor: colors.inputBg },
    setButton: { backgroundColor: colors.primary },
    removeButton: { backgroundColor: colors.dangerSoft },
    modalButtonText: { fontSize: 16, fontWeight: '600', color: colors.text },
    setButtonText: { color: colors.card },
    removeButtonText: { color: colors.danger },
  });

export default ChecklistEditorScreen;
