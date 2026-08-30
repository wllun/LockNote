import { useCallback, useRef, useState } from 'react';
import { createEditorUndoHistory } from './editor-undo.mjs';

export const useEditorUndo = (options) => {
  const historyRef = useRef(null);
  if (!historyRef.current) {
    historyRef.current = createEditorUndoHistory(options);
  }

  const [availability, setAvailability] = useState({ canUndo: false, canRedo: false });

  const syncAvailability = useCallback(() => {
    setAvailability({
      canUndo: historyRef.current.canUndo(),
      canRedo: historyRef.current.canRedo(),
    });
  }, []);

  const remember = useCallback((snapshot, groupKey = null) => {
    historyRef.current.record(snapshot, { groupKey });
    syncAvailability();
  }, [syncAvailability]);

  const takeUndo = useCallback((currentSnapshot) => {
    const snapshot = historyRef.current.undo(currentSnapshot);
    syncAvailability();
    return snapshot;
  }, [syncAvailability]);

  const takeRedo = useCallback((currentSnapshot) => {
    const snapshot = historyRef.current.redo(currentSnapshot);
    syncAvailability();
    return snapshot;
  }, [syncAvailability]);

  const clearUndo = useCallback(() => {
    historyRef.current.clear();
    syncAvailability();
  }, [syncAvailability]);

  return {
    ...availability,
    remember,
    takeUndo,
    takeRedo,
    clearUndo,
  };
};
