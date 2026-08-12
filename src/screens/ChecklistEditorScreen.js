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
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FlatList, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { noteRepo } from '../db/noteRepo';
import NoteExportModal from '../components/NoteExportModal';
import PasswordModal from '../components/PasswordModal';
import { verifyPassword } from '../utils/crypto';
import { confirmDestructiveAction } from '../utils/confirm-action';
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
  dragOffsetY,
  isDragging,
  isDropTarget,
  itemCount,
}) => {
  const callbacks = useRef({
    onMove,
    onDragStart,
    onDragUpdate,
    onDragEnd,
    onDragCancel,
  });
  callbacks.current = {
    onMove,
    onDragStart,
    onDragUpdate,
    onDragEnd,
    onDragCancel,
  };

  const startDrag = useCallback(() => {
    callbacks.current.onDragStart(item.id);
  }, [item.id]);
  const updateDrag = useCallback((translationY) => {
    callbacks.current.onDragUpdate(item.id, translationY);
  }, [item.id]);
  const endDrag = useCallback((translationY) => {
    callbacks.current.onDragEnd(item.id, translationY);
  }, [item.id]);
  const cancelDrag = useCallback(() => {
    callbacks.current.onDragCancel(item.id);
  }, [item.id]);

  const dragGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(4)
        .shouldCancelWhenOutside(false)
        .runOnJS(true)
        .onStart(() => {
          dragOffsetY.value = 0;
          startDrag();
        })
        .onUpdate((event) => {
          dragOffsetY.value = event.translationY;
          updateDrag(event.translationY);
        })
        .onEnd((event) => {
          dragOffsetY.value = event.translationY;
          endDrag(event.translationY);
        })
        .onFinalize((_, success) => {
          if (!success) cancelDrag();
        }),
    [cancelDrag, dragOffsetY, endDrag, startDrag, updateDrag]
  );

  const draggedRowStyle = useAnimatedStyle(
    () => ({
      transform: [{ translateY: isDragging ? dragOffsetY.value : 0 }],
    }),
    [isDragging]
  );

  return (
    <View style={styles.itemShell} onLayout={onLayout}>
      {isDropTarget && <View style={styles.dropIndicator} />}
      <Animated.View
        style={[
          styles.itemRow,
          isDragging && styles.itemRowDragging,
          draggedRowStyle,
        ]}
      >
        <GestureDetector gesture={dragGesture}>
          <View
            collapsable={false}
            style={styles.dragHandle}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={`Move checklist item ${index + 1}`}
            accessibilityHint="Drag this handle up or down to move the item"
            accessibilityValue={{ text: `Position ${index + 1} of ${itemCount}` }}
            accessibilityActions={[
              { name: 'increment', label: 'Move item down' },
              { name: 'decrement', label: 'Move item up' },
            ]}
            onAccessibilityAction={({ nativeEvent }) => {
              if (nativeEvent.actionName === 'increment') {
                callbacks.current.onMove(item.id, 'down');
              }
              if (nativeEvent.actionName === 'decrement') {
                callbacks.current.onMove(item.id, 'up');
              }
            }}
          >
            <Ionicons name="reorder-three-outline" size={24} color={colors.textSecondary} />
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
        <Pressable
          style={({ pressed }) => [styles.deleteItemButton, pressed && styles.pressed]}
          onPress={() => onDelete(item.id)}
          accessibilityRole="button"
          accessibilityLabel={`Delete checklist item ${index + 1}`}
        >
          <Ionicons name="trash-outline" size={19} color={colors.danger} />
        </Pressable>
      </Animated.View>
    </View>
  );
});

