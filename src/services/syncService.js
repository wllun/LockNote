import AsyncStorage from '@react-native-async-storage/async-storage';
import { folderRepo } from '../db/folderRepo';
import { noteRepo } from '../db/noteRepo';
import { createPrivateSyncService } from './privateSyncService.mjs';
import { isSupabaseConfigured, supabase } from './supabaseClient';
import { attachmentRepo } from '../db/attachmentRepo';
import { attachmentCloudService } from './attachmentCloudService';
import { emitSyncEvent } from './syncActivity.mjs';

const privateSyncService = createPrivateSyncService({
  supabase,
  isConfigured: isSupabaseConfigured,
  folderRepo,
  noteRepo,
  storage: AsyncStorage,
});

let queue = Promise.resolve();
const enqueueSync = async (recoverOnly, options = {}) => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data?.session) throw new Error('Sign in before syncing notes.');
  const userId = options.expectedUserId ?? data?.session?.user?.id;
  const bound = { ...options, expectedUserId: userId };
  const operation = queue.catch(() => {}).then(async () => {
    emitSyncEvent({ type: 'start', userId });
    try {
      const result = await (recoverOnly ? privateSyncService.recoverAll(bound) : privateSyncService.syncAll(bound));
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
  return await operation;
};
export const syncService = {
  getLastSyncAt: privateSyncService.getLastSyncAt,
  syncAll: (options) => enqueueSync(false, options),
  recoverAll: (options) => enqueueSync(true, options),
};
