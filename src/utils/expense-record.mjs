export const EXPENSE_NOTE_TYPE = 'expense';

const createRowId = () =>
  Date.now().toString(36) + Math.random().toString(36).substring(2, 9);

export const createExpenseRow = (values = {}) => ({
  id: values.id || createRowId(),
  date: typeof values.date === 'string' ? values.date : '',
  remark: typeof values.remark === 'string' ? values.remark : '',
  amount:
    typeof values.amount === 'string' || typeof values.amount === 'number'
      ? String(values.amount)
      : '',
});

const normalizeRows = (rows) =>
  Array.isArray(rows)
    ? rows
        .filter((row) => row && typeof row === 'object' && !Array.isArray(row))
        .map((row) => createExpenseRow(row))
    : [];

export const parseExpenseNote = (content) => {
  if (!content) return { sourceVersion: 2, rows: [] };

  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { sourceVersion: 2, rows: [] };
    }

    if (Array.isArray(parsed.rows)) {
      return {
        sourceVersion: Number(parsed.version) || 2,
        rows: normalizeRows(parsed.rows),
      };
    }

    // Convert the original single-entry expense format into the first table row.
    if (
      typeof parsed.date === 'string' ||
      typeof parsed.remark === 'string' ||
      typeof parsed.amount === 'string' ||
      typeof parsed.amount === 'number'
    ) {
      return {
        sourceVersion: 1,
        rows: [
          createExpenseRow({
            id: 'legacy-entry',
            date: parsed.date,
            remark: parsed.remark,
            amount: parsed.amount,
          }),
        ],
      };
    }
  } catch {
    // Malformed content is treated as an empty expense note.
  }

  return { sourceVersion: 2, rows: [] };
};

export const serializeExpenseNote = (rows) =>
  JSON.stringify({
    version: 2,
    rows: normalizeRows(rows).map((row) => ({
      ...row,
      amount: normalizeExpenseAmountInput(row.amount),
    })),
  });

export const expenseRowHasContent = (row) =>
  !!row.date.trim() || !!row.remark.trim() || !!row.amount.trim();

export const shouldShowExpenseRowPlaceholder = (rows, rowIndex) =>
  rowIndex === 0 && !rows.some(expenseRowHasContent);

export const isExpenseNoteEmpty = (title, rows) =>
  !title.trim() && !rows.some(expenseRowHasContent);

export const sanitizeExpenseDateInput = (value) =>
  String(value ?? '').replace(/\D/g, '');

export const sanitizeExpenseAmountInput = (value) => {
  const numeric = String(value ?? '').replace(/[^\d.]/g, '');
  const dotIndex = numeric.indexOf('.');

  if (dotIndex === -1) return numeric;

  const whole = numeric.slice(0, dotIndex) || '0';
  const decimals = numeric
    .slice(dotIndex + 1)
    .replace(/\./g, '')
    .slice(0, 2);
  return `${whole}.${decimals}`;
};

export const parseExpenseAmount = (value) => {
  const input = String(value ?? '').trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(input)) return null;

  const normalized = input.replace(/,/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
};

export const normalizeExpenseAmountInput = (value) => {
  const input = String(value ?? '').trim();
  if (!input) return '';

  const amount = parseExpenseAmount(input.endsWith('.') ? input.slice(0, -1) : input);
  return amount === null ? input : amount.toFixed(2);
};

export const calculateExpenseTotal = (rows) =>
  rows.reduce((total, row) => {
    const amount = parseExpenseAmount(row.amount);
    return amount === null ? total : total + amount;
  }, 0);

export const formatExpenseAmount = (value) => {
  const amount =
    typeof value === 'number' && Number.isFinite(value)
      ? value
      : parseExpenseAmount(value);
  if (amount === null) return String(value ?? '').trim() || '0.00';

  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};
