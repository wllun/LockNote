import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { initialSyncService } from '../services/initialSync';

const InitialSyncContext = createContext(null);
const INITIAL_STATE = { userId: null, loaded: false, pending: false, visible: false, busy: false, status: 'checking', progress: {} };

export const InitialSyncProvider = ({ children }) => {
  const { session, loading, recoveringPassword, recoveringLockPassword } = useAuth();
  const userId = session?.user?.id ?? null;
  const identity = useRef(userId), generation = useRef(0), running = useRef(null), mounted = useRef(true);
  identity.current = userId;
  const ready = !loading && !recoveringPassword && !recoveringLockPassword;
  const canStart = useRef(ready); canStart.current = ready;
  const [state, setState] = useState(INITIAL_STATE);
  const start = useCallback(() => {
    const requestedUser = identity.current, revision = generation.current;
    if (!requestedUser || !canStart.current || !mounted.current) return;
    if (running.current?.userId === requestedUser && !running.current.controller.signal.aborted) return running.current.promise;
    running.current?.controller.abort();
    const task = { userId: requestedUser, controller: new AbortController(), promise: null };
    running.current = task;
    let timer;
    const current = () => mounted.current && generation.current === revision && identity.current === requestedUser;
    const refreshTimeout = () => { clearTimeout(timer); timer = setTimeout(() => { task.timedOut = true; task.controller.abort(); }, 60000); };
    refreshTimeout();
    setState({ userId: requestedUser, loaded: true, pending: true, visible: true, busy: true, status: 'syncing', progress: { phase: 'connecting' } });
    task.promise = initialSyncService.run(requestedUser, {
      signal: task.controller.signal,
      guard: () => { if (!current() || !canStart.current) throw Object.assign(new Error('Your account changed.'), { code: 'SYNC_ACCOUNT_CHANGED' }); },
      onProgress: (progress) => {
        if (!current()) return;
        refreshTimeout();
        setState((value) => ({ ...value, progress }));
      },
    }).then((result) => {
      if (current()) setState((value) => ({ ...value, pending: false, busy: false, status: 'complete', result: { notes: result.notes, folders: result.folders } }));
    }).catch((error) => {
      if (!current()) return;
      if (task.controller.signal.aborted && !task.timedOut) {
        setState((value) => ({ ...value, pending: true, busy: false, visible: false, status: 'paused' }));
      } else {
        setState((value) => ({ ...value, pending: true, busy: false, status: 'error',
          error: task.timedOut ? 'The connection took too long. Your saved notes are safe. Resume when your connection improves.'
            : error?.code === 'SYNC_EDITOR_OPEN' ? error.message : 'Sync could not finish. Saved notes are intact. Check your connection and resume.' }));
      }
    }).finally(() => { clearTimeout(timer); if (running.current === task) running.current = null; });
    return task.promise;
  }, []);

  useEffect(() => {
    let active = true;
    const revision = ++generation.current;
    running.current?.controller.abort();
    if (!ready || !userId) { setState({ ...INITIAL_STATE, userId, loaded: ready }); return () => { active = false; }; }
    setState({ ...INITIAL_STATE, userId });
    initialSyncService.read(userId).then((checkpoint) => {
      if (!active || revision !== generation.current) return;
      const pending = checkpoint?.status !== 'complete';
      setState({ ...INITIAL_STATE, userId, loaded: true, pending, visible: pending, status: pending ? 'paused' : 'complete', progress: {} });
      if (!checkpoint) start();
    }).catch(() => {
      if (active) setState({ ...INITIAL_STATE, userId, loaded: true, pending: true, visible: true, status: 'error', error: 'Could not check sync progress. Please try again.' });
    });
    return () => { active = false; };
  }, [ready, start, userId]);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; running.current?.controller.abort(); }; }, []);
  const cancel = useCallback(async () => { running.current?.controller.abort(); await running.current?.promise; }, []);
  const dismiss = useCallback(() => { setState((value) => ({ ...value, visible: false })); }, []);
  const value = state.userId === userId ? state : { ...INITIAL_STATE, userId };
  return <InitialSyncContext.Provider value={{ ...value, start, cancel, dismiss }}>{children}</InitialSyncContext.Provider>;
};

export const useInitialSync = () => useContext(InitialSyncContext) ?? { ...INITIAL_STATE, loaded: true };
