import { parseReminderNote, REMINDER_NOTE_TYPE } from './reminder-note.mjs';
import { cancelReminderNotifications } from './reminder-notifications';

export const cancelNoteReminder = async (note) => {
  if (note?.note_type !== REMINDER_NOTE_TYPE) return;
  const { reminder } = parseReminderNote(note.content);
  await cancelReminderNotifications(reminder.notificationIds);
};

export const softDeleteNoteWithCleanup = async (noteRepo, note) => {
  await cancelNoteReminder(note);
  await noteRepo.softDelete(note.id);
};
