import {
  createBackupDocument,
  createBackupFilename,
  MAX_BACKUP_BYTES,
  parseBackupText,
  serializeBackupDocument,
  validateBackupDocument,
} from '../utils/backup-data.mjs';

export const createBackupService = ({
  folderRepo,
  noteRepo,
  fileAdapter,
  appVersion = 'unknown',
  now = () => new Date(),
}) => {
  let operationQueue = Promise.resolve();

  const enqueue = (operation) => {
    const result = operationQueue.then(operation);
    operationQueue = result.catch(() => {});
    return result;
  };

  return {
    exportBackup() {
      return enqueue(async () => {
        const [folders, notes] = await Promise.all([
          folderRepo.getSyncSnapshot(),
          noteRepo.getSyncSnapshot(),
        ]);
        const exportedAt = now();
        const document = createBackupDocument(folders, notes, {
          exportedAt: exportedAt.toISOString(),
          appVersion,
        });
        const validated = validateBackupDocument(document);
        const filename = createBackupFilename(exportedAt);
        await fileAdapter.saveBackupFile(serializeBackupDocument(validated.backup), filename);
        return { ...validated.summary, filename };
      });
    },

    pickBackup() {
      return enqueue(async () => {
        const selected = await fileAdapter.pickBackupFile();
        if (!selected) return null;
        if (Number(selected.size) > MAX_BACKUP_BYTES) {
          throw new Error('Invalid LockNote backup: the selected file is larger than 25 MB.');
        }
        const parsed = parseBackupText(selected.text);
        return { ...parsed, filename: selected.name || 'LockNote backup' };
      });
    },

    restoreBackup(selection, mode = 'merge') {
      return enqueue(async () => {
        if (mode !== 'merge' && mode !== 'replace') throw new Error('Choose merge or replace.');
        const validated = validateBackupDocument(selection?.backup || selection);
        const { folders, notes } = validated.backup;
        if (mode === 'replace') {
          await folderRepo.replaceBackupSnapshot(folders.records, folders.tombstones);
          await noteRepo.replaceBackupSnapshot(notes.records, notes.tombstones);
        } else {
          await folderRepo.applySyncSnapshot(folders.records, folders.tombstones);
          await noteRepo.applySyncSnapshot(notes.records, notes.tombstones);
        }
        return { ...validated.summary, mode };
      });
    },
  };
};
