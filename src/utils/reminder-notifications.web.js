export const ensureReminderNotificationPermission = async () => false;
export const cancelReminderNotifications = async () => {};
export const scheduleReminderNotification = async () => ({
  supported: false,
  permissionDenied: false,
  notificationIds: [],
});

