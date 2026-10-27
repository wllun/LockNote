import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncService } from './syncService';
import { hasOpenSyncEditor } from './syncActivity.mjs';
import { createInitialSyncService } from './initialSyncService.mjs';

export const initialSyncService = createInitialSyncService({ storage: AsyncStorage, syncService, isEditorOpen: hasOpenSyncEditor });
