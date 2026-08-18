const DEFAULT_LOCALE = 'en-MY';

export const formatNoteUpdatedAt = (
  value,
  { locale = DEFAULT_LOCALE, timeZone } = {}
) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'Updated date unavailable';

  const formatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...(timeZone ? { timeZone } : {}),
  });

  return `Updated ${formatter.format(date)}`;
};
