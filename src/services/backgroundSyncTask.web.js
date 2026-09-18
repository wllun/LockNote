// Browsers cannot run native OS tasks after the page closes.
export const BACKGROUND_SYNC_TASK = 'locknote-private-background-sync';
export const configureBackgroundSyncTask = async () => 'unavailable';
