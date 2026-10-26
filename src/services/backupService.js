import Constants from 'expo-constants';
import { folderRepo } from '../db/folderRepo';
import { noteRepo } from '../db/noteRepo';
import { attachmentRepo } from '../db/attachmentRepo';
import { backupFileAdapter } from '../utils/backup-file';
import { createBackupService } from './backupService.mjs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createFullBackupService } from './fullBackupService.mjs';
import { fullBackupFileAdapter } from '../utils/full-backup-file';
import { noteBackgroundPreference } from '../utils/note-background-preference';
import { hasOpenSyncEditor, holdSyncEditor } from './syncActivity.mjs';
import { syncService } from './syncService';

const portableBackupService = createBackupService({
  folderRepo,
  noteRepo,
  attachmentRepo,
  fileAdapter: backupFileAdapter,
  appVersion: Constants.expoConfig?.version || 'unknown',
});

const fullBackupService = createFullBackupService({
  folderRepo, noteRepo, attachmentRepo, backgrounds: noteBackgroundPreference,
  storage: AsyncStorage, archiveAdapter: fullBackupFileAdapter,
  appVersion: Constants.expoConfig?.version || 'unknown',
  runExclusive: async (operation) => {
    if (hasOpenSyncEditor()) throw new Error('Close any open note and return to Home before exporting a full backup. This ensures your latest edits are saved.');
    const release = holdSyncEditor();
    try { return await syncService.withLocalDataLock(operation); }
    finally { release(); }
  },
});

export const backupService = { ...portableBackupService, ...fullBackupService };
