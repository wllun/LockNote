const cloneSnapshot = (snapshot) => JSON.parse(JSON.stringify(snapshot));

export const createEditorUndoHistory = ({
  limit = 50,
  groupWindowMs = 800,
} = {}) => {
  const maxEntries = Math.max(1, Math.floor(limit));
  const typingWindow = Math.max(0, groupWindowMs);
  const entries = [];
  const redoEntries = [];
  let lastGroupKey = null;
  let lastRecordedAt = 0;

  const resetGrouping = () => {
    lastGroupKey = null;
    lastRecordedAt = 0;
  };

  const pushCapped = (target, snapshot) => {
    target.push(cloneSnapshot(snapshot));
    if (target.length > maxEntries) target.shift();
  };

  return {
    record(snapshot, { groupKey = null, now = Date.now() } = {}) {
      const isGroupedChange =
        groupKey !== null &&
        groupKey === lastGroupKey &&
        now - lastRecordedAt <= typingWindow;

      lastGroupKey = groupKey;
      lastRecordedAt = now;
      if (isGroupedChange) return false;

      pushCapped(entries, snapshot);
      redoEntries.length = 0;
      return true;
    },

    undo(currentSnapshot) {
      const snapshot = entries.pop();
      resetGrouping();
      if (snapshot !== undefined && currentSnapshot !== undefined) {
        pushCapped(redoEntries, currentSnapshot);
      }
      return snapshot === undefined ? null : cloneSnapshot(snapshot);
    },

    redo(currentSnapshot) {
      const snapshot = redoEntries.pop();
      resetGrouping();
      if (snapshot !== undefined && currentSnapshot !== undefined) {
        pushCapped(entries, currentSnapshot);
      }
      return snapshot === undefined ? null : cloneSnapshot(snapshot);
    },

    clear() {
      entries.length = 0;
      redoEntries.length = 0;
      resetGrouping();
    },

    canUndo() {
      return entries.length > 0;
    },

    canRedo() {
      return redoEntries.length > 0;
    },

    size() {
      return entries.length;
    },

    redoSize() {
      return redoEntries.length;
    },
  };
};
