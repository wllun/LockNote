import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { MAX_BACKUP_BYTES } from './backup-data.mjs';

export const backupFileAdapter = {
  async saveBackupFile(contents, filename) {
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error('Saving backup files is not available on this device.');
    }
    const file = new File(Paths.cache, filename);
    file.create({ overwrite: true, intermediates: true });
    file.write(contents);
    await Sharing.shareAsync(file.uri, {
      dialogTitle: 'Save LockNote backup',
      mimeType: 'application/json',
      UTI: 'public.json',
    });
    return { name: filename, uri: file.uri };
  },

  async pickBackupFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'text/json', 'application/octet-stream'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return null;
    const asset = result.assets?.[0];
    if (!asset) throw new Error('The selected backup file could not be opened.');
    const file = new File(asset);
    const size = asset.size ?? file.size;
    if (Number(size) > MAX_BACKUP_BYTES) {
      throw new Error('Invalid LockNote backup: the selected file is larger than 25 MB.');
    }
    return {
      name: asset.name,
      size,
      text: await file.text(),
    };
  },
};
