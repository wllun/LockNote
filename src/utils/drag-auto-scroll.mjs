export const DRAG_AUTO_SCROLL_EDGE_SIZE = 80;
export const DRAG_AUTO_SCROLL_MAX_SPEED = 480;
export const DRAG_AUTO_SCROLL_MIN_SPEED = 80;
export const DRAG_AUTO_SCROLL_ENTRY_DELAY_MS = 150;
const DRAG_AUTO_SCROLL_ENTRY_RAMP_SIZE = 12;

const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, value));

export const getDragAutoScrollVelocity = ({
  pointerY,
  viewportTop,
  viewportHeight,
  edgeSize = DRAG_AUTO_SCROLL_EDGE_SIZE,
  maxSpeed = DRAG_AUTO_SCROLL_MAX_SPEED,
  minSpeed = DRAG_AUTO_SCROLL_MIN_SPEED,
} = {}) => {
  if (
    !Number.isFinite(pointerY) ||
    !Number.isFinite(viewportTop) ||
    !Number.isFinite(viewportHeight) ||
    !Number.isFinite(edgeSize) ||
    !Number.isFinite(maxSpeed) ||
    !Number.isFinite(minSpeed) ||
    viewportHeight <= 0 ||
    edgeSize <= 0 ||
    maxSpeed <= 0
  ) return 0;

  const effectiveEdge = Math.min(edgeSize, viewportHeight / 2);
  const viewportBottom = viewportTop + viewportHeight;
  // The finger chooses the direction, not the height of the floating row.
  const topStrength = clamp((viewportTop + effectiveEdge - pointerY) / effectiveEdge, 0, 1);
  const bottomStrength = clamp((pointerY - (viewportBottom - effectiveEdge)) / effectiveEdge, 0, 1);
  if (topStrength === 0 && bottomStrength === 0) return 0;

  const speedFor = (strength) => {
    const minimum = clamp(minSpeed, 0, maxSpeed);
    const penetration = strength * effectiveEdge;
    const entryRamp = clamp(
      penetration / Math.min(DRAG_AUTO_SCROLL_ENTRY_RAMP_SIZE, effectiveEdge),
      0,
      1
    );
    return minimum * entryRamp + (maxSpeed - minimum) * strength * strength;
  };

  return topStrength > bottomStrength
    ? -speedFor(topStrength)
    : speedFor(bottomStrength);
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

