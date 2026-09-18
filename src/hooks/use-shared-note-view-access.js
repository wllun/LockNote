import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { useAuth } from '../context/AuthContext';
import { collaborationService } from '../services/collaborationService';
import { getNetworkAvailability } from '../utils/network-availability.mjs';

const RECHECK_MS = 30_000;

export const useSharedNoteViewAccess = (noteId, enabled, onUnavailable) => {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const online = getNetworkAvailability(useNetInfo());
  const [appState, setAppState] = useState(AppState.currentState);
  const [access, setAccess] = useState(null);
  const callbackRef = useRef(onUnavailable);
  callbackRef.current = onUnavailable;

  useEffect(() => {
    if (!enabled) return undefined;
    const listener = AppState.addEventListener('change', setAppState);
    return () => listener.remove();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    let inFlight = false;
    let timer = null;
    let expiryTimer = null;
    let requestTimer = null;
    const publish = (next) => {
      if (!alive) return;
      setAccess({ ...next, noteId, userId });
      if (!next.canView && next.status !== 'checking') {
        collaborationService.discardStagedDraft(noteId);
        callbackRef.current?.({ collaborative: true, canView: false, canEdit: false, status: next.status });
      }
    };
    if (!userId || online !== true || appState !== 'active') {
      publish({ canView: false, status: !userId ? 'signed-out' : online === false ? 'offline' : 'checking' });
      return () => { alive = false; };
    }
    publish({ canView: false, status: 'checking' });
    const refresh = async () => {
      if (!alive || inFlight) return;
      inFlight = true;
      clearTimeout(timer);
      let next;
      try {
        next = await Promise.race([
          collaborationService.getSharedViewAccess(noteId),
          new Promise((_, reject) => {
            requestTimer = setTimeout(() => reject(new Error('Access check timed out')), 10_000);
          }),
        ]);
      } catch {
        next = { canView: false, status: 'unavailable' };
      } finally {
        clearTimeout(requestTimer);
        inFlight = false;
      }
      if (!alive) return;
      const deadline = Date.parse(next.expiresAt);
      if (next.canView && (!Number.isFinite(deadline) || deadline <= Date.now())) {
        next = { canView: false, status: 'subscription' };
      }
      publish(next);
      clearTimeout(expiryTimer);
      if (next.canView) {
        // Independent of refresh requests: a slow/hung recheck must not keep
        // previously authorized content visible beyond its known deadline.
        expiryTimer = setTimeout(() => {
          if (!alive) return;
          if (deadline <= Date.now()) publish({ canView: false, status: 'subscription' });
          refresh();
        }, Math.min(2_147_483_647, Math.max(1, deadline - Date.now())));
      }
      timer = setTimeout(refresh, RECHECK_MS);
    };
    refresh();
    const unsubscribe = collaborationService.subscribe(refresh);
    return () => {
      alive = false;
      clearTimeout(timer);
      clearTimeout(expiryTimer);
      unsubscribe();
      clearTimeout(requestTimer);
    };
  }, [noteId, enabled, userId, online, appState]);

  if (!enabled) return { canView: true, status: 'private' };
  if (!userId) return { canView: false, status: 'signed-out' };
  if (online !== true || appState !== 'active') return { canView: false, status: online === false ? 'offline' : 'checking' };
  if (access?.noteId !== noteId || access?.userId !== userId) return { canView: false, status: 'checking' };
  if (access.canView && Date.parse(access.expiresAt) <= Date.now()) return { canView: false, status: 'subscription' };
  return access;
};
