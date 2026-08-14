import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const channelId = 'reminders';

export const ensureReminderNotificationPermission = async () => {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(channelId, {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    });
  }
  let permissions = await Notifications.getPermissionsAsync();
  if (!permissions.granted) permissions = await Notifications.requestPermissionsAsync();
  return permissions.granted ||
    permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
};

export const cancelReminderNotifications = async (ids = []) => {
  await Promise.allSettled(
    (Array.isArray(ids) ? ids : []).map((id) =>
      Notifications.cancelScheduledNotificationAsync(id)
    )
  );
};

const notificationTriggerFor = (reminder) => {
  const date = new Date(reminder.scheduledAt);
  const common = Platform.OS === 'android' ? { channelId } : {};
  if (reminder.repeat === 'daily') {
    return { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: date.getHours(), minute: date.getMinutes(), ...common };
  }
  if (reminder.repeat === 'weekly') {
    return { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: date.getDay() + 1, hour: date.getHours(), minute: date.getMinutes(), ...common };
  }
  if (reminder.repeat === 'monthly') {
    return { type: Notifications.SchedulableTriggerInputTypes.MONTHLY, day: date.getDate(), hour: date.getHours(), minute: date.getMinutes(), ...common };
  }
  return { type: Notifications.SchedulableTriggerInputTypes.DATE, date, ...common };
};

export const scheduleReminderNotification = async ({
  noteId,
  title,
  body,
  hasPassword = false,
  reminder,
}) => {
  const allowed = await ensureReminderNotificationPermission();
  if (!allowed) return { supported: true, permissionDenied: true, notificationIds: previousIds };

  const privateTitle = hasPassword ? 'LockNote reminder' : (title.trim() || 'Reminder');
  const firstLine = body.split(/\r?\n/).find((line) => line.trim())?.trim();
  const privateBody = hasPassword
    ? 'Open LockNote to view this reminder.'
    : (firstLine || 'Open LockNote to view this reminder.');
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: privateTitle,
      body: privateBody.slice(0, 180),
      sound: 'default',
      data: { noteId, noteType: 'reminder' },
    },
    trigger: notificationTriggerFor(reminder),
  });
  return { supported: true, permissionDenied: false, notificationIds: [id] };
};
