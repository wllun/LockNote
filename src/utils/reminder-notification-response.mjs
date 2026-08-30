import { REMINDER_NOTE_TYPE } from './reminder-note.mjs';

export const getReminderNoteIdFromResponse = (response) => {
  const data = response?.notification?.request?.content?.data;
  if (data?.noteType !== REMINDER_NOTE_TYPE) return null;

  const noteId = typeof data.noteId === 'string' ? data.noteId.trim() : '';
  return noteId || null;
};

export const getNotificationResponseKey = (response) => {
  const notification = response?.notification;
  const identifier = notification?.request?.identifier;
  if (typeof identifier !== 'string' || !identifier) return null;

  return [
    identifier,
    notification.date ?? '',
    response?.actionIdentifier ?? '',
  ].join(':');
};

export const getReminderNavigationTarget = (noteId) => ({
  name: 'Home',
  params: {
    screen: 'ReminderEditor',
    params: { noteId },
    initial: false,
  },
});
