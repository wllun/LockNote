import { useCallback, useEffect, useRef } from 'react';
import {
  clampDragScrollOffset,
  DRAG_AUTO_SCROLL_ENTRY_DELAY_MS,
  getDragAutoScrollVelocity,
  getEffectiveDragTranslation,
} from './drag-auto-scroll.mjs';

export const useDragAutoScroll = ({
  scrollRef,
  mode = 'scroll-view',
  onAutoScroll,
}) => {
  const activeRef = useRef(false);
  const blockedRef = useRef(false);
  const pointerYRef = useRef(Number.NaN);
  const viewportRef = useRef({ top: Number.NaN, height: 0 });
  const viewportReadyRef = useRef(false);
  const measurementVersionRef = useRef(0);
  const edgeEntryRef = useRef({ direction: 0, timestamp: 0 });
  const contentHeightRef = useRef(0);
  const scrollOffsetRef = useRef(0);
  const dragStartOffsetRef = useRef(0);
  const animationFrameRef = useRef(null);
  const previousFrameTimeRef = useRef(null);
  const onAutoScrollRef = useRef(onAutoScroll);
  onAutoScrollRef.current = onAutoScroll;

  const refreshViewportBounds = useCallback(() => {
    const version = ++measurementVersionRef.current;
    viewportReadyRef.current = false;
    edgeEntryRef.current.direction = 0;
    requestAnimationFrame(() => {
      if (version !== measurementVersionRef.current) return;
      const list = scrollRef.current;
      // FlatList is a composite wrapper; measure its actual scroll viewport.
      const node = list?.getNativeScrollRef?.() ?? list;
      const storeBounds = (top, height) => {
        if (version !== measurementVersionRef.current ||
          !Number.isFinite(top) || !Number.isFinite(height) || height <= 0) return;
        viewportRef.current = { top, height };
        viewportReadyRef.current = true;
      };
      if (typeof node?.measureInWindow === 'function') {
        node.measureInWindow((_x, y, _width, height) => {
          storeBounds(y, height);
        });
        return;
      }
      if (typeof node?.getBoundingClientRect === 'function') {
        const bounds = node.getBoundingClientRect();
        storeBounds(bounds.top, bounds.height);
      }
    });
  }, [scrollRef]);

  const scrollToOffset = useCallback((offset) => {
    const node = scrollRef.current;
    if (mode === 'flat-list') {
      node?.scrollToOffset?.({ offset, animated: false });
    } else {
      node?.scrollTo?.({ y: offset, animated: false });
    }
  }, [mode, scrollRef]);

  const tickRef = useRef(null);
  tickRef.current = (timestamp) => {
    if (!activeRef.current) return;
    const previousTime = previousFrameTimeRef.current ?? timestamp;
    const elapsedSeconds = Math.min(0.034, Math.max(0, timestamp - previousTime) / 1000);
    previousFrameTimeRef.current = timestamp;

    if (!blockedRef.current && viewportReadyRef.current) {
      const velocity = getDragAutoScrollVelocity({
        pointerY: pointerYRef.current,
        viewportTop: viewportRef.current.top,
        viewportHeight: viewportRef.current.height,
      });
      const direction = Math.sign(velocity);
      if (direction !== edgeEntryRef.current.direction) {
        edgeEntryRef.current = { direction, timestamp };
      }
      if (direction !== 0 && timestamp - edgeEntryRef.current.timestamp >= DRAG_AUTO_SCROLL_ENTRY_DELAY_MS) {
        const nextOffset = clampDragScrollOffset(
          scrollOffsetRef.current + velocity * elapsedSeconds,
          contentHeightRef.current,
          viewportRef.current.height
        );
        if (Math.abs(nextOffset - scrollOffsetRef.current) >= 0.1) {
          scrollOffsetRef.current = nextOffset;
          scrollToOffset(nextOffset);
          onAutoScrollRef.current?.({
            offset: nextOffset,
            scrollDelta: nextOffset - dragStartOffsetRef.current,
            pointerY: pointerYRef.current,
          });
        }
      }
    } else {
      edgeEntryRef.current.direction = 0;
    }
    animationFrameRef.current = requestAnimationFrame((time) => tickRef.current?.(time));
  };

  const startAutoScroll = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    activeRef.current = true;
    blockedRef.current = false;
    pointerYRef.current = Number.NaN;
    edgeEntryRef.current.direction = 0;
    dragStartOffsetRef.current = scrollOffsetRef.current;
    previousFrameTimeRef.current = null;
    refreshViewportBounds();
    animationFrameRef.current = requestAnimationFrame((time) => tickRef.current?.(time));
  }, [refreshViewportBounds]);

  const stopAutoScroll = useCallback(() => {
    activeRef.current = false;
    blockedRef.current = false;
    pointerYRef.current = Number.NaN;
    edgeEntryRef.current.direction = 0;
    measurementVersionRef.current += 1;
    previousFrameTimeRef.current = null;
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const updateAutoScrollPointer = useCallback((absoluteY, {
    blocked = false,
  } = {}) => {
    pointerYRef.current = absoluteY;
    blockedRef.current = blocked;
  }, []);

  const getEffectiveTranslation = useCallback((gestureTranslation) =>
    getEffectiveDragTranslation(
      gestureTranslation,
      scrollOffsetRef.current,
      dragStartOffsetRef.current
    ), []);

  const handleScroll = useCallback(({ nativeEvent }) => {
    scrollOffsetRef.current = nativeEvent.contentOffset?.y ?? 0;
  }, []);

  const handleViewportLayout = useCallback(({ nativeEvent }) => {
    viewportRef.current = {
      ...viewportRef.current,
      height: nativeEvent.layout.height,
    };
    refreshViewportBounds();
  }, [refreshViewportBounds]);

  const handleContentSizeChange = useCallback((_width, height) => {
    contentHeightRef.current = height;
  }, []);

  useEffect(() => stopAutoScroll, [stopAutoScroll]);

  return {
    getEffectiveTranslation,
    handleContentSizeChange,
    handleScroll,
    handleViewportLayout,
    refreshViewportBounds,
    startAutoScroll,
    stopAutoScroll,
    updateAutoScrollPointer,
  };
};

