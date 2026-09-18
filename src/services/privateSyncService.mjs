import {
  buildSyncPayload,
  cloudFolderForLocal,
  cloudNoteForLocal,
  parseSyncResponse,
} from '../utils/private-sync.mjs';

const LAST_SYNC_PREFIX = '@locknote_private_sync_last:';

export const createPrivateSyncService = ({
  supabase,
  isConfigured,
  folderRepo,
  noteRepo,
  storage,
  now = () => new Date().toISOString(),
}) => {
  let syncQueue = Promise.resolve();
  let observedUserId;
  let identityRevision = 0;
  // The singleton lives for the app process. Track identity synchronously too:
  // an account can change while the async pre-apply guard is awaiting storage.
  supabase.auth?.onAuthStateChange?.((_event, nextSession) => {
    const nextUserId = nextSession?.user?.id ?? null;
    if (observedUserId !== undefined && observedUserId !== nextUserId) identityRevision += 1;
    observedUserId = nextUserId;
  });

  const requireSession = async () => {
    if (!isConfigured) throw new Error('Account services are not configured on this build.');
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data?.session) throw new Error('Sign in before syncing notes.');
    return data.session;
  };

  const runSync = async (recoverOnly = false, options = {}) => {
    const session = await requireSession();
    if (observedUserId === undefined) observedUserId = session.user.id;
    const requestedRevision = identityRevision;
    const assertIdentity = () => {
      if (requestedRevision !== identityRevision || observedUserId !== session.user.id) {
        throw Object.assign(new Error('Your account changed. Sync again from the current account.'), { code: 'SYNC_ACCOUNT_CHANGED' });
      }
    };
    const assertCurrent = async (stage) => {
      assertIdentity();
      if (options.signal?.aborted) throw new Error('Sync request timed out or was cancelled.');
      const current = await requireSession();
      if (current.user.id !== session.user.id || (options.expectedUserId && current.user.id !== options.expectedUserId)) {
        const error = new Error('Your account changed. Sync again from the current account.');
        error.code = 'SYNC_ACCOUNT_CHANGED';
        throw error;
      }
      await options.guard?.(stage);
      assertIdentity();
      if (options.signal?.aborted) throw new Error('Sync request timed out or was cancelled.');
    };
    const rpc = (name, args) => {
      const request = supabase.rpc(name, args);
      // Pin authentication to the account whose snapshot is being sent.
      if (session.access_token && typeof request.setHeader === 'function') {
        request.setHeader('Authorization', `Bearer ${session.access_token}`);
      }
      return options.signal && typeof request.abortSignal === 'function'
        ? request.abortSignal(options.signal) : request;
    };
    await assertCurrent('snapshot');
    const [folderSnapshot, noteSnapshot] = await Promise.all([
      folderRepo.getSyncSnapshot(),
      noteRepo.getSyncSnapshot(),
    ]);
    const payload = buildSyncPayload(folderSnapshot, noteSnapshot);
    await assertCurrent('upload');
    let { data, error } = recoverOnly ? await rpc('recover_private_data') : await rpc('sync_private_data', {
      p_folders: payload.folders,
      p_notes: payload.notes,
    });
    let recoveryOnly = recoverOnly;
    if (error?.message?.includes('CLOUD_QUOTA_EXCEEDED') || error?.message?.includes('Creating nested folders requires')) {
      await assertCurrent('recover');
      const recovered = await rpc('recover_private_data');
      if (recovered.error) throw recovered.error;
      data = recovered.data;
      error = null;
      recoveryOnly = true;
    }
    if (error) throw error;

    const response = parseSyncResponse(data);
    const folderRecords = [];
    for (const remote of response.folders.filter((folder) => !folder.is_deleted)) {
      const existing = await folderRepo.getById(remote.id);
      folderRecords.push(cloudFolderForLocal(remote, existing));
    }
    const folderTombstones = response.folders
      .filter((folder) => folder.is_deleted)
      .map(({ id, updated_at }) => ({ id, updated_at }));

    await assertCurrent('apply-folders');
    await folderRepo.applySyncSnapshot(folderRecords, folderTombstones);

    const noteRecords = [];
    for (const remote of response.notes.filter((note) => !note.is_deleted)) {
      const existing = await noteRepo.getById(remote.id);
      noteRecords.push(cloudNoteForLocal(remote, existing));
    }
    const noteTombstones = response.notes
      .filter((note) => note.is_deleted)
      .map(({ id, updated_at }) => ({ id, updated_at }));
    await assertCurrent('apply-notes');
    await noteRepo.applySyncSnapshot(noteRecords, noteTombstones);

    const syncedAt = now();
    await assertCurrent('complete');
    await storage.setItem(`${LAST_SYNC_PREFIX}${session.user.id}`, syncedAt);
    return {
      syncedAt,
      recoveryOnly,
      folders: folderRecords.length,
      notes: noteRecords.length,
      deleted: folderTombstones.length + noteTombstones.length,
    };
  };

  return {
    async syncAll(options = {}) {
      const session = await requireSession();
      const boundOptions = { ...options, expectedUserId: options.expectedUserId ?? session.user.id };
      const operation = syncQueue.catch(() => {}).then(() => runSync(false, boundOptions));
      syncQueue = operation;
      return await operation;
    },

    async recoverAll(options = {}) {
      const session = await requireSession();
      const boundOptions = { ...options, expectedUserId: options.expectedUserId ?? session.user.id };
      const operation = syncQueue.catch(() => {}).then(() => runSync(true, boundOptions));
      syncQueue = operation;
      return await operation;
    },

    async getLastSyncAt(userId) {
      if (!userId) return null;
      return await storage.getItem(`${LAST_SYNC_PREFIX}${userId}`);
    },
  };
};
