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

  const requireSession = async () => {
    if (!isConfigured) throw new Error('Account services are not configured on this build.');
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data?.session) throw new Error('Sign in before syncing notes.');
    return data.session;
  };

  const runSync = async () => {
    const session = await requireSession();
    const [folderSnapshot, noteSnapshot] = await Promise.all([
      folderRepo.getSyncSnapshot(),
      noteRepo.getSyncSnapshot(),
    ]);
    const payload = buildSyncPayload(folderSnapshot, noteSnapshot);
    const { data, error } = await supabase.rpc('sync_private_data', {
      p_folders: payload.folders,
      p_notes: payload.notes,
    });
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

    await folderRepo.applySyncSnapshot(folderRecords, folderTombstones);

    const noteRecords = [];
    for (const remote of response.notes.filter((note) => !note.is_deleted)) {
      const existing = await noteRepo.getById(remote.id);
      noteRecords.push(cloudNoteForLocal(remote, existing));
    }
    const noteTombstones = response.notes
      .filter((note) => note.is_deleted)
      .map(({ id, updated_at }) => ({ id, updated_at }));
    await noteRepo.applySyncSnapshot(noteRecords, noteTombstones);

    const syncedAt = now();
    await storage.setItem(`${LAST_SYNC_PREFIX}${session.user.id}`, syncedAt);
    return {
      syncedAt,
      folders: folderRecords.length,
      notes: noteRecords.length,
      deleted: folderTombstones.length + noteTombstones.length,
    };
  };

  return {
    async syncAll() {
      const operation = syncQueue.catch(() => {}).then(runSync);
      syncQueue = operation;
      return await operation;
    },

    async getLastSyncAt(userId) {
      if (!userId) return null;
      return await storage.getItem(`${LAST_SYNC_PREFIX}${userId}`);
    },
  };
};
