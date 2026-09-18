import { useEffect, useState } from 'react';
import { useSubscription } from '../context/SubscriptionContext';
import { useAuth } from '../context/AuthContext';
import { noteRepo } from '../db/noteRepo';
import { folderRepo } from '../db/folderRepo';
import { attachmentRepo } from '../db/attachmentRepo';
import { getNoteFeatureVisibility } from '../utils/premium-visibility.mjs';

export const useNoteFeatureVisibility = (noteId, {
  backgroundUri = null, attachmentCount, readOnly = false, refreshKey = false,
} = {}) => {
  const { activePlanId, loading } = useSubscription();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [metadata, setMetadata] = useState(null);
  const [ownerPlan, setOwnerPlan] = useState(null);
  const needsAttachmentCount = attachmentCount == null;
  useEffect(() => {
    let active = true;
    const load = async () => {
      const note = await noteRepo.getById(noteId);
      const [folder, images] = await Promise.all([
        note?.folder_id ? folderRepo.getById(note.folder_id) : null,
        needsAttachmentCount ? attachmentRepo.listByNoteId(noteId) : [],
      ]);
      if (active) setMetadata({ noteId, note, isSubfolder: Boolean(folder?.parent_id), attachmentCount: images.length });
    };
    load().catch(() => { if (active) setMetadata(null); });
    return () => { active = false; };
  }, [noteId, activePlanId, refreshKey, needsAttachmentCount]);
  useEffect(() => { setOwnerPlan(null); }, [noteId, userId]);
  const current = metadata?.noteId === noteId ? metadata : null;
  const visibility = getNoteFeatureVisibility({
    plan: loading ? 'free' : activePlanId,
    note: current?.note, isSubfolder: current?.isSubfolder,
    backgroundUri, attachmentCount: attachmentCount ?? current?.attachmentCount ?? 0,
    readOnly: readOnly || loading || !current?.note, ownerPlan,
  });
  return {
    ...visibility,
    canShare: Boolean(current?.note) && visibility.canShare,
    showSharing: Boolean(current?.note) && visibility.showSharing,
    setOwnerPlan,
  };
};
