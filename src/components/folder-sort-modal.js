import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { ReduceMotion, scrollTo, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useDerivedValue, useFrameCallback, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, useTheme, useThemeMode } from '../theme';
import { FOLDER_SORT_OPTIONS, folderSortScope, getFolderMoveBounds, moveFolderInOrder, normalizeFolderSortPreferences, sortFolders } from '../utils/folder-sort.mjs';
import { folderSortPreference } from '../utils/folder-sort-preference';

const DRAG_HOLD_MS = 1000;
const SETTLE = { duration: 400, dampingRatio: 0.8, reduceMotion: ReduceMotion.System };

export const FolderSortButton = ({ onPress, disabled }) => {
  const colors = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel="Sort folders"
      accessibilityState={{ disabled }} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.primarySoft : colors.card, borderWidth: 1, borderColor: colors.border, opacity: disabled ? 0.45 : 1 })}>
      <Ionicons name="swap-vertical-outline" size={21} color={colors.primary} />
    </Pressable>
  );
};

const FolderLabel = ({ folder, count, colors, styles }) => (
  <>
    <Ionicons name="folder" size={30} color={colors.folder} />
    <View style={styles.folderLabel}>
      <Text style={styles.folderName} numberOfLines={1}>{folder.name}</Text>
      <Text style={styles.folderCount}>{count} {count === 1 ? 'note' : 'notes'}</Text>
    </View>
    {!!folder.is_pinned && <Ionicons name="pin" size={15} color={colors.primary} />}
  </>
);

const ReorderRow = ({ folder, index, itemCount, count, rowHeight, bounds, drag, colors, styles, onStart, onDrop, onCancel, onMove }) => {
  const gesture = useMemo(() => Gesture.Pan()
    .activateAfterLongPress(DRAG_HOLD_MS)
    .shouldCancelWhenOutside(false)
    .onStart((event) => {
      drag.startOffset.set(drag.offset.get());
      drag.translation.set(0);
      drag.pointer.set(event.absoluteY);
      drag.min.set(bounds.min);
      drag.max.set(bounds.max);
      drag.index.set(index);
      scheduleOnRN(onStart, folder);
    })
    .onUpdate((event) => {
      drag.translation.set(event.translationY);
      drag.pointer.set(event.absoluteY);
    })
    .onEnd(() => {
      scheduleOnRN(onDrop, folder.id, drag.target.get());
    })
    .onFinalize((_, success) => {
      if (!success) scheduleOnRN(onCancel);
    }), [bounds.max, bounds.min, drag, folder, index, onCancel, onDrop, onStart]);
  const animatedStyle = useAnimatedStyle(() => {
    const from = drag.index.get(), target = drag.target.get();
    const shift = from < 0 ? 0 : target < from && index >= target && index < from ? rowHeight
      : target > from && index > from && index <= target ? -rowHeight : 0;
    return { opacity: from === index ? 0 : 1, transform: [{ translateY: withSpring(shift, SETTLE) }] };
  });
  return (
    <Animated.View style={[styles.reorderSlot, { height: rowHeight }, animatedStyle]}>
      <View style={styles.folderRow}>
        <FolderLabel folder={folder} count={count} colors={colors} styles={styles} />
        <GestureDetector gesture={gesture}>
          <View collapsable={false} style={styles.handle} accessible accessibilityRole="adjustable"
            accessibilityLabel={`Move ${folder.name}`} accessibilityHint="Hold for one second, then drag. Use adjustment actions to move up or down."
            accessibilityValue={{ min: 1, max: itemCount, now: index + 1, text: `Position ${index + 1} of ${itemCount}` }}
            accessibilityActions={[{ name: 'increment', label: 'Move down' }, { name: 'decrement', label: 'Move up' }]}
            onAccessibilityAction={({ nativeEvent }) => onMove(folder.id, index + (nativeEvent.actionName === 'increment' ? 1 : -1))}
            {...(Platform.OS === 'web' ? { tabIndex: 0, 'aria-orientation': 'vertical', 'aria-valuemin': 1, 'aria-valuemax': itemCount,
              'aria-valuenow': index + 1, 'aria-valuetext': `Position ${index + 1} of ${itemCount}`, onKeyDown: (event) => {
              if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                event.preventDefault(); onMove(folder.id, index + (event.key === 'ArrowDown' ? 1 : -1));
              }
            } } : {})}>
            <MaterialIcons name="drag-indicator" size={25} color={colors.textSecondary} />
          </View>
        </GestureDetector>
      </View>
    </Animated.View>
  );
};

