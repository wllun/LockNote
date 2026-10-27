import { MAX_ATTACHMENT_STORED_BYTES } from './note-attachment.mjs';
import { assertSyncActive, awaitSyncRequest } from './sync-cancellation.mjs';

export const downloadCompleteImage = async (url, { signal, expectedBytes } = {}) => {
  assertSyncActive(signal);
  const response = await awaitSyncRequest(fetch(url, { signal }), signal);
  if (!response.ok) throw new Error('The cloud image could not be downloaded.');
  const bytes = new Uint8Array(await awaitSyncRequest(response.arrayBuffer(), signal));
  assertSyncActive(signal);
  if (bytes.length < 4 || bytes.length >= MAX_ATTACHMENT_STORED_BYTES
    || (expectedBytes != null && bytes.length !== expectedBytes)
    || bytes[0] !== 0xff || bytes[1] !== 0xd8
    || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
    throw new Error('The image download was incomplete. Please retry sync.');
  }
  return bytes;
};
