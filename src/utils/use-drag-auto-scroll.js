import { useCallback, useEffect, useRef } from 'react';
import {
  clampDragScrollOffset,
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
  const viewportRef = useRef({ top: 0, height: 0 });
  const contentHeightRef = useRef(0);
  const scrollOffsetRef = useRef(0);
  const dragStartOffsetRef = useRef(0);
  const animationFrameRef = useRef(null);
  const previousFrameTimeRef = useRef(null);
  const onAutoScrollRef = useRef(onAutoScroll);
  onAutoScrollRef.current = onAutoScroll;

  const refreshViewportBounds = useCallback(() => {
    const node = scrollRef.current;
    requestAnimationFrame(() => {
      if (typeof node?.measureInWindow === 'function') {
        node.measureInWindow((_x, y, _width, height) => {
          viewportRef.current = { top: y, height };
        });
        return;
      }
      if (typeof node?.getBoundingClientRect === 'function') {
        const bounds = node.getBoundingClientRect();
        viewportRef.current = { top: bounds.top, height: bounds.height };
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

    if (!blockedRef.current) {
      const velocity = getDragAutoScrollVelocity({
        pointerY: pointerYRef.current,
        viewportTop: viewportRef.current.top,
        viewportHeight: viewportRef.current.height,
      });
      if (velocity !== 0) {
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
    dragStartOffsetRef.current = scrollOffsetRef.current;
    previousFrameTimeRef.current = null;
    refreshViewportBounds();
    animationFrameRef.current = requestAnimationFrame((time) => tickRef.current?.(time));
  }, [refreshViewportBounds]);

  const stopAutoScroll = useCallback(() => {
    activeRef.current = false;
    blockedRef.current = false;
    pointerYRef.current = Number.NaN;
    previousFrameTimeRef.current = null;
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const updateAutoScrollPointer = useCallback((absoluteY, { blocked = false } = {}) => {
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

