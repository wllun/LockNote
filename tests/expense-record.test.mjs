import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateExpenseTotal,
  calculateExpenseCategory,
  calculateCategorizedTotal,
  createExpenseRow,
  expenseRowHasContent,
  isExpenseNoteEmpty,
  moveExpenseRow,
  moveExpenseRowToIndex,
  normalizeExpenseAmountInput,
  normalizeExpenseCategoryKeyword,
  parseExpenseAmount,
  parseExpenseNote,
  sanitizeExpenseAmountInput,
  sanitizeExpenseDateInput,
  serializeExpenseNote,
  shouldShowExpenseRowPlaceholder,
  upsertExpenseCategory,
  removeExpenseCategory,
} from '../src/utils/expense-record.mjs';

test('moves expense rows up and down without changing their data', () => {
  const rows = [
    createExpenseRow({ id: 'row-1', remark: 'Food', amount: '10.00' }),
    createExpenseRow({ id: 'row-2', remark: 'Petrol', amount: '20.00' }),
    createExpenseRow({ id: 'row-3', remark: 'Parking', amount: '5.00' }),
  ];

  const movedUp = moveExpenseRow(rows, 'row-3', 'up');
  assert.deepEqual(movedUp.map((row) => row.id), ['row-1', 'row-3', 'row-2']);
  assert.equal(movedUp[1], rows[2]);
  assert.deepEqual(
    moveExpenseRow(movedUp, 'row-3', 'down').map((row) => row.id),
    ['row-1', 'row-2', 'row-3']
  );

  assert.equal(moveExpenseRow(rows, 'row-1', 'up'), rows);
  assert.equal(moveExpenseRow(rows, 'row-3', 'down'), rows);
  assert.equal(moveExpenseRow(rows, 'missing', 'up'), rows);
});

test('moves a dragged expense row directly to its drop index', () => {
  const rows = [
    createExpenseRow({ id: 'row-1', remark: 'Food' }),
    createExpenseRow({ id: 'row-2', remark: 'Petrol' }),
    createExpenseRow({ id: 'row-3', remark: 'Parking' }),
    createExpenseRow({ id: 'row-4', remark: 'Toll' }),
  ];

  const moved = moveExpenseRowToIndex(rows, 'row-1', 2);
  assert.deepEqual(moved.map((row) => row.id), [
    'row-2',
    'row-3',
    'row-1',
    'row-4',
  ]);
  assert.equal(moved[2], rows[0]);
  assert.equal(moveExpenseRowToIndex(rows, 'row-2', 1), rows);
  assert.equal(moveExpenseRowToIndex(rows, 'missing', 2), rows);
});

test('serializes and parses multiple expense rows', () => {
  const rows = [
    createExpenseRow({ id: 'row-1', date: '1', remark: 'Shirt', amount: '98' }),
    createExpenseRow({ id: 'row-2', date: '1', remark: 'Dinner', amount: '89' }),
  ];

  assert.deepEqual(parseExpenseNote(serializeExpenseNote(rows)), {
    sourceVersion: 4,
    rows: [
      { ...rows[0], amount: '98.00' },
      { ...rows[1], amount: '89.00' },
    ],
    categories: [],
    summaryNote: '',
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
      categories: [],
      summaryNote: '',
    }
  );
});

