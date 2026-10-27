import {
  buildSyncPayload,
  cloudFolderForLocal,
  cloudNoteForLocal,
  parseSyncResponse,
} from '../utils/private-sync.mjs';
import { assertSyncActive, awaitSyncRequest } from '../utils/sync-cancellation.mjs';

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
      assertSyncActive(options.signal);
      const current = await requireSession();
      if (current.user.id !== session.user.id || (options.expectedUserId && current.user.id !== options.expectedUserId)) {
        const error = new Error('Your account changed. Sync again from the current account.');
        error.code = 'SYNC_ACCOUNT_CHANGED';
        throw error;
      }
      await options.guard?.(stage);
      assertIdentity();
      assertSyncActive(options.signal);
    };
    const rpc = (name, args) => {
      const request = supabase.rpc(name, args);
      // Pin authentication to the account whose snapshot is being sent.
      if (session.access_token && typeof request.setHeader === 'function') {
        request.setHeader('Authorization', `Bearer ${session.access_token}`);
      }
      return awaitSyncRequest(options.signal && typeof request.abortSignal === 'function'
        ? request.abortSignal(options.signal) : request, options.signal);
    };
    await assertCurrent('snapshot');
    const [folderSnapshot, noteSnapshot] = await Promise.all([
      folderRepo.getSyncSnapshot(),
      noteRepo.getSyncSnapshot(),
    ]);
    const payload = recoverOnly ? null : buildSyncPayload(folderSnapshot, noteSnapshot);
    await assertCurrent('upload');
    options.onProgress?.({ phase: 'connecting' });
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
    options.onProgress?.({ phase: 'notes', notes: response.notes.filter((note) => !note.is_deleted).length });
    const folderDeletes = new Map((folderSnapshot.tombstones || []).map((item) => [item.id, item.updated_at]));
    const noteDeletes = new Map((noteSnapshot.tombstones || []).map((item) => [item.id, item.updated_at]));
    const deletedLocally = (item, deletions) => deletions.has(item.id) && new Date(deletions.get(item.id)) >= new Date(item.updated_at);
    const blockedFolders = new Set(response.folders.filter((folder) => deletedLocally(folder, folderDeletes)).map((folder) => folder.id));
    for (let changed = true; changed;) {
      changed = false;
      for (const folder of response.folders) {
        if (blockedFolders.has(folder.parent_id) && !blockedFolders.has(folder.id)) { blockedFolders.add(folder.id); changed = true; }
      }
    }
    const activeNotes = response.notes.filter((note) => !note.is_deleted && !deletedLocally(note, noteDeletes) && !blockedFolders.has(note.folder_id));
    const folderRecords = [];
    for (const remote of response.folders.filter((folder) => !folder.is_deleted && !blockedFolders.has(folder.id))) {
      const existing = await folderRepo.getById(remote.id);
      folderRecords.push(cloudFolderForLocal(remote, existing));
    }
    const folderTombstones = response.folders
      .filter((folder) => folder.is_deleted)
      .map(({ id, updated_at }) => ({ id, updated_at }));

    await assertCurrent('apply-folders');
    const assertApplicationCurrent = () => { assertIdentity(); assertSyncActive(options.signal); };
    await folderRepo.applySyncSnapshot(folderRecords, folderTombstones, { assertCurrent: assertApplicationCurrent });

    const noteRecords = [];
    for (const remote of activeNotes) {
      const existing = await noteRepo.getById(remote.id);
      noteRecords.push(cloudNoteForLocal(remote, existing));
    }
    const noteTombstones = response.notes
      .filter((note) => note.is_deleted)
      .map(({ id, updated_at }) => ({ id, updated_at }));
    await assertCurrent('apply-notes');
    await noteRepo.applySyncSnapshot(noteRecords, noteTombstones, { assertCurrent: assertApplicationCurrent });

    const syncedAt = now();
    await assertCurrent('complete');
    await storage.setItem(`${LAST_SYNC_PREFIX}${session.user.id}`, syncedAt);
    return {
      syncedAt,
      recoveryOnly,
      folders: folderRecords.length,
      notes: noteRecords.length,
      deleted: folderTombstones.length + noteTombstones.length,
      ...(options.includeImageNotes ? { imageNotes: activeNotes.filter((note) => ['note', 'recipe'].includes(note.note_type)).map(({ id, updated_at }) => ({ id, updated_at })) } : {}),
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
