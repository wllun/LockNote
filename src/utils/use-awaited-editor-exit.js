import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePreventRemove } from '@react-navigation/native';
import { holdSyncEditor } from '../services/syncActivity.mjs';

// React Navigation focuses the previous screen as soon as a route is removed.
// Await draft cleanup first so its focus reload cannot race an empty-note delete
// or the editor's final debounced save.
export const useAwaitedEditorExit = ({ navigation, needsCleanup, cleanup }) => {
  const needsCleanupRef = useRef(needsCleanup);
  const cleanupRef = useRef(cleanup);
  const cleanupSettledRef = useRef(false);
  const pendingActionRef = useRef(null);
  const [removalAllowed, setRemovalAllowed] = useState(false);

  // Keep sync paused until the draft's final save/empty-draft cleanup settles,
  // including app teardown where navigation's exit guard cannot run.
  useLayoutEffect(() => {
    const releaseSync = holdSyncEditor();
    return () => {
      if (cleanupSettledRef.current || !needsCleanupRef.current()) {
        releaseSync();
        return;
      }
      Promise.resolve().then(() => cleanupRef.current())
        .catch((error) => console.error('Editor unmount cleanup failed:', error))
        .finally(releaseSync);
    };
  }, []);

  needsCleanupRef.current = needsCleanup;
  cleanupRef.current = cleanup;

  const shouldPreventRemove = !removalAllowed && needsCleanupRef.current();

  usePreventRemove(shouldPreventRemove, ({ data }) => {
    pendingActionRef.current = data.action;
    Promise.resolve(cleanupRef.current())
      .catch((error) => console.error('Editor exit cleanup failed:', error))
      .finally(() => {
        cleanupSettledRef.current = true;
        setRemovalAllowed(true);
      });
  });

  useEffect(() => {
    if (!removalAllowed || !pendingActionRef.current) return;
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    navigation.dispatch(action);
  }, [navigation, removalAllowed]);
};
