// Coordination only, not a store for note data. Editors keep their own drafts.
let editors = 0;
const listeners = new Set();
export const hasOpenSyncEditor = () => editors > 0;
export const subscribeSyncEditorActivity = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const holdSyncEditor = () => {
  editors += 1;
  listeners.forEach((listener) => listener());
  let released = false;
  return () => {
    if (released) return;
    released = true;
    editors -= 1;
    listeners.forEach((listener) => listener());
  };
};

const syncListeners = new Set();
export const subscribeSyncEvents = (listener) => {
  syncListeners.add(listener);
  return () => syncListeners.delete(listener);
};
export const emitSyncEvent = (event) => {
  syncListeners.forEach((listener) => {
    try { listener(event); } catch (error) { console.warn('Sync listener failed:', error); }
  });
};
