import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';
import { syncService } from './syncService';
import { createAutomaticSyncService } from './automaticSyncService.mjs';
import { hasOpenSyncEditor, emitSyncEvent } from './syncActivity.mjs';

export const automaticSyncService = createAutomaticSyncService({
  supabase, storage: AsyncStorage, syncService, isEditorOpen: hasOpenSyncEditor,
  onStatus: (status) => emitSyncEvent({ type: 'automatic-status', ...status }),
});
