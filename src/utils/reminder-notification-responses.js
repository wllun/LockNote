import * as Notifications from 'expo-notifications';

export const getLastReminderNotificationResponse = () =>
  Notifications.getLastNotificationResponse();

export const addReminderNotificationResponseListener = (listener) =>
  Notifications.addNotificationResponseReceivedListener(listener);

export const clearLastReminderNotificationResponse = async () => {
  await Notifications.clearLastNotificationResponseAsync();
};
