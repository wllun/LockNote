export const AUTO_SYNC_INTERVAL_MS = 60000;
export const AUTO_SYNC_RETRY_BASE_MS = 15000;

// Platform-independent scheduling so offline/account/editor races are testable.
export const createAutomaticSyncController = ({
  sync, isEditorOpen = () => false, onState = () => {},
  setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now,
}) => {
  let context = {};
  let generation = 0;
  let timer = null;
  let running = false;
  let disposed = false;
  let retries = 0;
  let state = { status: 'off', error: null, retryAt: null };
  const publish = (patch) => {
    state = { ...state, ...patch, userId: context.userId ?? null };
    onState(state);
  };
  const permitted = () => !disposed && context.ready && context.userId
    && context.enabled && context.eligible && context.online === true && context.active;
  const waitingStatus = () => !context.userId || !context.enabled ? 'off'
    : !context.ready ? 'loading' : !context.eligible ? 'paused-plan'
      : context.online !== true ? 'offline' : !context.active ? 'background'
        : isEditorOpen() ? 'waiting-editor' : 'idle';
  const cancelTimer = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const schedule = (delay) => {
    cancelTimer();
    if (!permitted() || isEditorOpen() || running) return;
    timer = setTimer(() => { timer = null; void run(); }, delay);
  };
  const run = async () => {
    if (!permitted() || isEditorOpen() || running) {
      if (!running) publish({ status: waitingStatus() });
      return;
    }
    const requestedGeneration = generation;
    const userId = context.userId;
    running = true;
    publish({ status: 'syncing', retryAt: null });
    let delay = AUTO_SYNC_INTERVAL_MS;
    try {
      const result = await sync(userId, () => requestedGeneration === generation
        && permitted() && !isEditorOpen());
      if (disposed || requestedGeneration !== generation) return;
      retries = 0;
      publish({ status: result?.recoveryOnly ? 'recovery-only' : 'idle', error: null,
        lastSyncAt: result?.syncedAt ?? state.lastSyncAt, retryAt: null });
      if (result?.recoveryOnly) delay = 300000;
    } catch (error) {
      if (disposed || requestedGeneration !== generation) return;
      if (error?.code === 'SYNC_DEFERRED') {
        publish({ status: waitingStatus(), retryAt: null });
      } else if (error?.code === 'PREMIUM_REQUIRED') {
        publish({ status: 'paused-plan', error: null, retryAt: null });
        delay = 300000;
      } else {
        delay = Math.min(300000, AUTO_SYNC_RETRY_BASE_MS * (2 ** Math.min(retries++, 5)));
        publish({ status: 'retrying', error, retryAt: now() + delay });
      }
    } finally {
      running = false;
      if (!disposed) schedule(requestedGeneration === generation ? delay : 1500);
    }
  };
  return {
    configure(next) {
      if (disposed) return;
      const previous = context;
      const identityChanged = previous.userId !== next.userId;
      const changed = Object.keys({ ...previous, ...next }).some((key) => previous[key] !== next[key]);
      context = { ...next };
      if (!changed) return;
      generation += 1;
      retries = 0;
      cancelTimer();
      if (identityChanged) state = { status: 'off', error: null, retryAt: null, lastSyncAt: null };
      publish({ status: waitingStatus(), error: null, retryAt: null });
      schedule(1500);
    },
    request() {
      if (disposed || running) return;
      publish({ status: waitingStatus() });
      schedule(1500);
    },
    run,
    dispose() { disposed = true; generation += 1; cancelTimer(); },
    getState: () => state,
  };
};
