export const TRASH_RETENTION_DAYS = 30;
export const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

const timestampOf = (value) => {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

export const isTrashExpired = (deletedAt, now = Date.now()) => {
  const deletedTimestamp = timestampOf(deletedAt);
  return deletedTimestamp !== null && now - deletedTimestamp >= TRASH_RETENTION_MS;
};

export const trashDaysRemaining = (deletedAt, now = Date.now()) => {
  const deletedTimestamp = timestampOf(deletedAt);
  if (deletedTimestamp === null) return TRASH_RETENTION_DAYS;
  const remaining = TRASH_RETENTION_MS - (now - deletedTimestamp);
  return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
};

export const formatTrashRemaining = (deletedAt, now = Date.now()) => {
  const days = trashDaysRemaining(deletedAt, now);
  if (days === 0) return 'Deleting soon';
  return `${days} day${days === 1 ? '' : 's'} left`;
};
