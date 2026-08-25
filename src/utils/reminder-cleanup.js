import { parseReminderNote, REMINDER_NOTE_TYPE } from './reminder-note.mjs';
import { cancelReminderNotifications } from './reminder-notifications';
import { collaborationService } from '../services/collaborationService';
import { noteColorPreference } from './note-color-preference';

export const cancelNoteReminder = async (note) => {
  if (note?.note_type !== REMINDER_NOTE_TYPE) return;
  const { reminder } = parseReminderNote(note.content);
  await cancelReminderNotifications(reminder.notificationIds);
};

export const softDeleteNoteWithCleanup = async (noteRepo, note) => {
  await cancelNoteReminder(note);
  if (note?.cloud_id) {
    await collaborationService.delete(note.id);
    await noteColorPreference.remove(note.id);
    return;
  }
  await noteRepo.softDelete(note.id);
  await noteColorPreference.remove(note.id);
};
