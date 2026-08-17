export const DRAG_AUTO_SCROLL_EDGE_SIZE = 76;
export const DRAG_AUTO_SCROLL_MAX_SPEED = 760;

const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, value));

export const getDragAutoScrollVelocity = ({
  pointerY,
  viewportTop,
  viewportHeight,
  edgeSize = DRAG_AUTO_SCROLL_EDGE_SIZE,
  maxSpeed = DRAG_AUTO_SCROLL_MAX_SPEED,
} = {}) => {
  if (
    !Number.isFinite(pointerY) ||
    !Number.isFinite(viewportTop) ||
    !Number.isFinite(viewportHeight) ||
    viewportHeight <= 0 ||
    edgeSize <= 0 ||
    maxSpeed <= 0
  ) return 0;

  const effectiveEdge = Math.min(edgeSize, viewportHeight / 2);
  const viewportBottom = viewportTop + viewportHeight;
  if (pointerY < viewportTop + effectiveEdge) {
    const strength = clamp(
      (viewportTop + effectiveEdge - pointerY) / effectiveEdge,
      0,
      1
    );
    return -maxSpeed * strength * strength;
  }
  if (pointerY > viewportBottom - effectiveEdge) {
    const strength = clamp(
      (pointerY - (viewportBottom - effectiveEdge)) / effectiveEdge,
      0,
      1
    );
    return maxSpeed * strength * strength;
  }
  return 0;
};

export const getEffectiveDragTranslation = (
  gestureTranslation,
  currentScrollOffset,
  dragStartScrollOffset
) =>
  (Number(gestureTranslation) || 0) +
  (Number(currentScrollOffset) || 0) -
  (Number(dragStartScrollOffset) || 0);

export const clampDragScrollOffset = (offset, contentHeight, viewportHeight) =>
  clamp(
    Number(offset) || 0,
    0,
    Math.max(0, (Number(contentHeight) || 0) - (Number(viewportHeight) || 0))
  );

