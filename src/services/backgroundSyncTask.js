import { requireOptionalNativeModule } from 'expo-modules-core';
import NetInfo from '@react-native-community/netinfo';
import Constants from 'expo-constants';
import { initDB } from '../db/sqlite';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { automaticSyncService } from './automaticSync';
import { hasOpenSyncEditor } from './syncActivity.mjs';
import { getNetworkAvailability } from '../utils/network-availability.mjs';

export const BACKGROUND_SYNC_TASK = 'locknote-private-background-sync';
// Older binaries can still use foreground sync without these native modules.
const nativeTasksAvailable = !!requireOptionalNativeModule('ExpoBackgroundTask')
  && !!requireOptionalNativeModule('ExpoTaskManager');
const BackgroundTask = nativeTasksAvailable ? require('expo-background-task') : null;
const TaskManager = nativeTasksAvailable ? require('expo-task-manager') : null;

// Import from index.js: headless launches do not mount React components.
if (nativeTasksAvailable) TaskManager.defineTask(BACKGROUND_SYNC_TASK, async ({ error }) => {
  if (error) return BackgroundTask.BackgroundTaskResult.Failed;
  try {
    if (!isSupabaseConfigured || hasOpenSyncEditor()) return BackgroundTask.BackgroundTaskResult.Success;
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const userId = data?.session?.user?.id;
    if (!userId || !await automaticSyncService.readEnabled(userId)) return BackgroundTask.BackgroundTaskResult.Success;
    if (getNetworkAvailability(await NetInfo.fetch()) !== true) return BackgroundTask.BackgroundTaskResult.Success;
    await initDB();
    await automaticSyncService.run(userId);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (failure) {
    if (['SYNC_DEFERRED', 'PREMIUM_REQUIRED', 'SYNC_ACCOUNT_CHANGED'].includes(failure?.code)) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

let registrationQueue = Promise.resolve();
export const configureBackgroundSyncTask = (enabled) => {
  const operation = registrationQueue.catch(() => {}).then(async () => {
    if (!nativeTasksAvailable || Constants.appOwnership === 'expo' || !await TaskManager.isAvailableAsync()) return 'unavailable';
    const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (!enabled) {
      if (registered) await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
      return 'off';
    }
    if (await BackgroundTask.getStatusAsync() !== BackgroundTask.BackgroundTaskStatus.Available) return 'restricted';
    if (!registered) await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, { minimumInterval: 15 });
    return 'scheduled';
  });
  registrationQueue = operation;
  return operation;
};
