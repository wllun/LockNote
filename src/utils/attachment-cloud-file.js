import { Directory, File, Paths } from 'expo-file-system';
import { downloadCompleteImage } from './downloaded-image.mjs';

export const readAttachmentUploadBody = async (uri) => {
  const file = new File(uri);
  if (!file.exists) throw new Error('The local image is no longer available.');
  return await file.arrayBuffer();
};

export const prepareDownloadedAttachment = async (url, attachmentId, options = {}) => {
  const bytes = await downloadCompleteImage(url, options);
  const directory = new Directory(Paths.cache, 'note-attachment-downloads');
  directory.create({ idempotent: true, intermediates: true });
  const safeId = String(attachmentId).replace(/[^a-z0-9_-]/gi, '_');
  const destination = new File(directory, `${safeId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.jpg`);
  try {
    destination.create({ intermediates: true });
    destination.write(bytes);
    if (destination.size !== bytes.length) throw new Error('The image could not be saved completely.');
  } catch (error) {
    try { if (destination.exists) destination.delete(); } catch {}
    throw error;
  }
  return {
    uri: destination.uri,
    cleanup: () => {
      try { if (destination.exists) destination.delete(); } catch {}
    },
  };
};
