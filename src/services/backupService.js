import Constants from 'expo-constants';
import { folderRepo } from '../db/folderRepo';
import { noteRepo } from '../db/noteRepo';
import { backupFileAdapter } from '../utils/backup-file';
import { createBackupService } from './backupService.mjs';

export const backupService = createBackupService({
  folderRepo,
  noteRepo,
  fileAdapter: backupFileAdapter,
  appVersion: Constants.expoConfig?.version || 'unknown',
});
