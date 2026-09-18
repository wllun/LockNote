import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from './AuthContext';
import { useSubscription } from './SubscriptionContext';
import { automaticSyncService } from '../services/automaticSync';
import { configureBackgroundSyncTask } from '../services/backgroundSyncTask';
import { createAutomaticSyncController } from '../services/automaticSyncController.mjs';
import { hasOpenSyncEditor, subscribeSyncEditorActivity, subscribeSyncEvents } from '../services/syncActivity.mjs';
import { getNetworkAvailability } from '../utils/network-availability.mjs';
import { canUsePremiumFeature } from '../utils/premium-access.mjs';
import { premiumAccessService } from '../services/premiumAccessService';
import { syncService } from '../services/syncService';

const AutomaticSyncContext = createContext(null);
export const AutomaticSyncProvider = ({ children }) => {
  const { session, loading: authLoading, recoveringPassword, recoveringLockPassword } = useAuth();
  const { activePlanId, loading: subscriptionLoading } = useSubscription();
  const userId = session?.user?.id ?? null;
  const identity = useRef(userId);
  identity.current = userId;
  const controller = useRef(null);
  const [preference, setPreference] = useState({ userId: null, enabled: false, loaded: false });
  const [changing, setChanging] = useState(false);
  const [online, setOnline] = useState(null);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [state, setState] = useState({ status: 'off' });
  const [busy, setBusy] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [backgroundStatus, setBackgroundStatus] = useState('off');
  const loaded = preference.loaded && preference.userId === userId;
  const enabled = loaded && preference.enabled;
  const eligible = canUsePremiumFeature(activePlanId, 'automaticSync');
  const ready = loaded && !authLoading && !subscriptionLoading && !recoveringPassword && !recoveringLockPassword;

  useEffect(() => {
    const scheduler = createAutomaticSyncController({
      sync: (requestedUserId, isCurrent) => automaticSyncService.run(requestedUserId, isCurrent),
      isEditorOpen: hasOpenSyncEditor,
      onState: setState,
    });
    controller.current = scheduler;
    const unsubscribe = subscribeSyncEditorActivity(() => scheduler.request());
    return () => { unsubscribe(); scheduler.dispose(); controller.current = null; };
  }, []);

  useEffect(() => {
    let mounted = true;
    setLastSyncAt(null);
    setBusy(false);
    Promise.all([automaticSyncService.readEnabled(userId), syncService.getLastSyncAt(userId)])
      .then(([value, savedSyncAt]) => {
        if (!mounted) return;
        setPreference({ userId, enabled: value, loaded: true });
        setLastSyncAt(savedSyncAt);
      })
      .catch(() => { if (mounted) setPreference({ userId, enabled: false, loaded: true }); });
    return () => { mounted = false; };
  }, [userId]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((network) => setOnline(getNetworkAvailability(network)));
    NetInfo.fetch().then((network) => setOnline(getNetworkAvailability(network))).catch(() => setOnline(false));
    const appState = AppState.addEventListener('change', (value) => setActive(value === 'active'));
    const visibility = () => setActive(document.visibilityState === 'visible');
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      visibility();
      document.addEventListener('visibilitychange', visibility);
    }
    return () => {
      unsubscribe(); appState.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  useEffect(() => {
    controller.current?.configure({ userId, enabled, eligible, ready, online, active });
  }, [userId, enabled, eligible, ready, online, active]);

  useEffect(() => {
    let mounted = true;
    configureBackgroundSyncTask(!!userId && enabled && eligible && ready)
      .then((value) => { if (mounted) setBackgroundStatus(value); })
      .catch(() => { if (mounted) setBackgroundStatus('unavailable'); });
    return () => { mounted = false; };
  }, [userId, enabled, eligible, ready]);

  useEffect(() => () => { configureBackgroundSyncTask(false).catch(() => {}); }, []);

  useEffect(() => subscribeSyncEvents((event) => {
    if (event.userId !== identity.current) return;
    if (event.type === 'start') setBusy(true);
    if (event.type === 'finish') setBusy(false);
    if (event.type === 'success') setLastSyncAt(event.result.syncedAt);
    if (event.type === 'automatic-status' && event.lastSyncAt) setLastSyncAt(event.lastSyncAt);
  }), []);

  const setEnabled = async (value) => {
    if (!userId || changing) return;
    const requestedUserId = userId;
    setChanging(true);
    try {
      if (value) await premiumAccessService.require('automaticSync');
      if (identity.current !== requestedUserId) return;
      await automaticSyncService.setEnabled(requestedUserId, value);
      if (identity.current === requestedUserId) setPreference({ userId: requestedUserId, enabled: value, loaded: true });
    } finally { setChanging(false); }
  };

  const value = useMemo(() => ({ enabled, loaded, changing, eligible, busy, lastSyncAt, backgroundStatus,
    state: state.userId === userId ? state : { status: 'loading' }, setEnabled }),
  [enabled, loaded, changing, eligible, busy, lastSyncAt, backgroundStatus, state, userId]);
  return <AutomaticSyncContext.Provider value={value}>{children}</AutomaticSyncContext.Provider>;
};
export const useAutomaticSync = () => useContext(AutomaticSyncContext);
