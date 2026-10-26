import { createBackupDocument, serializeBackupDocument, validateBackupDocument } from '../utils/backup-data.mjs';
import { backupTextEntry } from '../utils/backup-tar.mjs';
import { getVisibleFolders } from '../utils/folder-hierarchy.mjs';

const PREFERENCE_KEYS = ['@locknote_theme', '@locknote_expense_currency', '@locknote_home_view_mode', '@locknote_folder_view_mode', '@locknote_note_view_mode', '@locknote_monthly_commitment_template', '@locknote_note_colors', '@locknote_shared_note_password_v1'];

export const createFullBackupService = ({ folderRepo, noteRepo, attachmentRepo, backgrounds, storage, archiveAdapter, appVersion = 'unknown', runExclusive = (operation) => operation(), now = () => new Date() }) => ({
  exportFullBackup: () => runExclusive(async () => {
    const [folders, notes, attachments] = await Promise.all([
      folderRepo.getSyncSnapshot(), noteRepo.getSyncSnapshot(), attachmentRepo.listAll(),
    ]);
    const activeFolders = getVisibleFolders(folders.records);
    const activeFolderIds = new Set(activeFolders.map((folder) => folder.id));
    const activeNotes = notes.records.filter((note) => !note.is_deleted && !note.is_archived &&
      (note.folder_id == null || activeFolderIds.has(note.folder_id)));
    const exportedAt = now();
    // An active-only backup must not carry deletion actions into a later import.
    const document = validateBackupDocument(createBackupDocument(
      { records: activeFolders, tombstones: [] }, { records: activeNotes, tombstones: [] },
      { exportedAt: exportedAt.toISOString(), appVersion }
    )).backup;
    const ownedIds = new Set(document.notes.records.map((note) => note.id));
    const preferences = {}, missing = [];
    for (const key of PREFERENCE_KEYS) {
      const raw = await storage.getItem(key);
      if (raw == null) continue;
      try {
      if (key === '@locknote_note_colors') {
        const values = JSON.parse(raw);
        preferences[key] = JSON.stringify(Object.fromEntries(Object.entries(values).filter(([id]) => ownedIds.has(id))));
      } else if (key === '@locknote_shared_note_password_v1') {
        const value = JSON.parse(raw);
        if (/^[a-f0-9]{64}$/i.test(value?.passwordHash || '')) preferences[key] = JSON.stringify({ version: 1, passwordHash: value.passwordHash, updatedAt: value.updatedAt || null });
      } else preferences[key] = raw;
      } catch { missing.push({ kind: 'preference', key }); }
    }
    const media = [], mediaEntries = [];
    const addMedia = async (asset, record) => {
      try {
        const entry = await archiveAdapter.readAsset(asset);
        const extension = record.kind === 'attachment' ? 'jpg' : /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.exec(asset.name || asset.uri || '')?.[1]?.toLowerCase() || 'jpg';
        const name = `${record.kind === 'attachment' ? 'attachments' : 'backgrounds'}/${String(media.length + 1).padStart(6, '0')}.${extension}`;
        media.push({ ...record, path: name, byte_size: entry.size, mime_type: entry.mimeType || asset.mimeType || 'image/jpeg' });
        mediaEntries.push({ ...entry, name });
      } catch {
        missing.push({ kind: record.kind, note_id: record.note_id, id: record.id || null });
      }
    };
    for (const item of attachments) {
      if (!ownedIds.has(item.note_id)) continue;
      await addMedia({ uri: item.local_uri, mimeType: item.mime_type }, {
        kind: 'attachment', id: item.id, note_id: item.note_id, width: item.width, height: item.height,
        display_order: item.display_order, anchor_offset: item.anchor_offset, display_width_ratio: item.display_width_ratio,
        created_at: item.created_at, updated_at: item.updated_at,
      });
    }
    for (const noteId of ownedIds) {
      try {
        const asset = await backgrounds.exportAsset(noteId);
        if (asset) await addMedia(asset, { kind: 'background', note_id: noteId });
      } catch { missing.push({ kind: 'background', note_id: noteId }); }
    }
    const manifest = { format: 'locknote-full-backup', version: 1, exported_at: exportedAt.toISOString(), app_version: appVersion,
      complete: missing.length === 0, scope: 'active-personal-data', notes_file: 'backup.json', preferences_file: 'preferences.json', media, missing };
    const json = (name, value) => backupTextEntry(name, JSON.stringify(value, null, 2) + '\n');
    const entries = [
      backupTextEntry('README.txt', 'LockNote active personal-data backup\n\nExtract this TAR archive on a computer. backup.json can be selected in Settings > Import Backup to restore active notes and folders. That JSON import does NOT restore the other files automatically. Keep manifest.json, preferences.json, attachments/ and backgrounds/ together for complete developer-assisted recovery. Media paths map to note IDs in manifest.json.\n\nTrash, archived notes, archived folders and their contents are excluded, including their images and note-specific settings. This is a logical, cross-platform backup, not a raw SQLite dump or an APK. Reminder notifications are disabled in the portable records. Account sign-in sessions, recovery account bindings, cached Shared-with-me notes, temporary files and app binaries are excluded. Content is not encrypted; keep the archive private. Check manifest.complete and manifest.missing before relying on it.\n'),
      json('manifest.json', manifest), backupTextEntry('backup.json', serializeBackupDocument(document)),
      json('preferences.json', preferences), ...mediaEntries,
    ];
    const filename = `locknote-full-backup-${exportedAt.toISOString().replace(/[:.]/g, '-')}.tar`;
    const result = await archiveAdapter.saveArchive(entries, filename, exportedAt);
    return { ...result, filename, folderCount: document.folders.records.length, noteCount: document.notes.records.length,
      mediaCount: media.length, missingFileCount: missing.length };
  }),
});
