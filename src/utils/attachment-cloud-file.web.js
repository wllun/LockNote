export const readAttachmentUploadBody = async (uri) => {
  const response = await fetch(uri);
  if (!response.ok) throw new Error('The local image is no longer available.');
  return await response.arrayBuffer();
};

export const prepareDownloadedAttachment = async (url) => ({
  uri: url,
  cleanup: () => {},
});
