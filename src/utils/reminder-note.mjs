export const REMINDER_NOTE_TYPE = 'reminder';
export const REMINDER_REPEATS = ['none', 'daily', 'weekly', 'monthly'];

const cleanRepeat = (value) => REMINDER_REPEATS.includes(value) ? value : 'none';

export const createDefaultReminder = (date = new Date()) => {
  const scheduled = new Date(date);
  scheduled.setDate(scheduled.getDate() + 1);
  scheduled.setHours(9, 0, 0, 0);
  return {
    enabled: false,
    scheduledAt: scheduled.toISOString(),
    repeat: 'none',
    notificationIds: [],
  };
};

export const normalizeReminder = (value, fallbackDate) => {
  const fallback = createDefaultReminder(fallbackDate);
  const scheduled = new Date(value?.scheduledAt);
  return {
    enabled: value?.enabled === true,
    scheduledAt: Number.isNaN(scheduled.getTime())
      ? fallback.scheduledAt
      : scheduled.toISOString(),
    repeat: cleanRepeat(value?.repeat),
    notificationIds: Array.isArray(value?.notificationIds)
      ? value.notificationIds.filter((id) => typeof id === 'string' && id)
      : [],
  };
};

export const parseReminderNote = (content = '') => {
  if (typeof content !== 'string' || !content.trim()) {
    return { version: 1, body: '', reminder: createDefaultReminder() };
  }
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return {
        version: 1,
        body: typeof parsed.body === 'string' ? parsed.body : '',
        reminder: normalizeReminder(parsed.reminder),
      };
    }
  } catch {}
  return { version: 1, body: content, reminder: createDefaultReminder() };
};

export const serializeReminderNote = ({ body = '', reminder } = {}) => JSON.stringify({
  version: 1,
  body: String(body ?? ''),
  reminder: normalizeReminder(reminder),
});

export const formatReminderSchedule = (reminder, locale = 'en-MY') => {
  const normalized = normalizeReminder(reminder);
  const date = new Date(normalized.scheduledAt);
  const datePart = new Intl.DateTimeFormat(locale, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  }).format(date);
  const timePart = new Intl.DateTimeFormat(locale, {
    hour: 'numeric', minute: '2-digit',
  }).format(date);
  if (normalized.repeat === 'daily') return `Every day at ${timePart}`;
  if (normalized.repeat === 'weekly') {
    const day = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date);
    return `Every ${day} at ${timePart}`;
  }
  if (normalized.repeat === 'monthly') return `Monthly on day ${date.getDate()} at ${timePart}`;
  return `${datePart} at ${timePart}`;
};

export const getReminderPreview = (content) => {
  const parsed = parseReminderNote(content);
  const body = parsed.body.trim();
  const schedule = parsed.reminder.enabled
    ? formatReminderSchedule(parsed.reminder)
    : 'Reminder is off';
  return body ? `${body}\n${schedule}` : schedule;
};

export const isReminderNoteEmpty = ({ title = '', body = '', reminder, hasPassword, isPinned } = {}) =>
  !String(title).trim() &&
  !String(body).trim() &&
  !normalizeReminder(reminder).enabled &&
  !hasPassword &&
  !isPinned;

