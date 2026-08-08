import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNoteExportHtml,
  getExpenseExportCategories,
  getExpenseExportCategoryDescription,
  getExpenseExportMonthlyCommitments,
  getChecklistExportItems,
  getExportFileName,
  getExportTitle,
} from '../src/utils/note-export.mjs';

test('uses clear fallback titles and filesystem-safe export names', () => {
  assert.equal(getExportTitle('', 'note'), 'Untitled note');
  assert.equal(getExportTitle('  ', 'expense'), 'Untitled expense record');
  assert.equal(getExportTitle('  ', 'checklist'), 'Untitled checklist');
  assert.equal(getExportFileName('Bills: July / August?', 'pdf'), 'Bills July August.pdf');
});

test('renders and normalizes checklist items in PDF HTML', () => {
  const checklistItems = getChecklistExportItems([
    { id: '1', text: ' Buy milk ', completed: true },
    { id: '2', text: '<Call plumber>', completed: false },
    { id: '3', text: '   ', completed: true },
  ]);
  const html = buildNoteExportHtml({
    title: 'Weekend tasks',
    type: 'checklist',
    checklistItems,
  });

  assert.equal(checklistItems.length, 2);
  assert.match(html, /1 of 2 completed/);
  assert.match(html, /checklist-item completed/);
  assert.match(html, /Buy milk/);
  assert.match(html, /&lt;Call plumber&gt;/);
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

test('renders monthly categories and the summary note in expense PDF HTML', () => {
  const html = buildNoteExportHtml({
    title: 'July expenses',
    rows: [{ date: '12', remark: 'Lunch', amount: '18.50' }],
    total: 18.5,
    categories: [
      {
        id: 'food',
        name: 'Food & drinks',
        keywords: ['Lunch', '<coffee>'],
        amount: 1234.5,
        match_count: 2,
      },
      { id: 'cash', name: 'Cash', keywords: [], amount: 50, match_count: 0 },
    ],
    summaryNote: 'Check <receipts>\nClaim before Friday.',
  });

  assert.match(html, /Monthly summary/);
  assert.match(html, /Food &amp; drinks/);
  assert.match(html, /Lunch, &lt;coffee&gt; - 2 matching entries/);
  assert.match(html, /Manual amount/);
  assert.match(html, /Categorized total/);
  assert.match(html, /RM 1,284\.50/);
  assert.match(html, /Check &lt;receipts&gt;<br>Claim before Friday\./);
});

test('normalizes expense categories for export descriptions', () => {
  const categories = getExpenseExportCategories([
    null,
    { name: '  Petrol  ', keywords: [' Shell ', ''], amount: '80', match_count: '1' },
    { name: '   ', amount: 20 },
  ]);

  assert.equal(categories.length, 1);
  assert.equal(categories[0].name, 'Petrol');
  assert.equal(getExpenseExportCategoryDescription(categories[0]), 'Shell - 1 matching entry');
});

test('renders and normalizes monthly commitments in expense exports', () => {
  const monthlyCommitments = getExpenseExportMonthlyCommitments([
    { id: 'rent', day: '1', remark: ' Rent ', amount: '1800', isPaid: true },
    { id: 'web', day: '15', remark: 'Internet', amount: '129.90', isPaid: false },
  ]);
  const html = buildNoteExportHtml({
    title: 'August expenses',
    rows: [],
    total: 0,
    monthlyCommitments,
  });

  assert.equal(monthlyCommitments[0].remark, 'Rent');
  assert.match(html, /Monthly commitments/);
  assert.match(html, /<td>Paid<\/td><td>Rent<\/td>/);
  assert.match(html, /<td>Unpaid<\/td><td>Internet<\/td>/);
  assert.match(html, /Remaining/);
  assert.match(html, /RM 129\.90/);
});
