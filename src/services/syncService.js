import AsyncStorage from '@react-native-async-storage/async-storage';
import { folderRepo } from '../db/folderRepo';
import { noteRepo } from '../db/noteRepo';
import { createPrivateSyncService } from './privateSyncService.mjs';
import { isSupabaseConfigured, supabase } from './supabaseClient';
import { attachmentRepo } from '../db/attachmentRepo';
import { attachmentCloudService } from './attachmentCloudService';
import { emitSyncEvent } from './syncActivity.mjs';
import { assertSyncActive, awaitSyncRequest } from '../utils/sync-cancellation.mjs';

const privateSyncService = createPrivateSyncService({
  supabase,
  isConfigured: isSupabaseConfigured,
  folderRepo,
  noteRepo,
  storage: AsyncStorage,
});

let queue = Promise.resolve();
let identityRevision = 0;
let observedUserId;
supabase.auth.onAuthStateChange?.((_event, session) => {
  const nextUserId = session?.user?.id ?? null;
  if (observedUserId !== undefined && nextUserId !== observedUserId) identityRevision += 1;
  observedUserId = nextUserId;
});
const enqueueSync = async (recoverOnly, options = {}) => {
  const { data, error } = options.signal ? await awaitSyncRequest(supabase.auth.getSession(), options.signal) : await supabase.auth.getSession();
  if (error) throw error;
  if (!data?.session) throw new Error('Sign in before syncing notes.');
  const userId = options.expectedUserId ?? data?.session?.user?.id;
  if (observedUserId === undefined) observedUserId = data.session.user.id;
  const revision = identityRevision;
  const guard = async (stage) => {
    if (revision !== identityRevision) throw Object.assign(new Error('Your account changed during sync.'), { code: 'SYNC_ACCOUNT_CHANGED' });
    assertSyncActive(options.signal);
    await options.guard?.(stage);
    if (revision !== identityRevision) throw Object.assign(new Error('Your account changed during sync.'), { code: 'SYNC_ACCOUNT_CHANGED' });
    assertSyncActive(options.signal);
  };
  const bound = { ...options, expectedUserId: userId, ...(options.downloadImages ? { guard } : {}) };
  const operation = queue.catch(() => {}).then(async () => {
    emitSyncEvent({ type: 'start', userId });
    try {
      const result = await (recoverOnly ? privateSyncService.recoverAll(bound) : privateSyncService.syncAll(bound));
      if (options.downloadImages) {
        const notes = result.imageNotes || [];
        options.onProgress?.({ phase: 'images', completed: 0, total: notes.length, notes: result.notes });
        for (let index = 0; index < notes.length; index += 1) {
          await guard('images');
          await attachmentCloudService.downloadNote(notes[index].id, { ...bound,
            onProgress: () => options.onProgress?.({ phase: 'images', completed: index, total: notes.length, notes: result.notes }),
          });
          await guard('checkpoint');
          await options.onCheckpoint?.({ imageNotesCompleted: index + 1, lastNoteId: notes[index].id });
          options.onProgress?.({ phase: 'images', completed: index + 1, total: notes.length, notes: result.notes });
        }
        await guard('complete');
      }
      // Automatic tasks sync the same durable folder/note data. Image transfer is
      // left to explicit sync/open-note reconciliation, avoiding unbounded work
      // and layout mutations during OS-limited background execution.
      if (!recoverOnly && !options.automatic) {
        const attachments = await attachmentRepo.listAll();
        const noteIds = [...new Set(attachments.map((item) => item.note_id))];
        for (const noteId of noteIds) {
          const current = await supabase.auth.getSession();
          if (current.data?.session?.user?.id !== userId) throw new Error('Your account changed during sync.');
          await attachmentCloudService.syncNote(noteId);
        }
        result.attachments = attachments.length;
      }
      emitSyncEvent({ type: 'success', userId, result });
      return result;
    } catch (error) {
      emitSyncEvent({ type: 'error', userId, error });
      throw error;
    } finally {
      emitSyncEvent({ type: 'finish', userId });
    }
  });
  queue = operation;
  return options.signal ? await awaitSyncRequest(operation, options.signal) : await operation;
};
export const syncService = {
  // Local snapshots share the manual/automatic queue without requiring sign-in
  // or making a network request.
  withLocalDataLock(operation) {
    const pending = queue.catch(() => {}).then(operation);
    queue = pending;
    return pending;
  },
  getLastSyncAt: privateSyncService.getLastSyncAt,
  syncAll: (options) => enqueueSync(false, options),
  recoverAll: (options) => enqueueSync(true, options),
  restoreAccount: (options = {}) => enqueueSync(true, { ...options, includeImageNotes: true, downloadImages: true }),
};
