import * as DocumentPicker from 'expo-document-picker';
import { MAX_BACKUP_BYTES } from './backup-data.mjs';

export const backupFileAdapter = {
  async saveBackupFile(contents, filename) {
    const blob = new Blob([contents], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return { name: filename };
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
    if (Number(asset.size) > MAX_BACKUP_BYTES) {
      throw new Error('Invalid LockNote backup: the selected file is larger than 25 MB.');
    }
    const text = asset.file?.text
      ? await asset.file.text()
      : await fetch(asset.uri).then((response) => response.text());
    return { name: asset.name, size: asset.size, text };
  },
};
