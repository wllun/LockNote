import { useCallback, useRef, useState } from 'react';
import { createEditorUndoHistory } from './editor-undo.mjs';

export const useEditorUndo = (options) => {
  const historyRef = useRef(null);
  if (!historyRef.current) {
    historyRef.current = createEditorUndoHistory(options);
  }

  const [canUndo, setCanUndo] = useState(false);

  const remember = useCallback((snapshot, groupKey = null) => {
    historyRef.current.record(snapshot, { groupKey });
    setCanUndo(historyRef.current.canUndo());
  }, []);

  const takeUndo = useCallback(() => {
    const snapshot = historyRef.current.undo();
    setCanUndo(historyRef.current.canUndo());
    return snapshot;
  }, []);

  const clearUndo = useCallback(() => {
    historyRef.current.clear();
    setCanUndo(false);
  }, []);

  return { canUndo, remember, takeUndo, clearUndo };
};
