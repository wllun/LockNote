const cloneSnapshot = (snapshot) => JSON.parse(JSON.stringify(snapshot));

export const createEditorUndoHistory = ({
  limit = 50,
  groupWindowMs = 800,
} = {}) => {
  const maxEntries = Math.max(1, Math.floor(limit));
  const typingWindow = Math.max(0, groupWindowMs);
  const entries = [];
  let lastGroupKey = null;
  let lastRecordedAt = 0;

  const resetGrouping = () => {
    lastGroupKey = null;
    lastRecordedAt = 0;
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

      entries.push(cloneSnapshot(snapshot));
      if (entries.length > maxEntries) entries.shift();
      return true;
    },

    undo() {
      const snapshot = entries.pop();
      resetGrouping();
      return snapshot === undefined ? null : cloneSnapshot(snapshot);
    },

    clear() {
      entries.length = 0;
      resetGrouping();
    },

    canUndo() {
      return entries.length > 0;
    },

    size() {
      return entries.length;
    },
  };
};
