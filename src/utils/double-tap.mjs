export const DOUBLE_TAP_MAX_DELAY_MS = 400;

export function registerDoubleTap(
  previousTap,
  { targetId, timestamp = Date.now() },
  maxDelayMs = DOUBLE_TAP_MAX_DELAY_MS
) {
  const nextTimestamp = Number(timestamp);
  const nextTap = {
    targetId: String(targetId ?? ''),
    timestamp: Number.isFinite(nextTimestamp) ? nextTimestamp : Date.now(),
  };
  const delay = nextTap.timestamp - Number(previousTap?.timestamp);
  const isDoubleTap = previousTap?.targetId === nextTap.targetId
    && Number.isFinite(delay)
    && delay >= 0
    && delay <= maxDelayMs;

  return {
    isDoubleTap,
    nextTap: isDoubleTap ? null : nextTap,
  };
}
