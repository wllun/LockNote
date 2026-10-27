import { MAX_NOTE_ATTACHMENTS, MAX_ATTACHMENT_STORED_BYTES } from '../utils/note-attachment.mjs';
import { assertSyncActive, awaitSyncRequest } from '../utils/sync-cancellation.mjs';

// Read-only cloud recovery: no upload, delete queue flush or remote layout writes.
export const createAttachmentDownloadService = ({ supabase, noteRepo, attachmentRepo, prepareDownloadedAttachment }) => ({
  async downloadNote(noteId, options = {}) {
    const guard = async () => {
      assertSyncActive(options.signal);
      await options.guard?.('images');
      const { data, error } = await awaitSyncRequest(supabase.auth.getSession(), options.signal);
      if (error) throw error;
      if (!data?.session || data.session.user.id !== options.expectedUserId) {
        throw Object.assign(new Error('Your account changed during sync.'), { code: 'SYNC_ACCOUNT_CHANGED' });
      }
      await options.guard?.('images');
      assertSyncActive(options.signal);
      return data.session;
    };
    const session = await guard();
    const note = await noteRepo.getById(noteId);
    if (!note || note.is_deleted || note.share_origin === 'incoming') return [];
    let request = supabase.rpc('list_note_attachments', { p_local_note_id: note.cloud_id ? null : note.id, p_shared_note_id: note.cloud_id || null });
    if (session.access_token && request.setHeader) request = request.setHeader('Authorization', `Bearer ${session.access_token}`);
    if (options.signal && request.abortSignal) request = request.abortSignal(options.signal);
    const { data: remote, error } = await awaitSyncRequest(request, options.signal);
    if (error) throw error;
    const ids = new Set();
    if (!Array.isArray(remote) || remote.length > MAX_NOTE_ATTACHMENTS) throw new Error('The image list is incomplete. Please retry sync.');
    for (const image of remote) {
      if (!image || typeof image.id !== 'string' || !/^[a-z0-9_-]{1,160}$/i.test(image.id) || ids.has(image.id)
        || typeof image.storage_path !== 'string' || !image.storage_path
        || !Number.isSafeInteger(image.byte_size) || image.byte_size <= 0 || image.byte_size >= MAX_ATTACHMENT_STORED_BYTES
        || !Number.isFinite(image.width) || image.width <= 0 || !Number.isFinite(image.height) || image.height <= 0) {
        throw new Error('The image list is incomplete. Please retry sync.');
      }
      ids.add(image.id);
    }
    const local = await attachmentRepo.listByNoteId(noteId);
    const localIds = new Set(local.map((image) => image.id));
    for (const image of remote) {
      await guard();
      if (localIds.has(image.id)) continue;
      const existing = await attachmentRepo.getById(image.id);
      if (existing) throw new Error('An image conflicts with another local note. Your local image was kept.');
      if (localIds.size >= MAX_NOTE_ATTACHMENTS) throw new Error('This note already has the maximum number of local images. Your images were kept.');
      const { data, error: urlError } = await awaitSyncRequest(supabase.storage.from('note-attachments').createSignedUrl(image.storage_path, 300), options.signal);
      if (urlError || !data?.signedUrl) throw urlError || new Error('The cloud image is temporarily unavailable.');
      const prepared = await prepareDownloadedAttachment(data.signedUrl, image.id, { signal: options.signal, expectedBytes: image.byte_size });
      try {
        await guard();
        await attachmentRepo.add(noteId, {
          ...image, uri: prepared.uri, cloud_path: image.storage_path, sync_status: 'synced', beforeCommit: guard,
        });
        localIds.add(image.id);
        options.onProgress?.();
      } finally { await prepared.cleanup(); }
    }
    await guard();
    return await attachmentRepo.listByNoteId(noteId);
  },
});
