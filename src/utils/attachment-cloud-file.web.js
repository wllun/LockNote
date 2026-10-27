import { downloadCompleteImage } from './downloaded-image.mjs';

export const readAttachmentUploadBody = async (uri) => {
  const response = await fetch(uri);
  if (!response.ok) throw new Error('The local image is no longer available.');
  return await response.arrayBuffer();
};

export const prepareDownloadedAttachment = async (url, _attachmentId, options = {}) => {
  const bytes = await downloadCompleteImage(url, options);
  const uri = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
  return { uri, cleanup: () => URL.revokeObjectURL(uri) };
};
