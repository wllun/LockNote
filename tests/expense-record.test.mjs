import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateExpenseTotal,
  createExpenseRow,
  expenseRowHasContent,
  isExpenseNoteEmpty,
  parseExpenseAmount,
  parseExpenseNote,
  sanitizeExpenseAmountInput,
  sanitizeExpenseDateInput,
  serializeExpenseNote,
  shouldShowExpenseRowPlaceholder,
} from '../src/utils/expense-record.mjs';

test('serializes and parses multiple expense rows', () => {
  const rows = [
    createExpenseRow({ id: 'row-1', date: '1', remark: 'Shirt', amount: '98' }),
    createExpenseRow({ id: 'row-2', date: '1', remark: 'Dinner', amount: '89' }),
  ];

  assert.deepEqual(parseExpenseNote(serializeExpenseNote(rows)), {
    sourceVersion: 2,
    rows,
  });
});

test('converts the previous single-entry format into a table row', () => {
  assert.deepEqual(
    parseExpenseNote(
      JSON.stringify({
        version: 1,
        date: '2026-07-29',
        remark: 'Parking',
        amount: '5.00',
      })
    ),
    {
      sourceVersion: 1,
      rows: [
        {
          id: 'legacy-entry',
          date: '2026-07-29',
          remark: 'Parking',
          amount: '5.00',
        },
      ],
    }
  );
});

test('returns no rows for missing or malformed content', () => {
  assert.deepEqual(parseExpenseNote(''), { sourceVersion: 2, rows: [] });
  assert.deepEqual(parseExpenseNote('not json'), { sourceVersion: 2, rows: [] });
  assert.deepEqual(parseExpenseNote('[]'), { sourceVersion: 2, rows: [] });
});

test('accepts table amounts with optional thousands separators', () => {
  assert.equal(parseExpenseAmount('1,234.50'), 1234.5);
  assert.equal(parseExpenseAmount('12'), 12);
  assert.equal(parseExpenseAmount('0'), 0);
  assert.equal(parseExpenseAmount('-5'), null);
  assert.equal(parseExpenseAmount('1,2,3'), null);
  assert.equal(parseExpenseAmount('12.345'), null);
});

test('restricts date and amount table inputs to numeric characters', () => {
  assert.equal(sanitizeExpenseDateInput('Jun 12, 2026'), '122026');
  assert.equal(sanitizeExpenseDateInput('3'), '3');
  assert.equal(sanitizeExpenseAmountInput('RM 1,234.56'), '1234.56');
  assert.equal(sanitizeExpenseAmountInput('12.3.4'), '12.34');
  assert.equal(sanitizeExpenseAmountInput('.9'), '0.9');
});

test('calculates a total while ignoring incomplete or invalid amounts', () => {
  const rows = [
    createExpenseRow({ amount: '98' }),
    createExpenseRow({ amount: '89.50' }),
    createExpenseRow({ amount: '' }),
    createExpenseRow({ amount: 'invalid' }),
  ];

  assert.equal(calculateExpenseTotal(rows), 187.5);
});

test('detects populated rows and abandoned empty expense notes', () => {
  const blankRow = createExpenseRow({ id: 'blank' });
  const dateOnlyRow = createExpenseRow({ id: 'date', date: '1' });

  assert.equal(expenseRowHasContent(blankRow), false);
  assert.equal(expenseRowHasContent(dateOnlyRow), true);
  assert.equal(isExpenseNoteEmpty('', [blankRow]), true);
  assert.equal(isExpenseNoteEmpty('Expense Jun 2026', [blankRow]), false);
  assert.equal(isExpenseNoteEmpty('', [dateOnlyRow]), false);
});

test('shows table placeholders only in the first row while all rows are empty', () => {
  const blankRows = [
    createExpenseRow({ id: 'blank-1' }),
    createExpenseRow({ id: 'blank-2' }),
  ];

  assert.equal(shouldShowExpenseRowPlaceholder(blankRows, 0), true);
  assert.equal(shouldShowExpenseRowPlaceholder(blankRows, 1), false);

  blankRows[1].remark = 'Dinner';

  assert.equal(shouldShowExpenseRowPlaceholder(blankRows, 0), false);
  assert.equal(shouldShowExpenseRowPlaceholder(blankRows, 1), false);
});
