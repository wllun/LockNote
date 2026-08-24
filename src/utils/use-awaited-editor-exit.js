import { useEffect, useRef, useState } from 'react';
import { usePreventRemove } from '@react-navigation/native';

// React Navigation focuses the previous screen as soon as a route is removed.
// Await draft cleanup first so its focus reload cannot race an empty-note delete
// or the editor's final debounced save.
export const useAwaitedEditorExit = ({ navigation, needsCleanup, cleanup }) => {
  const needsCleanupRef = useRef(needsCleanup);
  const cleanupRef = useRef(cleanup);
  const cleanupSettledRef = useRef(false);
  const pendingActionRef = useRef(null);
  const [removalAllowed, setRemovalAllowed] = useState(false);

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

  useEffect(() => () => {
    if (cleanupSettledRef.current) return;
    Promise.resolve(cleanupRef.current())
      .catch((error) => console.error('Editor unmount cleanup failed:', error));
  }, []);
};
