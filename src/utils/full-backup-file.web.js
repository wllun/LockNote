import { writeBackupTar } from './backup-tar.mjs';

export const fullBackupFileAdapter = {
  async readAsset(asset) {
    let blob = asset?.file;
    if (!blob) {
      if (!/^(blob|data):/.test(asset?.uri || '')) throw new Error('Local image is unavailable.');
      const response = await fetch(asset.uri);
      if (!response.ok) throw new Error('Local image is unavailable.');
      blob = await response.blob();
    }
    return { size: blob.size, mimeType: blob.type || asset.mimeType, chunks: async function* () {
      for (let offset = 0; offset < blob.size; offset += 256 * 1024) {
        yield new Uint8Array(await blob.slice(offset, offset + 256 * 1024).arrayBuffer());
      }
    } };
  },

  async saveArchive(entries, filename, date) {
    const chunks = [];
    await writeBackupTar(entries, (bytes) => { chunks.push(bytes); }, date);
    const blob = new Blob(chunks, { type: 'application/x-tar' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    try {
      link.href = url; link.download = filename; link.style.display = 'none';
      document.body.appendChild(link); link.click();
    } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
    return { destination: 'download' };
  },
};