const FolderReorderList = ({ folders, counts, pinnedFirst, onChange, onDraggingChange, colors, styles }) => {
  const { fontScale } = useWindowDimensions();
  const rowHeight = Math.max(80, Math.ceil(44 + 38 * fontScale));
  const scrollRef = useAnimatedRef();
  const index = useSharedValue(-1), offset = useSharedValue(0), startOffset = useSharedValue(0);
  const translation = useSharedValue(0), pointer = useSharedValue(0), top = useSharedValue(0);
  const viewport = useSharedValue(0), content = useSharedValue(0), min = useSharedValue(0), max = useSharedValue(0);
  const [liftedFolder, setLiftedFolder] = useState(null);
  const target = useDerivedValue(() => Math.max(min.get(), Math.min(max.get(), Math.round(index.get() + (translation.get() + offset.get() - startOffset.get()) / rowHeight))));
  const drag = useMemo(() => ({ index, offset, startOffset, translation, pointer, min, max, target }), [index, offset, startOffset, translation, pointer, min, max, target]);
  const handleScroll = useAnimatedScrollHandler((event) => { offset.set(event.contentOffset.y); });
  useFrameCallback((frame) => {
    if (index.get() < 0 || viewport.get() <= 0) return;
    const relative = pointer.get() - top.get();
    const edge = Math.min(64, viewport.get() / 4);
    const velocity = relative < edge ? -Math.min(1, (edge - relative) / edge) * 420
      : relative > viewport.get() - edge ? Math.min(1, (relative - viewport.get() + edge) / edge) * 420 : 0;
    const next = Math.max(0, Math.min(Math.max(0, content.get() - viewport.get()), offset.get() + velocity * Math.min(32, frame.timeSincePreviousFrame || 16) / 1000));
    if (Math.abs(next - offset.get()) > 0.1) { scrollTo(scrollRef, 0, next, false); offset.set(next); }
  });
  const reset = useCallback(() => {
    index.set(-1); translation.set(0); setLiftedFolder(null); onDraggingChange(false);
  }, [index, onDraggingChange, translation]);
  const start = useCallback((folder) => { setLiftedFolder(folder); onDraggingChange(true); }, [onDraggingChange]);
  const move = useCallback((id, destination) => onChange((current) => moveFolderInOrder(current, id, destination, pinnedFirst)), [onChange, pinnedFirst]);
  const drop = useCallback((id, destination) => { move(id, destination); reset(); }, [move, reset]);
  const floatingStyle = useAnimatedStyle(() => ({
    opacity: index.get() < 0 ? 0 : 1,
    transform: [{ translateY: Math.max(0, Math.min(Math.max(0, viewport.get() - rowHeight), index.get() * rowHeight + 8 - startOffset.get() + translation.get())) }],
  }));
  return (
    <View style={styles.reorderViewport}>
      <Animated.ScrollView ref={scrollRef} scrollEnabled={!liftedFolder} onScroll={handleScroll} scrollEventThrottle={16}
        onLayout={({ nativeEvent }) => {
          viewport.set(nativeEvent.layout.height);
          scrollRef.current?.measureInWindow?.((_x, y) => top.set(y));
        }}
        onContentSizeChange={(_width, height) => content.set(height)} contentContainerStyle={styles.reorderContent}>
        {folders.map((folder, position) => <ReorderRow key={folder.id} folder={folder} index={position} itemCount={folders.length} count={counts[folder.id] || 0}
          rowHeight={rowHeight} bounds={getFolderMoveBounds(folders, position, pinnedFirst)} drag={drag} colors={colors} styles={styles}
          onStart={start} onDrop={drop} onCancel={reset} onMove={move} />)}
      </Animated.ScrollView>
      {liftedFolder && <Animated.View pointerEvents="none" style={[styles.floatingRow, { height: rowHeight - 10 }, floatingStyle]}>
        <FolderLabel folder={liftedFolder} count={counts[liftedFolder.id] || 0} colors={colors} styles={styles} />
        <MaterialIcons name="drag-indicator" size={25} color={colors.primary} />
      </Animated.View>}
    </View>
  );
};

