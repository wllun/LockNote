import { Directory, File, Paths } from 'expo-file-system';

export const readAttachmentUploadBody = async (uri) => {
  const file = new File(uri);
  if (!file.exists) throw new Error('The local image is no longer available.');
  return await file.arrayBuffer();
};

export const prepareDownloadedAttachment = async (url, attachmentId) => {
  const directory = new Directory(Paths.cache, 'note-attachment-downloads');
  directory.create({ idempotent: true, intermediates: true });
  const destination = new File(directory, `${attachmentId}.jpg`);
  if (destination.exists) destination.delete();
  const response = await fetch(url);
  if (!response.ok) throw new Error('The cloud image could not be downloaded.');
  destination.create({ overwrite: true, intermediates: true });
  destination.write(new Uint8Array(await response.arrayBuffer()));
  return {
    uri: destination.uri,
    cleanup: () => {
      try { if (destination.exists) destination.delete(); } catch {}
    },
  };
};
