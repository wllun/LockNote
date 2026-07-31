import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNoteExportHtml,
  getExportFileName,
  getExportTitle,
} from '../src/utils/note-export.mjs';

test('uses clear fallback titles and filesystem-safe export names', () => {
  assert.equal(getExportTitle('', 'note'), 'Untitled note');
  assert.equal(getExportTitle('  ', 'expense'), 'Untitled expense record');
  assert.equal(getExportFileName('Bills: July / August?', 'pdf'), 'Bills July August.pdf');
});

test('escapes note text and preserves line breaks in PDF HTML', () => {
  const html = buildNoteExportHtml({
    title: '<Personal & private>',
    content: 'First line\n<script>alert("no")</script>',
  });

  assert.match(html, /&lt;Personal &amp; private&gt;/);
  assert.match(html, /First line<br>&lt;script&gt;alert\(&quot;no&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
});

test('renders expense rows and the calculated total in PDF HTML', () => {
  const html = buildNoteExportHtml({
    title: 'July expenses',
    rows: [{ date: '12', remark: 'Lunch & coffee', amount: '18.50' }],
    total: 18.5,
  });

  assert.match(html, /<table>/);
  assert.match(html, /Lunch &amp; coffee/);
  assert.match(html, /RM 18\.50/);
});