// Mount only while open, so Cancel always discards a draft without changing preferences.
const FolderSortModal = ({ folders, counts, parentId = null, preferences, onClose }) => {
  const colors = useTheme();
  const { scheme } = useThemeMode();
  const onPrimary = scheme === 'dark' ? colors.background : colors.card;
  const styles = useMemo(() => makeStyles(colors, onPrimary), [colors, onPrimary]);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [draft, setDraft] = useState(() => normalizeFolderSortPreferences(preferences));
  const [mode, setMode] = useState('sort');
  const [order, setOrder] = useState([]);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);
  const close = () => { if (!savingRef.current && !dragging) mode === 'custom' ? setMode('sort') : onClose(); };
  const beginCustom = () => {
    const hasOrder = draft.orders[folderSortScope(parentId)]?.length > 0;
    setOrder(sortFolders(folders, hasOrder ? { ...draft, sortBy: 'custom' } : draft, counts));
    setError(''); setMode('custom');
  };
  const save = async (custom = false) => {
    if (savingRef.current || dragging) return;
    savingRef.current = true; setSaving(true); setError('');
    try {
      await folderSortPreference.save(custom ? { ...draft, sortBy: 'custom' } : draft, custom ? { parentId, ids: order.map((folder) => folder.id) } : undefined);
      onClose();
    } catch { setError('Could not save the folder order. Please try again.'); }
    finally { savingRef.current = false; setSaving(false); }
  };
  return (
    <Modal visible transparent animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={close}>
      <GestureHandlerRootView style={[styles.overlay, Platform.OS === 'web' && styles.webOverlay,
        { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom + 8, 16) }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessible={false} />
        <View style={[styles.panel, { maxHeight: height - insets.top - Math.max(insets.bottom + 8, 16) - 24 }, mode === 'custom' && { height: Math.min(680, height - insets.top - insets.bottom - 40) }]}
          accessibilityViewIsModal accessibilityLabel={mode === 'custom' ? 'Reorder folders' : 'Sort folders'}
          {...(Platform.OS === 'web' ? { role: 'dialog', 'aria-modal': true } : {})}>
          {mode === 'custom' ? <>
            <View style={styles.header}>
              <Pressable onPress={close} disabled={saving || dragging} style={({ pressed }) => [styles.textButton, pressed && styles.pressed]} accessibilityRole="button"><Text style={styles.link}>Cancel</Text></Pressable>
              <Text style={styles.title}>Reorder folders</Text>
              <Pressable onPress={() => save(true)} disabled={saving || dragging} style={({ pressed }) => [styles.textButton, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Save custom folder order">
                {saving ? <ActivityIndicator color={colors.primary} /> : <Text style={[styles.link, dragging && styles.disabled]}>Done</Text>}
              </Pressable>
            </View>
            <Text style={styles.hint}>{Platform.OS === 'web' ? 'Hold a handle for 1 second and drag, or use arrow keys.' : 'Hold a handle for 1 second, then drag.'}</Text>
            <FolderReorderList folders={order} counts={counts} pinnedFirst={draft.pinnedFirst} onChange={setOrder} onDraggingChange={setDragging} colors={colors} styles={styles} />
            {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
            <Text style={styles.footerHint}>{draft.pinnedFirst ? 'Pinned folders stay on top. Only folders are reordered.' : 'Only folders in this section are reordered.'}</Text>
          </> : <>
            <View style={styles.header}>
              <Text style={[styles.title, styles.sortTitle]}>Sort folders</Text>
              <Pressable onPress={close} disabled={saving} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Close sort folders"><Ionicons name="close" size={23} color={colors.textSecondary} /></Pressable>
            </View>
            <ScrollView style={styles.optionsScroll} contentContainerStyle={styles.optionsContent}>
              <View accessibilityRole="radiogroup" accessibilityLabel="Sort folders by">
                {FOLDER_SORT_OPTIONS.map((option) => <Pressable key={option.value} disabled={saving || (option.value === 'custom' && !folders.length)}
                  onPress={() => option.value === 'custom' ? beginCustom() : setDraft((value) => ({ ...value, sortBy: option.value }))}
                  style={({ pressed }) => [styles.option, pressed && styles.pressed]}
                  accessibilityLabel={option.label} accessibilityRole={option.value === 'custom' ? 'button' : 'radio'} accessibilityState={{ checked: draft.sortBy === option.value, disabled: saving || (option.value === 'custom' && !folders.length) }}
                  {...(Platform.OS === 'web' && option.value !== 'custom' ? { 'aria-checked': draft.sortBy === option.value } : {})}>
                  <Ionicons name={draft.sortBy === option.value ? 'radio-button-on' : 'radio-button-off'} size={23} color={draft.sortBy === option.value ? colors.primary : colors.textSecondary} />
                  <Text style={styles.optionLabel}>{option.label}</Text>
                  {option.value === 'custom' && <Ionicons name="chevron-forward" size={19} color={colors.textSecondary} />}
                </Pressable>)}
              </View>
              {draft.sortBy !== 'custom' && <View style={styles.settingGroup}>
                <Text style={styles.settingLabel}>Sort direction</Text>
                <View style={styles.directions} accessibilityRole="radiogroup" accessibilityLabel="Sort direction">
                  {[['asc', 'Ascending'], ['desc', 'Descending']].map(([value, label]) => <Pressable key={value} disabled={saving} accessibilityRole="radio" accessibilityState={{ checked: draft.direction === value }}
                    {...(Platform.OS === 'web' ? { 'aria-checked': draft.direction === value } : {})}
                    onPress={() => setDraft((current) => ({ ...current, direction: value }))} style={({ pressed }) => [styles.direction, draft.direction === value && styles.directionSelected, pressed && styles.disabled]}>
                    <Text style={[styles.directionText, draft.direction === value && styles.directionTextSelected]}>{label}</Text>
                  </Pressable>)}
                </View>
              </View>}
              <View style={[styles.settingGroup, styles.pinSetting]}>
                <Text style={styles.pinLabel}>Keep pinned on top</Text>
                <Switch value={draft.pinnedFirst} disabled={saving} onValueChange={(value) => setDraft((current) => ({ ...current, pinnedFirst: value }))}
                  trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" hitSlop={12}
                  {...(Platform.OS === 'web' ? { activeThumbColor: '#FFFFFF' } : {})} accessibilityLabel="Keep pinned folders on top" />
              </View>
            </ScrollView>
            <View style={styles.footer}>
              {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
              <Pressable onPress={() => save()} disabled={saving} style={({ pressed }) => [styles.apply, pressed && styles.disabled]} accessibilityRole="button" accessibilityState={{ busy: saving, disabled: saving }}>
                {saving ? <ActivityIndicator color={onPrimary} /> : <Text style={styles.applyText}>Apply</Text>}
              </Pressable>
            </View>
          </>}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
};

const makeStyles = (colors, onPrimary) => StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 16, backgroundColor: colors.backdrop },
  webOverlay: { justifyContent: 'center', alignItems: 'center' },
  panel: { width: '100%', maxWidth: 480, alignSelf: 'center', borderRadius: radius.lg, backgroundColor: colors.card, overflow: 'hidden', borderColor: colors.border, borderWidth: 1 },
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, gap: 4 },
  title: { fontSize: 18, fontWeight: '700', color: colors.text, flexShrink: 1 },
  sortTitle: { paddingLeft: 10 },
  textButton: { minWidth: 60, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  link: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  optionsScroll: { flexShrink: 1 },
  optionsContent: { paddingHorizontal: 18 },
  option: { minHeight: 50, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 8 },
  optionLabel: { flex: 1, color: colors.text, fontSize: 16 },
  pressed: { backgroundColor: colors.inputBg },
  settingGroup: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16, marginTop: 12 },
  settingLabel: { color: colors.textSecondary, fontSize: 13, marginBottom: 8, fontWeight: '600' },
  directions: { flexDirection: 'row', padding: 3, borderRadius: 10, backgroundColor: colors.inputBg },
  direction: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', padding: 8, borderRadius: 8 },
  directionSelected: { backgroundColor: colors.primary },
  directionText: { fontSize: 14, color: colors.textSecondary },
  directionTextSelected: { color: onPrimary, fontWeight: '600' },
  pinSetting: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 4, minHeight: 60 },
  pinLabel: { fontSize: 15, color: colors.text, flex: 1 },
  footer: { padding: 18, gap: 8 },
  apply: { minHeight: 48, backgroundColor: colors.primary, borderRadius: 10, alignItems: 'center', justifyContent: 'center', padding: 12 },
  applyText: { color: onPrimary, fontSize: 16, fontWeight: '700' },
  hint: { color: colors.textSecondary, fontSize: 13, paddingHorizontal: 18, paddingBottom: 12, lineHeight: 19 },
  footerHint: { color: colors.textSecondary, fontSize: 12, padding: 16, lineHeight: 18 },
  error: { color: colors.danger, fontSize: 13, paddingHorizontal: 8, lineHeight: 18 },
  disabled: { opacity: 0.5 },
  reorderViewport: { flex: 1, overflow: 'hidden' },
  reorderContent: { paddingVertical: 8, paddingHorizontal: 16 },
  reorderSlot: { paddingBottom: 10 },
  folderRow: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 4, gap: 12 },
  folderLabel: { flex: 1, minWidth: 0, gap: 4 },
  folderName: { color: colors.text, fontSize: 16, fontWeight: '600' },
  folderCount: { color: colors.textSecondary, fontSize: 13 },
  handle: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 8, ...(Platform.OS === 'web' ? { cursor: 'grab', touchAction: 'none' } : {}) },
  floatingRow: { position: 'absolute', left: 16, right: 16, top: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primarySoft, boxShadow: '0 4px 12px rgba(0,0,0,0.14)' },
});

export default FolderSortModal;
