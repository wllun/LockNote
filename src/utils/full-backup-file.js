import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { writeBackupTar } from './backup-tar.mjs';

export const fullBackupFileAdapter = {
  async readAsset(asset) {
    if (!/^(file|content):/.test(asset?.uri || '')) throw new Error('Local image is unavailable.');
    const file = new File(asset.uri);
    if (!file.exists || !Number.isSafeInteger(file.size) || file.size < 0) throw new Error('Local image is unavailable.');
    return { size: file.size, mimeType: file.type || asset.mimeType, chunks: async function* () {
      const handle = file.open();
      try {
        let count = 0;
        while (true) {
          const bytes = handle.readBytes(256 * 1024);
          if (!bytes.length) break;
          yield bytes;
          if (++count % 16 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
        }
      } finally { handle.close(); }
    } };
  },

  async saveArchive(entries, filename, date) {
    if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is unavailable on this device.');
    const file = new File(Paths.cache, filename);
    file.create({ intermediates: true });
    let handle;
    try {
      handle = file.open();
      await writeBackupTar(entries, (bytes) => handle.writeBytes(bytes), date);
    } catch (error) {
      handle?.close();
      try { if (file.exists) file.delete(); } catch { /* Only this incomplete cache export. */ }
      throw error;
    }
    handle.close();
    await Sharing.shareAsync(file.uri, { dialogTitle: 'Save or send full LockNote backup', mimeType: 'application/x-tar', UTI: 'public.tar-archive' });
    return { uri: file.uri, destination: 'share' };
  },
};
