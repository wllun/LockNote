import { attachmentRepo } from '../db/attachmentRepo';
import { noteRepo } from '../db/noteRepo';
import { isSupabaseConfigured, supabase } from './supabaseClient';
import { prepareDownloadedAttachment, readAttachmentUploadBody } from '../utils/attachment-cloud-file';
import { MAX_NOTE_ATTACHMENTS } from '../utils/note-attachment.mjs';
import { attachmentDeleteQueue } from './attachmentDeleteQueue';

const BUCKET = 'note-attachments';
let syncQueue = Promise.resolve();
const enqueueCloud = (action) => {
  const operation = syncQueue.catch(() => {}).then(action);
  syncQueue = operation;
  return operation;
};

const getSession = async () => {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data?.session ?? null;
};

const cloudNoteParams = (note) => ({
  p_local_note_id: note.cloud_id ? null : note.id,
  p_shared_note_id: note.cloud_id || null,
});

const registerOne = async (note, attachment, path) => {
  const { error } = await supabase.rpc('register_note_attachment', {
    p_id: attachment.id,
    ...cloudNoteParams(note),
    p_storage_path: path,
    p_mime_type: attachment.mime_type,
    p_byte_size: attachment.byte_size,
    p_width: attachment.width,
    p_height: attachment.height,
    p_display_order: attachment.display_order,
    p_anchor_offset: attachment.anchor_offset,
    p_display_width_ratio: attachment.display_width_ratio,
  });
  if (error) throw error;
};

const uploadOne = async (session, note, attachment) => {
  const targetSegment = `/${note.cloud_id || note.id}/`;
  if (attachment.cloud_path?.includes(targetSegment)) return attachment;
  if (attachment.cloud_path) {
    await registerOne(note, attachment, attachment.cloud_path);
    return attachment;
  }
  const path = `${session.user.id}/${note.cloud_id || note.id}/${attachment.id}.jpg`;
  await attachmentRepo.update(attachment.id, { sync_status: 'uploading' });
  const body = await readAttachmentUploadBody(attachment.local_uri);
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, body, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (uploadError) {
    await attachmentRepo.update(attachment.id, { sync_status: 'pending' });
    throw uploadError;
  }
  try {
    await registerOne(note, attachment, path);
  } catch (registerError) {
    await supabase.storage.from(BUCKET).remove([path]);
    await attachmentRepo.update(attachment.id, { sync_status: 'pending' });
    throw registerError;
  }
  return await attachmentRepo.update(attachment.id, { cloud_path: path, sync_status: 'synced' });
};

const downloadMissing = async (note, remote, local) => {
  const localIds = new Set(local.map((item) => item.id));
  for (const item of remote) {
    if (localIds.has(item.id) || localIds.size >= MAX_NOTE_ATTACHMENTS) continue;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(item.storage_path, 300);
    if (error || !data?.signedUrl) continue;
    const prepared = await prepareDownloadedAttachment(data.signedUrl, item.id);
    try {
      await attachmentRepo.add(note.id, {
        id: item.id,
        uri: prepared.uri,
        mime_type: item.mime_type,
        byte_size: item.byte_size,
        width: item.width,
        height: item.height,
        display_order: item.display_order,
        anchor_offset: item.anchor_offset,
        display_width_ratio: item.display_width_ratio,
        cloud_path: item.storage_path,
        sync_status: 'synced',
        created_at: item.created_at,
        updated_at: item.updated_at,
      });
      localIds.add(item.id);
    } finally {
      prepared.cleanup();
    }
  }
};

const removeCloudRecord = async (item) => {
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([item.cloud_path]);
  if (storageError) throw storageError;
  const { error } = await supabase.rpc('delete_note_attachment', {
    p_id: item.id,
    p_local_note_id: item.local_note_id,
    p_shared_note_id: item.shared_note_id,
  });
  if (error) throw error;
};

export const attachmentCloudService = {
  async syncNote(noteOrId) {
    return await enqueueCloud(async () => {
      const note = typeof noteOrId === 'string' ? await noteRepo.getById(noteOrId) : noteOrId;
      if (!note) return [];
      const session = await getSession();
      if (!session) return await attachmentRepo.listByNoteId(note.id);
      await attachmentDeleteQueue.flush(removeCloudRecord);

      let local = await attachmentRepo.listByNoteId(note.id);
      for (const attachment of local) {
        try { await uploadOne(session, note, attachment); } catch {}
      }
      const { data, error } = await supabase.rpc('list_note_attachments', cloudNoteParams(note));
      if (!error && Array.isArray(data)) {
        const remoteIds = new Set(data.map((item) => item.id));
        const remoteById = new Map(data.map((item) => [item.id, item]));
        for (const attachment of local) {
          if (attachment.cloud_path && !remoteIds.has(attachment.id)) {
            await attachmentRepo.remove(attachment.id);
          } else if (attachment.cloud_path) {
            const remote = remoteById.get(attachment.id);
            if (remote && (
              remote.display_order !== attachment.display_order
              || remote.anchor_offset !== attachment.anchor_offset
              || Math.abs(remote.display_width_ratio - attachment.display_width_ratio) >= 0.005
            )) {
              await attachmentRepo.update(attachment.id, {
                display_order: remote.display_order,
                anchor_offset: remote.anchor_offset,
                display_width_ratio: remote.display_width_ratio,
              });
            }
          }
        }
        local = await attachmentRepo.listByNoteId(note.id);
        await downloadMissing(note, data, local);
        await attachmentRepo.reorder(note.id, data.map((item) => item.id));
      }
      local = await attachmentRepo.listByNoteId(note.id);
      return local;
    });
  },

  async remove(note, attachment) {
    if (!attachment?.cloud_path) return;
    return await enqueueCloud(async () => {
      const pending = {
        id: attachment.id,
        cloud_path: attachment.cloud_path,
        local_note_id: note?.cloud_id ? null : note?.id || attachment.note_id,
        shared_note_id: note?.cloud_id || null,
      };
      try {
        if (!(await getSession())) throw new Error('Sign in later to finish cloud cleanup.');
        await removeCloudRecord(pending);
      } catch {
        await attachmentDeleteQueue.add(note, attachment);
        return { pending: true };
      }
      return { pending: false };
    });
  },

  async removeAll(note) {
    if (!note) return;
    const attachments = await attachmentRepo.listByNoteId(note.id);
    for (const attachment of attachments) {
      if (attachment.cloud_path) await this.remove(note, attachment);
    }
  },

  async reorder(note, layout) {
    return await enqueueCloud(async () => {
      if (!(await getSession())) return;
      const { error } = await supabase.rpc('reorder_note_attachments', {
        ...cloudNoteParams(note),
        p_layout: (Array.isArray(layout) ? layout : []).map((item, index) => ({
          id: item.id,
          display_order: index,
          anchor_offset: Math.max(0, Math.floor(Number(item.anchor_offset) || 0)),
          display_width_ratio: Math.max(0.35, Math.min(1, Number(item.display_width_ratio) || 1)),
        })),
      });
      if (error) throw error;
    });
  },
};
