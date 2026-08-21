import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatReminderSchedule,
  getReminderPreview,
  getReminderSchedulePreview,
  isReminderNoteEmpty,
  parseReminderNote,
  serializeReminderNote,
} from '../src/utils/reminder-note.mjs';
import { buildNoteExportHtml, getExportTitle } from '../src/utils/note-export.mjs';

const scheduledAt = '2026-08-14T01:30:00.000Z';

test('serializes and parses reminder body and schedule', () => {
  const content = serializeReminderNote({
    body: 'Call the clinic',
    reminder: { enabled: true, scheduledAt, repeat: 'weekly', notificationIds: ['abc'] },
  });
  const parsed = parseReminderNote(content);
  assert.equal(parsed.body, 'Call the clinic');
  assert.equal(parsed.reminder.enabled, true);
  assert.equal(parsed.reminder.repeat, 'weekly');
  assert.deepEqual(parsed.reminder.notificationIds, ['abc']);
});

test('preserves legacy plaintext reminder content', () => {
  assert.equal(parseReminderNote('Bring documents').body, 'Bring documents');
});

test('formats recurring schedules and previews their state', () => {
  const reminder = { enabled: true, scheduledAt, repeat: 'daily' };
  assert.match(formatReminderSchedule(reminder), /^Every day at /);
  const content = serializeReminderNote({ body: 'Medicine', reminder });
  assert.match(getReminderPreview(content), /Medicine\nEvery day/);
  assert.match(getReminderSchedulePreview(content), /^Every day at /);
  assert.doesNotMatch(getReminderSchedulePreview(content), /Medicine/);
});

test('only treats a reminder as empty when it has no meaningful state', () => {
  assert.equal(isReminderNoteEmpty({}), true);
  assert.equal(isReminderNoteEmpty({ reminder: { enabled: true, scheduledAt } }), false);
  assert.equal(isReminderNoteEmpty({ body: 'Text' }), false);
  assert.equal(isReminderNoteEmpty({ hasPassword: true }), false);
});

test('renders reminder schedule and escaped body in PDF HTML', () => {
  const html = buildNoteExportHtml({
    type: 'reminder', title: '', content: '<Bring ID>',
    reminder: { enabled: true, scheduledAt, repeat: 'monthly' },
  });
  assert.equal(getExportTitle('', 'reminder'), 'Untitled reminder');
  assert.match(html, /Reminder scheduled/);
  assert.match(html, /Monthly on day/);
  assert.match(html, /&lt;Bring ID&gt;/);
});
