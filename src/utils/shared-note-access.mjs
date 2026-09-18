export const SHARING_INACTIVE_MESSAGE = 'Sharing is unavailable. The owner needs an active Plus or Pro subscription.';

// Fail closed when metadata/expiry is missing or invalid. The server remains
// authoritative; this only prevents displaying a previously authorized cache.
export const hasActiveSharingSubscription = (access, now = Date.now()) =>
  ['plus', 'pro'].includes(access?.plan)
  && Number.isFinite(Date.parse(access?.expires_at))
  && Date.parse(access.expires_at) > now;

export const isSharedNoteVisible = (note, now = Date.now()) =>
  hasActiveSharingSubscription({ plan: note?.sharing_owner_plan, expires_at: note?.sharing_expires_at }, now);

export const sharedNoteAccessError = (status = 'subscription') => Object.assign(
  new Error(status === 'subscription' ? SHARING_INACTIVE_MESSAGE : 'You no longer have access to this shared note.'),
  { code: status === 'subscription' ? 'SHARING_INACTIVE' : 'SHARED_ACCESS_REVOKED' }
);
