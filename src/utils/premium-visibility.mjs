import { canUsePremiumFeature } from './premium-access.mjs';

// Visibility mirrors action gates, including non-destructive downgrade recovery.
export const getNoteFeatureVisibility = ({
  plan = 'free', note = null, isSubfolder = false, backgroundUri = null,
  attachmentCount = 0, readOnly = false, ownerPlan = null,
} = {}) => {
  const incoming = note?.share_origin === 'incoming';
  const canShare = !incoming && canUsePremiumFeature(plan, 'sharing');
  const canChangeBackground = canUsePremiumFeature(plan, 'backgrounds');
  return {
    canExport: canUsePremiumFeature(plan, 'export')
      || Boolean(isSubfolder || backgroundUri || attachmentCount > 0),
    canInsertImages: !readOnly && (incoming
      ? note?.share_role === 'editor' && ownerPlan === 'pro'
      : canUsePremiumFeature(plan, 'attachments')),
    canChangeBackground,
    showBackground: canChangeBackground || Boolean(backgroundUri),
    canShare,
    showSharing: canShare || Boolean(note?.cloud_id),
    sharingLabel: canShare ? 'Share' : 'Manage access',
  };
};

export const getSubfolderVisibility = (plan, isSubfolder, childCount = 0) => {
  const canNest = canUsePremiumFeature(plan, 'nesting');
  return {
    showSection: !isSubfolder && (canNest || childCount > 0),
    canAddSubfolder: !isSubfolder && canNest,
    canAddNote: !isSubfolder || canNest,
  };
};
