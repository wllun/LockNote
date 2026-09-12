import AsyncStorage from '@react-native-async-storage/async-storage';
import { folderRepo } from '../db/folderRepo';
import { noteRepo } from '../db/noteRepo';
import { createPrivateSyncService } from './privateSyncService.mjs';
import { isSupabaseConfigured, supabase } from './supabaseClient';
import { attachmentRepo } from '../db/attachmentRepo';
import { attachmentCloudService } from './attachmentCloudService';

const privateSyncService = createPrivateSyncService({
  supabase,
  isConfigured: isSupabaseConfigured,
  folderRepo,
  noteRepo,
  storage: AsyncStorage,
});

export const syncService = {
  ...privateSyncService,
  async syncAll() {
    const result = await privateSyncService.syncAll();
    const attachments = await attachmentRepo.listAll();
    const noteIds = [...new Set(attachments.map((item) => item.note_id))];
    for (const noteId of noteIds) await attachmentCloudService.syncNote(noteId);
    return { ...result, attachments: attachments.length };
  },
};
