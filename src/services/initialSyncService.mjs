import { assertSyncActive } from '../utils/sync-cancellation.mjs';

export const initialSyncKey = (userId) => `@locknote_initial_sync:${userId}`;

export const createInitialSyncService = ({ storage, syncService, isEditorOpen = () => false, now = () => new Date().toISOString() }) => ({
  async read(userId) {
    if (!userId) return null;
    const raw = await storage.getItem(initialSyncKey(userId));
    if (raw != null) {
      try {
        const value = JSON.parse(raw);
        if (value.version === 1 && value.status === 'complete') return value;
        return { ...value, version: 1, status: 'pending' };
      } catch { return { version: 1, status: 'pending' }; }
    }
    // Existing installations that already synced should not get another startup gate.
    const lastSyncAt = await syncService.getLastSyncAt(userId);
    return Number.isFinite(Date.parse(lastSyncAt)) ? { version: 1, status: 'complete', legacy: true } : null;
  },

  async run(userId, { signal, guard, onProgress } = {}) {
    if (!userId) throw new Error('Sign in before restoring cloud notes.');
    const assertCurrent = async (stage) => {
      assertSyncActive(signal);
      if (isEditorOpen()) throw Object.assign(new Error('Close your open note before resuming sync.'), { code: 'SYNC_EDITOR_OPEN' });
      await guard?.(stage);
      assertSyncActive(signal);
    };
    await assertCurrent('start');
    // Persist pending BEFORE downloading records (which updates last-sync time).
    // An app restart must not mistake a text-only partial restore for completion.
    const previous = await storage.getItem(initialSyncKey(userId));
    let saved;
    try { saved = JSON.parse(previous); } catch { /* Invalid progress never discards local content. */ }
    let checkpoint = { ...saved, version: 1, status: 'pending', updatedAt: now(), imageNotesCompleted: saved?.imageNotesCompleted || 0 };
    await storage.setItem(initialSyncKey(userId), JSON.stringify(checkpoint));
    await assertCurrent('start');
    const result = await syncService.restoreAccount({
      expectedUserId: userId, signal, guard: assertCurrent, onProgress,
      onCheckpoint: async (progress) => {
        await assertCurrent('checkpoint');
        checkpoint = { ...checkpoint, ...progress, updatedAt: now() };
        await storage.setItem(initialSyncKey(userId), JSON.stringify(checkpoint));
      },
    });
    await assertCurrent('complete');
    await storage.setItem(initialSyncKey(userId), JSON.stringify({ version: 1, status: 'complete', updatedAt: now() }));
    await assertCurrent('complete');
    return result;
  },
});