const ChecklistEditorScreen = ({ route, navigation }) => {
  const { noteId } = route.params;
  const colors = useTheme();
  const insets = useSafeAreaInsets();
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

  const saveTimeout = useRef(null);
  const newItemInputRef = useRef(null);
  const activeDragRef = useRef(null);
  const itemHeightsRef = useRef({});
  const dragOffsetY = useSharedValue(0);
  const latest = useRef({
    title: '',
    items: [],
    hasPassword: false,
    isPinned: false,
    deleted: false,
  });

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
        hasPassword: !!note.password,
        isPinned: !!note.is_pinned,
      };
    } catch {
      Alert.alert('Error', 'Failed to load checklist');
    }
  }, [noteId]);

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
    setTitle(value);
    updateDraft(value, latest.current.items);
  };

  const handleItemTextChange = useCallback((itemId, value) => {
    const nextItems = latest.current.items.map((item) =>
      item.id === itemId
        ? { ...item, text: sanitizeChecklistItemText(value) }
        : item
    );
    setItems(nextItems);
    updateDraft(latest.current.title, nextItems);
  }, [updateDraft]);

  const toggleItem = useCallback((itemId) => {
    const nextItems = latest.current.items.map((item) =>
      item.id === itemId ? { ...item, completed: !item.completed } : item
    );
    setItems(nextItems);
    updateDraft(latest.current.title, nextItems);
  }, [updateDraft]);

  const removeItem = useCallback((itemId) => {
    const nextItems = latest.current.items.filter((item) => item.id !== itemId);
    setItems(nextItems);
    updateDraft(latest.current.title, nextItems);
  }, [updateDraft]);

  const moveItem = useCallback((itemId, direction) => {
    const nextItems = moveChecklistItem(latest.current.items, itemId, direction);
    if (nextItems === latest.current.items) return;

    setItems(nextItems);
    updateDraft(latest.current.title, nextItems);
  }, [updateDraft]);

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

  const handleItemLayout = useCallback((itemId, height) => {
    itemHeightsRef.current[itemId] = Math.max(CHECKLIST_ITEM_MIN_HEIGHT, height);
  }, []);

  const handleDragStart = useCallback((itemId) => {
    Keyboard.dismiss();
    const startIndex = latest.current.items.findIndex((item) => item.id === itemId);
    if (startIndex < 0) return;

    const nextDrag = { itemId, startIndex, targetIndex: startIndex };
    activeDragRef.current = nextDrag;
    setActiveDrag(nextDrag);
  }, []);

  const handleDragUpdate = useCallback((itemId, translationY) => {
    const currentDrag = activeDragRef.current;
    if (!currentDrag || currentDrag.itemId !== itemId) return;

    const targetIndex = getDragTargetIndex(itemId, translationY);
    if (targetIndex === currentDrag.targetIndex) return;
    const nextDrag = { ...currentDrag, targetIndex };
    activeDragRef.current = nextDrag;
    setActiveDrag(nextDrag);
  }, [getDragTargetIndex]);

  const finishDrag = useCallback(() => {
    activeDragRef.current = null;
    dragOffsetY.value = 0;
    setActiveDrag(null);
  }, [dragOffsetY]);

  const handleDragEnd = useCallback((itemId, translationY) => {
    const currentDrag = activeDragRef.current;
    if (!currentDrag || currentDrag.itemId !== itemId) return;

    const targetIndex = getDragTargetIndex(itemId, translationY);
    const nextItems = moveChecklistItemToIndex(
      latest.current.items,
      itemId,
      targetIndex
    );
    finishDrag();
    if (nextItems === latest.current.items) return;

    setItems(nextItems);
    updateDraft(latest.current.title, nextItems);
  }, [finishDrag, getDragTargetIndex, updateDraft]);

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
    setItems(nextItems);
    setNewItemText('');
    updateDraft(latest.current.title, nextItems);
    requestAnimationFrame(() => newItemInputRef.current?.focus());
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

  const confirmDelete = () => {
    confirmDestructiveAction({
      title: 'Delete Checklist',
      message: 'Are you sure you want to delete this checklist?',
      onConfirm: async () => {
        try {
          if (saveTimeout.current) {
            clearTimeout(saveTimeout.current);
            saveTimeout.current = null;
          }
          latest.current.deleted = true;
          await noteRepo.softDelete(noteId);
          navigation.goBack();
        } catch {
          Alert.alert('Error', 'Failed to delete checklist');
        }
      },
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
      onDelete={removeItem}
      onMove={moveItem}
      onDragStart={handleDragStart}
      onDragUpdate={handleDragUpdate}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      onLayout={({ nativeEvent }) => handleItemLayout(item.id, nativeEvent.layout.height)}
      dragOffsetY={dragOffsetY}
      isDragging={activeDrag?.itemId === item.id}
      isDropTarget={insertionBeforeItemId === item.id && activeDrag?.itemId !== item.id}
      itemCount={items.length}
    />
  ), [
    activeDrag,
    colors,
    dragOffsetY,
    handleDragCancel,
    handleDragEnd,
    handleDragStart,
    handleDragUpdate,
    handleItemLayout,
    handleItemTextChange,
    insertionBeforeItemId,
    items.length,
    moveItem,
    removeItem,
    styles,
    toggleItem,
  ]);

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
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        extraData={activeDrag}
        scrollEnabled={!activeDrag}
        removeClippedSubviews={false}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
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
              <View style={styles.endDropIndicator}>
                <View style={styles.dropIndicatorLine} />
                <Text style={styles.dropIndicatorText}>Item moves here</Text>
              </View>
            )}
            <View style={styles.addCard}>
              <Text style={styles.addLabel}>ADD ITEM</Text>
              <View style={styles.addRow}>
                <TextInput
                  ref={newItemInputRef}
                  style={styles.addInput}
                  value={newItemText}
                  onChangeText={(value) => setNewItemText(sanitizeChecklistItemText(value))}
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
        onVerified={() => {
          setShowDeletePasswordModal(false);
          confirmDelete();
        }}
        title="Password required"
        subtitle="Enter this checklist's password before deleting it."
        verifyLabel="Continue"
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
      zIndex: 20,
      opacity: 0.65,
      borderColor: colors.primary,
      ...shadow.card,
    },
    dragHandle: {
      width: 44,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      opacity: 0.65,
    },
    dropIndicator: {
      position: 'absolute',
      top: -7,
      left: 10,
      right: 10,
      zIndex: 30,
      height: 3,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
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
    deleteItemButton: { width: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full },
    pressed: { opacity: 0.68 },
    emptyState: { alignItems: 'center', gap: 6, paddingHorizontal: 24, paddingVertical: 32 },
    emptyIcon: { width: 56, height: 56, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
    emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
    emptyHint: { color: colors.textSecondary, fontSize: 14 },
    endDropIndicator: {
      minHeight: 28,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 10,
      borderRadius: radius.sm,
      backgroundColor: colors.primarySoft,
    },
    dropIndicatorLine: {
      flex: 1,
      height: 3,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
    },
    dropIndicatorText: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: '700',
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
