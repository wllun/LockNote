import AsyncStorage from '@react-native-async-storage/async-storage';
import { folderRepo } from '../db/folderRepo';
import { noteRepo } from '../db/noteRepo';
import { createPrivateSyncService } from './privateSyncService.mjs';
import { isSupabaseConfigured, supabase } from './supabaseClient';

export const syncService = createPrivateSyncService({
  supabase,
  isConfigured: isSupabaseConfigured,
  folderRepo,
  noteRepo,
  storage: AsyncStorage,
});
