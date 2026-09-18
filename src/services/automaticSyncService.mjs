import { canUsePremiumFeature } from '../utils/premium-access.mjs';

export const autoSyncPreferenceKey = (userId) => `@locknote_auto_sync_enabled:${userId}`;
export const autoSyncStatusKey = (userId) => `@locknote_auto_sync_status:${userId}`;
export const syncDeferredError = () => Object.assign(new Error('Automatic sync is waiting for editing or account readiness.'), { code: 'SYNC_DEFERRED' });

// Fresh server authorization also works in a headless task without mounting
// React/RevenueCat. Never use a persisted local "premium" flag.
export const createAutomaticSyncService = ({ supabase, storage, syncService, isEditorOpen,
  now = Date.now, onStatus = () => {}, setTimer = setTimeout, clearTimer = clearTimeout }) => {
  const readEnabled = async (userId) => !!userId && await storage.getItem(autoSyncPreferenceKey(userId)) === 'true';
  const writeStatus = async (userId, status) => {
    await storage.setItem(autoSyncStatusKey(userId), JSON.stringify(status));
    onStatus({ userId, ...status });
  };
  return {
    readEnabled,
    async setEnabled(userId, enabled) {
      if (!userId) throw new Error('Sign in before enabling automatic sync.');
      await storage.setItem(autoSyncPreferenceKey(userId), enabled ? 'true' : 'false');
    },
    async readStatus(userId) {
      if (!userId) return null;
      try { return JSON.parse(await storage.getItem(autoSyncStatusKey(userId)) || 'null'); }
      catch { return null; }
    },
    async run(userId, isCurrent = () => true) {
      const controller = new AbortController();
      const timeout = setTimer(() => controller.abort(), 30000);
      const timeoutError = () => Object.assign(new Error('Automatic sync timed out. Your local changes remain saved.'), { code: 'SYNC_TIMEOUT' });
      const cancellable = async (request) => {
        let onAbort;
        const cancelled = new Promise((_resolve, reject) => {
          onAbort = () => reject(timeoutError());
          controller.signal.addEventListener('abort', onAbort, { once: true });
          if (controller.signal.aborted) onAbort();
        });
        try { return await Promise.race([request, cancelled]); }
        finally { controller.signal.removeEventListener('abort', onAbort); }
      };
      let access;
      const guard = async () => {
        if (controller.signal.aborted) throw timeoutError();
        if (!isCurrent() || isEditorOpen() || !await readEnabled(userId)) throw syncDeferredError();
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (data?.session?.user?.id !== userId) throw syncDeferredError();
        if (access && (!canUsePremiumFeature(access.plan, 'automaticSync')
          || !Number.isFinite(new Date(access.expires_at).getTime()) || new Date(access.expires_at).getTime() <= now())) {
          throw Object.assign(new Error('Automatic sync requires an active Plus or Pro plan.'), { code: 'PREMIUM_REQUIRED' });
        }
        // Editing/lifecycle state may change while getSession/storage resolves.
        if (!await readEnabled(userId) || !isCurrent() || isEditorOpen()) throw syncDeferredError();
      };
      try {
        await guard();
        const { data: sessionData } = await supabase.auth.getSession();
        const request = supabase.rpc('get_subscription_access', { p_include_usage: false });
        if (sessionData?.session?.access_token && typeof request.setHeader === 'function') {
          request.setHeader('Authorization', `Bearer ${sessionData.session.access_token}`);
        }
        const response = await cancellable(typeof request.abortSignal === 'function' ? request.abortSignal(controller.signal) : request);
        if (response.error) throw response.error;
        access = response.data ?? { plan: 'free' };
        await guard();
        // Bound queue waiting too. A cancelled queued operation retains its
        // abort signal and cannot upload later when the manual queue drains.
        const result = await cancellable(syncService.syncAll({ expectedUserId: userId, automatic: true, guard, signal: controller.signal }));
        await guard();
        await writeStatus(userId, { lastAttemptAt: new Date(now()).toISOString(),
          lastSyncAt: result.syncedAt, error: null, recoveryOnly: !!result.recoveryOnly });
        return result;
      } catch (error) {
        // Do not publish stale errors to another account or replace a useful
        // last-success timestamp when offline/background work fails.
        if (isCurrent() && !['SYNC_DEFERRED', 'SYNC_ACCOUNT_CHANGED'].includes(error?.code)) {
          const previous = await this.readStatus(userId);
          await writeStatus(userId, { ...previous, lastAttemptAt: new Date(now()).toISOString(),
            error: error?.message || 'Automatic sync failed.', errorCode: error?.code ?? null });
        }
        throw error;
      } finally { clearTimer(timeout); }
    },
  };
};
