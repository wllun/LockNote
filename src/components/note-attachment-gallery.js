import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet,
  Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  buildInlineNoteBlocks,
  groupInlineNoteBlocks,
  MAX_NOTE_ATTACHMENTS,
  MIN_ATTACHMENT_DISPLAY_WIDTH_RATIO,
  normalizeAttachmentDisplayWidthRatio,
} from '../utils/note-attachment.mjs';
import { radius, shadow, useTheme } from '../theme';

const DRAG_ACTIVATION_DELAY_MS = 1000;
const SETTLE_SPRING = { duration: 400, dampingRatio: 0.8, reduceMotion: ReduceMotion.System };
const IMAGE_ROW_GAP = 8;

const getTextDropAnchor = (block, relativeY) => {
  const text = String(block?.text ?? '');
  const boundaries = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') boundaries.push(index + 1);
  }
  if (boundaries[boundaries.length - 1] !== text.length) boundaries.push(text.length);
  const boundaryIndex = Math.max(0, Math.min(
    boundaries.length - 1,
    Math.round(Math.max(0, Math.min(1, relativeY)) * (boundaries.length - 1))
  ));
  return block.start + boundaries[boundaryIndex];
};

const InlineAttachment = ({
  attachment,
  baseWidth,
  busy,
  readOnly,
  styles,
  onDrop,
  onLayout,
  onMoveAccessible,
  onOpen,
  onResize,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const suppressOpenRef = useRef(false);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const active = useSharedValue(0);
  const visualScale = useSharedValue(1);
  const initialDisplayRatio = normalizeAttachmentDisplayWidthRatio(attachment.display_width_ratio);
  const displayRatio = useSharedValue(initialDisplayRatio);
  const aspectRatio = Math.max(0.05, attachment.width / attachment.height);

  useEffect(() => {
    if (!isDragging) displayRatio.set(normalizeAttachmentDisplayWidthRatio(attachment.display_width_ratio));
  }, [attachment.display_width_ratio, displayRatio, isDragging]);

  const markGestureStarted = useCallback(() => {
    suppressOpenRef.current = true;
    setIsDragging(true);
  }, []);

  const markGestureFinished = useCallback(() => {
    setIsDragging(false);
    setTimeout(() => { suppressOpenRef.current = false; }, 120);
  }, []);

  const dragGesture = useMemo(() => Gesture.Pan()
    .enabled(!readOnly && !busy)
    .activateAfterLongPress(DRAG_ACTIVATION_DELAY_MS)
    .shouldCancelWhenOutside(false)
    .onStart(() => {
      active.set(1);
      visualScale.set(0.96);
      scheduleOnRN(markGestureStarted);
    })
    .onUpdate((event) => {
      translateX.set(event.translationX);
      translateY.set(event.translationY);
    })
    .onEnd((event) => {
      scheduleOnRN(onDrop, attachment.id, event.translationX, event.translationY);
    })
    .onFinalize(() => {
      active.set(0);
      translateX.set(withSpring(0, SETTLE_SPRING));
      translateY.set(withSpring(0, SETTLE_SPRING));
      visualScale.set(withSpring(1, SETTLE_SPRING));
      scheduleOnRN(markGestureFinished);
    }), [active, attachment.id, busy, markGestureFinished, markGestureStarted, onDrop, readOnly, translateX, translateY, visualScale]);

  const resizeGesture = useMemo(() => Gesture.Pan()
    .enabled(!readOnly && !busy)
    .shouldCancelWhenOutside(false)
    .onStart(() => {
      active.set(1);
      visualScale.set(1);
      scheduleOnRN(markGestureStarted);
    })
    .onUpdate((event) => {
      const widthDeltaFromY = event.translationY * aspectRatio;
      const widthDelta = Math.abs(event.translationX) >= Math.abs(widthDeltaFromY)
        ? event.translationX
        : widthDeltaFromY;
      displayRatio.set(Math.max(
        MIN_ATTACHMENT_DISPLAY_WIDTH_RATIO,
        Math.min(1, initialDisplayRatio + widthDelta / baseWidth)
      ));
      visualScale.set(displayRatio.get() / initialDisplayRatio);
    })
    .onEnd(() => {
      scheduleOnRN(onResize, attachment.id, displayRatio.get());
    })
    .onFinalize(() => {
      active.set(0);
      visualScale.set(withSpring(1, SETTLE_SPRING));
      scheduleOnRN(markGestureFinished);
    }), [active, aspectRatio, attachment.id, baseWidth, busy, displayRatio, initialDisplayRatio, markGestureFinished, markGestureStarted, onResize, readOnly, visualScale]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: baseWidth * initialDisplayRatio,
    height: (baseWidth * initialDisplayRatio) / aspectRatio,
    zIndex: active.get() ? 20 : 0,
    opacity: active.get() ? 0.92 : 1,
    transform: [
      { translateX: translateX.get() },
      { translateY: translateY.get() },
      { scale: visualScale.get() },
    ],
  }));

  return (
    <GestureDetector gesture={dragGesture}>
      <Animated.View
        style={[styles.imageBlock, animatedStyle, isDragging && styles.inlineImageDragging]}
        onLayout={onLayout}
        collapsable={false}
      >
          <Pressable
            onPress={() => {
              if (!suppressOpenRef.current) onOpen(attachment.id);
            }}
            style={({ pressed }) => [styles.inlineImageButton, pressed && !isDragging && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Open attached image"
            accessibilityHint={readOnly ? 'This shared note is view only' : 'Hold for one second, then drag to move. Use the bottom-right handle to resize.'}
            accessibilityActions={readOnly ? [] : [
              { name: 'decrement', label: 'Move image earlier' },
              { name: 'increment', label: 'Move image later' },
            ]}
            onAccessibilityAction={({ nativeEvent }) => {
              if (nativeEvent.actionName === 'decrement') onMoveAccessible?.(attachment.id, 'up');
              if (nativeEvent.actionName === 'increment') onMoveAccessible?.(attachment.id, 'down');
            }}
          >
            <Image
              source={{ uri: attachment.local_uri }}
              style={styles.inlineImage}
              resizeMode="contain"
              accessibilityLabel="Image attached to this note"
            />
            <View style={styles.imageBadge} pointerEvents="none">
              <Ionicons name="expand-outline" size={16} color="#ffffff" />
            </View>
            {!readOnly && (
              <View style={styles.dragBadge} pointerEvents="none">
                <Ionicons name="reorder-three" size={21} color="#ffffff" />
              </View>
            )}
          </Pressable>
          {!readOnly && (
            <GestureDetector gesture={resizeGesture}>
              <View
                style={styles.resizeHandle}
                accessibilityRole="adjustable"
                accessibilityLabel="Resize image"
                accessibilityHint="Drag diagonally to resize while keeping the original proportions"
                accessibilityActions={[
                  { name: 'increment', label: 'Make image larger' },
                  { name: 'decrement', label: 'Make image smaller' },
                ]}
                onAccessibilityAction={({ nativeEvent }) => {
                  if (nativeEvent.actionName === 'increment') {
                    onResize?.(attachment.id, Math.min(1, initialDisplayRatio + 0.1));
                  }
                  if (nativeEvent.actionName === 'decrement') {
                    onResize?.(attachment.id, Math.max(MIN_ATTACHMENT_DISPLAY_WIDTH_RATIO, initialDisplayRatio - 0.1));
                  }
                }}
              >
                <Ionicons name="resize-outline" size={18} color="#ffffff" />
              </View>
            </GestureDetector>
          )}
      </Animated.View>
    </GestureDetector>
  );
};

const NoteAttachmentGallery = forwardRef(({
  content = '', attachments = [], busy = false, readOnly = false, maxLength,
  onChangeTextBlock, onSelectionChange, onMove, onDrop, onResize, onRemove,
}, ref) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [selectedId, setSelectedId] = useState(null);
  const [inputHeights, setInputHeights] = useState({});
  const firstInputRef = useRef(null);
  const blockLayoutsRef = useRef(new Map());
  const blocks = useMemo(() => buildInlineNoteBlocks(content, attachments), [content, attachments]);
  const renderBlocks = useMemo(() => groupInlineNoteBlocks(blocks), [blocks]);
  const imageRowIdByBlockId = useMemo(() => {
    const map = new Map();
    renderBlocks.forEach((block) => {
      if (block.type === 'image-row') {
        block.blocks.forEach((imageBlock) => map.set(imageBlock.id, block.id));
      }
    });
    return map;
  }, [renderBlocks]);
  const orderedAttachments = blocks.filter((block) => block.type === 'image').map((block) => block.attachment);
  const selectedIndex = orderedAttachments.findIndex((item) => item.id === selectedId);
  const selected = selectedIndex >= 0 ? orderedAttachments[selectedIndex] : null;
  const baseImageWidth = Math.max(112, Math.min(width - 40, 720) - IMAGE_ROW_GAP);

  useImperativeHandle(ref, () => ({ focus: () => firstInputRef.current?.focus() }), []);

  useEffect(() => {
    if (selectedId && !attachments.some((item) => item.id === selectedId)) setSelectedId(null);
  }, [attachments, selectedId]);

  const saveBlockLayout = useCallback((blockId, layout) => {
    blockLayoutsRef.current.set(blockId, layout);
  }, []);

  const resolveBlockLayout = useCallback((block) => {
    const layout = blockLayoutsRef.current.get(block.id);
    if (!layout || block.type !== 'image') return layout;
    const rowLayout = blockLayoutsRef.current.get(imageRowIdByBlockId.get(block.id));
    if (!rowLayout) return null;
    return {
      ...layout,
      x: rowLayout.x + layout.x,
      y: rowLayout.y + layout.y,
    };
  }, [imageRowIdByBlockId]);

  const handleDrop = useCallback((attachmentId, translationX, translationY) => {
    const sourceBlock = blocks.find((block) => block.id === `image:${attachmentId}`);
    const source = sourceBlock ? resolveBlockLayout(sourceBlock) : null;
    if (!source) return;
    const projectedX = source.x + source.width / 2 + translationX;
    const projectedY = source.y + source.height / 2 + translationY;
    let closest = null;
    for (const block of blocks) {
      if (block.id === `image:${attachmentId}`) continue;
      const layout = resolveBlockLayout(block);
      if (!layout) continue;
      const distanceX = projectedX < layout.x
        ? layout.x - projectedX
        : projectedX > layout.x + layout.width
          ? projectedX - (layout.x + layout.width)
          : 0;
      const distanceY = projectedY < layout.y
        ? layout.y - projectedY
        : projectedY > layout.y + layout.height
          ? projectedY - (layout.y + layout.height)
          : 0;
      const distance = Math.hypot(distanceX, distanceY);
      if (!closest || distance < closest.distance) closest = { block, layout, distance };
    }
    if (!closest) return;
    if (closest.block.type === 'image') {
      const targetCenterX = closest.layout.x + closest.layout.width / 2;
      const targetCenterY = closest.layout.y + closest.layout.height / 2;
      const isWithinTargetRow = projectedY >= closest.layout.y
        && projectedY <= closest.layout.y + closest.layout.height;
      onDrop?.(attachmentId, {
        targetAttachmentId: closest.block.attachment.id,
        placement: isWithinTargetRow
          ? (projectedX < targetCenterX ? 'before' : 'after')
          : (projectedY < targetCenterY ? 'before' : 'after'),
      });
      return;
    }
    const relativeY = closest.layout.height > 0
      ? (projectedY - closest.layout.y) / closest.layout.height
      : 0;
    onDrop?.(attachmentId, { anchorOffset: getTextDropAnchor(closest.block, relativeY) });
  }, [blocks, onDrop, resolveBlockLayout]);

  return (
    <>
      <ScrollView
        style={styles.editorScroll}
        contentContainerStyle={styles.editorContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        {renderBlocks.map((block, blockIndex) => block.type === 'text' ? (
          <TextInput
            key={block.id}
            ref={blockIndex === 0 ? firstInputRef : undefined}
            value={block.text}
            editable={!readOnly}
            multiline
            scrollEnabled={false}
            maxLength={Math.max(0, (Number(maxLength) || 50000) - (content.length - block.text.length))}
            placeholder={blocks.length === 1 ? 'Start writing...' : ''}
            placeholderTextColor={colors.textTertiary}
            textAlignVertical="top"
            style={[
              styles.textBlock,
              block.id === blocks[blocks.length - 1]?.id && styles.trailingTextBlock,
              { height: Math.max(52, inputHeights[block.id] || 52) },
              readOnly && styles.readOnlyText,
            ]}
            onLayout={(event) => saveBlockLayout(block.id, event.nativeEvent.layout)}
            onChangeText={(value) => onChangeTextBlock?.(block, value)}
            onSelectionChange={(event) => onSelectionChange?.(block, event.nativeEvent.selection)}
            onContentSizeChange={(event) => {
              const nextHeight = Math.max(52, Math.ceil(event.nativeEvent.contentSize.height));
              setInputHeights((current) => Math.abs((current[block.id] || 52) - nextHeight) < 2
                ? current
                : { ...current, [block.id]: nextHeight });
            }}
            accessibilityLabel="Note text"
            accessibilityHint={readOnly ? 'This shared note is view only' : 'Type text around the images in this note'}
          />
        ) : (
          <View
            key={block.id}
            style={styles.imageRow}
            onLayout={(event) => saveBlockLayout(block.id, event.nativeEvent.layout)}
            collapsable={false}
          >
            {block.blocks.map((imageBlock) => (
              <InlineAttachment
                key={imageBlock.id}
                attachment={imageBlock.attachment}
                baseWidth={Math.min(
                  baseImageWidth,
                  560 * Math.max(0.05, imageBlock.attachment.width / imageBlock.attachment.height)
                )}
                busy={busy}
                readOnly={readOnly}
                styles={styles}
                onDrop={handleDrop}
                onLayout={(event) => saveBlockLayout(imageBlock.id, event.nativeEvent.layout)}
                onMoveAccessible={onMove}
                onOpen={setSelectedId}
                onResize={onResize}
              />
            ))}
          </View>
        ))}
        {busy && (
          <View style={styles.busyRow} accessibilityRole="progressbar">
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.busyText}>Updating image…</Text>
          </View>
        )}
        {!!attachments.length && (
          <Text style={styles.countText}>{attachments.length}/{MAX_NOTE_ATTACHMENTS} images</Text>
        )}
      </ScrollView>

      <Modal visible={!!selected} animationType="fade" transparent={false} onRequestClose={() => setSelectedId(null)}>
        <View style={[styles.viewer, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.viewerHeader}>
            <Text style={styles.viewerCounter}>{selected ? `${selectedIndex + 1} of ${attachments.length}` : ''}</Text>
            <Pressable
              onPress={() => setSelectedId(null)}
              style={({ pressed }) => [styles.viewerButton, pressed && styles.viewerButtonPressed]}
              accessibilityRole="button"
              accessibilityLabel="Close image preview"
            >
              <Ionicons name="close" size={26} color="#ffffff" />
            </Pressable>
          </View>

          <View style={styles.viewerImageArea}>
            {selected && <Image source={{ uri: selected.local_uri }} style={styles.viewerImage} resizeMode="contain" />}
          </View>

          {!readOnly && selected && (
            <View style={styles.viewerActions}>
              <Text style={styles.viewerHint}>Long-press an image in the note to move it.</Text>
              <Pressable
                onPress={() => onRemove?.(selected)}
                disabled={busy}
                style={({ pressed }) => [styles.removeButton, busy && styles.viewerButtonDisabled, pressed && styles.viewerButtonPressed]}
                accessibilityRole="button"
                accessibilityLabel="Remove image"
              >
                <Ionicons name="trash-outline" size={21} color="#ffffff" />
                <Text style={styles.viewerActionText}>Remove</Text>
              </Pressable>
            </View>
          )}
        </View>
      </Modal>
    </>
  );
});

const makeStyles = (colors) => StyleSheet.create({
  editorScroll: { flex: 1 },
  editorContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 24 },
  textBlock: { width: '100%', minHeight: 52, paddingHorizontal: 0, paddingVertical: 8, color: colors.text, fontSize: 16, lineHeight: 25 },
  trailingTextBlock: { flexGrow: 1, minHeight: 180 },
  readOnlyText: { color: colors.textSecondary },
  imageRow: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: IMAGE_ROW_GAP, paddingVertical: 8, zIndex: 1 },
  imageBlock: { maxWidth: '100%', position: 'relative', borderRadius: radius.md },
  inlineImageDragging: { borderWidth: 2, borderColor: colors.primary, ...shadow.card },
  inlineImageButton: { width: '100%', height: '100%', overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.inputBg },
  inlineImage: { width: '100%', height: '100%' },
  imageBadge: { position: 'absolute', top: 8, right: 8, width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, backgroundColor: 'rgba(9,10,13,0.58)' },
  dragBadge: { position: 'absolute', top: 8, left: 8, minWidth: 40, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, backgroundColor: 'rgba(9,10,13,0.58)' },
  resizeHandle: { position: 'absolute', right: -5, bottom: -5, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, borderWidth: 2, borderColor: '#ffffff', backgroundColor: colors.primary, ...shadow.card },
  busyRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  busyText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  countText: { alignSelf: 'flex-end', color: colors.textTertiary, fontSize: 11, fontVariant: ['tabular-nums'], paddingTop: 6 },
  pressed: { opacity: 0.75 },
  viewer: { flex: 1, backgroundColor: '#090a0d' },
  viewerHeader: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  viewerCounter: { color: '#ffffff', fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  viewerImageArea: { flex: 1, padding: 12 },
  viewerImage: { width: '100%', height: '100%' },
  viewerActions: { minHeight: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16 },
  viewerHint: { flex: 1, color: 'rgba(255,255,255,0.72)', fontSize: 13 },
  viewerButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.14)' },
  removeButton: { minWidth: 96, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14, borderRadius: radius.full, backgroundColor: '#c62828' },
  viewerActionText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  viewerButtonPressed: { opacity: 0.65 },
  viewerButtonDisabled: { opacity: 0.28 },
});

export default NoteAttachmentGallery;