test('returns no rows for missing or malformed content', () => {
  assert.deepEqual(parseExpenseNote(''), { sourceVersion: 2, rows: [], categories: [], summaryNote: '' });
  assert.deepEqual(parseExpenseNote('not json'), { sourceVersion: 2, rows: [], categories: [], summaryNote: '' });
  assert.deepEqual(parseExpenseNote('[]'), { sourceVersion: 2, rows: [], categories: [], summaryNote: '' });
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

test('normalizes valid expense amounts to two decimal places', () => {
  assert.equal(normalizeExpenseAmountInput('95'), '95.00');
  assert.equal(normalizeExpenseAmountInput('95.5'), '95.50');
  assert.equal(normalizeExpenseAmountInput('95.'), '95.00');
  assert.equal(normalizeExpenseAmountInput(''), '');
  assert.equal(normalizeExpenseAmountInput('invalid'), 'invalid');
});

test('detects populated rows and abandoned empty expense notes', () => {
  const blankRow = createExpenseRow({ id: 'blank' });
  const dateOnlyRow = createExpenseRow({ id: 'date', date: '1' });

  assert.equal(expenseRowHasContent(blankRow), false);
  assert.equal(expenseRowHasContent(dateOnlyRow), true);
  assert.equal(isExpenseNoteEmpty('', [blankRow]), true);
  assert.equal(
    isExpenseNoteEmpty('', [blankRow], [
      { id: 'food', name: 'Food', keywords: [], amount: 0, match_count: 0 },
    ]),
    false
  );
  assert.equal(isExpenseNoteEmpty('', [blankRow], [], 'Monthly note'), false);
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

test('calculates categories from multiple case-insensitive partial remark matches', () => {
  const rows = [
    createExpenseRow({ id: '1', remark: 'Petrol Shell', amount: '80.00' }),
    createExpenseRow({ id: '2', remark: 'PETROL', amount: '70.00' }),
    createExpenseRow({ id: '3', remark: 'Groceries', amount: '120.00' }),
    createExpenseRow({ id: '4', remark: 'petrol station', amount: '90.00' }),
  ];
  const result = calculateExpenseCategory(rows, ['  PeTrOl  ', 'Groceries']);

  assert.deepEqual(result.keywords, ['PeTrOl', 'Groceries']);
  assert.deepEqual(result.normalizedKeywords, ['petrol', 'groceries']);
  assert.equal(result.amount, 360);
  assert.equal(result.matchCount, 4);
  assert.deepEqual(result.matches.map((row) => row.id), ['1', '2', '3', '4']);
});

test('saving the same normalized category name updates instead of duplicating it', () => {
  const first = upsertExpenseCategory([], {
    name: 'Petrol', keywords: ['Petrol'], amount: 250, matchCount: 3,
  });
  const updated = upsertExpenseCategory(first, {
    name: '  PETROL ', keywords: ['Shell', 'Petrol'], amount: 270, matchCount: 4,
  });

  assert.equal(normalizeExpenseCategoryKeyword('  PETROL '), 'petrol');
  assert.equal(updated.length, 1);
  assert.equal(updated[0].id, first[0].id);
  assert.deepEqual({ ...updated[0], id: undefined }, {
    id: undefined,
    name: 'Petrol',
    keywords: ['Shell', 'Petrol'],
    amount: 270,
    match_count: 4,
  });
});

test('migrates version 3 single-keyword categories', () => {
  const parsed = parseExpenseNote(JSON.stringify({
    version: 3,
    rows: [],
    categories: [
      { id: 'petrol', keyword: 'Petrol', amount: 250, match_count: 3 },
    ],
  }));

  assert.deepEqual(parsed.categories, [
    { id: 'petrol', name: 'Petrol', keywords: ['Petrol'], amount: 250, match_count: 3 },
  ]);
  assert.equal(parsed.summaryNote, '');
});

test('persists categories and shared notes in version 4 content', () => {
  const rows = [createExpenseRow({ id: '1', remark: 'Lunch', amount: '12.00' })];
  const categories = [
    { id: 'food', name: 'Food', keywords: ['Lunch', 'Dinner'], amount: 600, match_count: 5 },
    { id: 'petrol', name: 'Petrol', keywords: ['Petrol'], amount: 250, match_count: 3 },
    { id: 'misc', name: 'Miscellaneous', keywords: [], amount: 50, match_count: 0 },
  ];
  const parsed = parseExpenseNote(
    serializeExpenseNote(rows, categories, 'Check cash receipts.')
  );

  assert.equal(parsed.sourceVersion, 4);
  assert.deepEqual(parsed.categories, categories);
  assert.equal(parsed.summaryNote, 'Check cash receipts.');
  assert.equal(calculateCategorizedTotal(parsed.categories), 900);
  assert.deepEqual(
    removeExpenseCategory(parsed.categories, 'food'),
    [categories[1], categories[2]]
  );
});
