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

export const normalizeExpenseCategoryKeyword = (value) =>
  String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

const cleanExpenseCategoryText = (value) =>
  String(value ?? '').trim().replace(/\s+/g, ' ');

const normalizeKeywordList = (keywords) => {
  const values = Array.isArray(keywords) ? keywords : keywords ? [keywords] : [];
  return values
    .map(cleanExpenseCategoryText)
    .filter(Boolean)
    .filter(
      (keyword, index, all) =>
        all.findIndex(
          (candidate) =>
            normalizeExpenseCategoryKeyword(candidate) ===
            normalizeExpenseCategoryKeyword(keyword)
        ) === index
    );
};

const normalizeCategories = (categories) =>
  Array.isArray(categories)
    ? categories
        .filter((category) => category && typeof category === 'object' && !Array.isArray(category))
        .map((category) => {
          const name = cleanExpenseCategoryText(category.name ?? category.keyword);
          const keywords = normalizeKeywordList(
            category.keywords ?? category.keyword
          );
          const amount = Number(category.amount);
          return {
            id: category.id || createRowId(),
            name,
            keywords,
            amount: Number.isFinite(amount) && amount >= 0 ? amount : 0,
            match_count: Math.max(0, Math.floor(Number(category.match_count) || 0)),
          };
        })
        .filter((category) => normalizeExpenseCategoryKeyword(category.name))
        .filter((category, index, all) =>
          all.findIndex(
            (candidate) =>
              normalizeExpenseCategoryKeyword(candidate.name) ===
              normalizeExpenseCategoryKeyword(category.name)
          ) === index
        )
    : [];

export const parseExpenseNote = (content) => {
  if (!content) return { sourceVersion: 2, rows: [], categories: [], summaryNote: '' };

  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { sourceVersion: 2, rows: [], categories: [], summaryNote: '' };
    }

    if (Array.isArray(parsed.rows)) {
      return {
        sourceVersion: Number(parsed.version) || 2,
        rows: normalizeRows(parsed.rows),
        categories: normalizeCategories(parsed.categories),
        summaryNote: typeof parsed.summary_note === 'string' ? parsed.summary_note : '',
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
        categories: [],
        summaryNote: '',
      };
    }
  } catch {
    // Malformed content is treated as an empty expense note.
  }

  return { sourceVersion: 2, rows: [], categories: [], summaryNote: '' };
};

export const serializeExpenseNote = (rows, categories = [], summaryNote = '') =>
  JSON.stringify({
    version: 4,
    rows: normalizeRows(rows).map((row) => ({
      ...row,
      amount: normalizeExpenseAmountInput(row.amount),
    })),
    categories: normalizeCategories(categories),
    summary_note: typeof summaryNote === 'string' ? summaryNote : '',
  });

export const expenseRowHasContent = (row) =>
  !!row.date.trim() || !!row.remark.trim() || !!row.amount.trim();

export const shouldShowExpenseRowPlaceholder = (rows, rowIndex) =>
  rowIndex === 0 && !rows.some(expenseRowHasContent);

export const isExpenseNoteEmpty = (title, rows, categories = [], summaryNote = '') =>
  !title.trim() &&
  !rows.some(expenseRowHasContent) &&
  !categories.length &&
  !summaryNote.trim();

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

export const calculateExpenseCategory = (rows, keywords) => {
  const cleanedKeywords = normalizeKeywordList(keywords);
  const normalizedKeywords = cleanedKeywords.map(normalizeExpenseCategoryKeyword);
  if (!normalizedKeywords.length) {
    return { keywords: [], normalizedKeywords: [], amount: 0, matchCount: 0, matches: [] };
  }

  const matches = rows.filter((row) => {
    const remark = String(row.remark ?? '').toLowerCase();
    return normalizedKeywords.some((keyword) => remark.includes(keyword));
  });
  return {
    keywords: cleanedKeywords,
    normalizedKeywords,
    amount: calculateExpenseTotal(matches),
    matchCount: matches.length,
    matches,
  };
};

export const findExpenseCategory = (categories, name) => {
  const normalizedName = normalizeExpenseCategoryKeyword(name);
  if (!normalizedName) return null;
  return (
    normalizeCategories(categories).find(
      (category) =>
        normalizeExpenseCategoryKeyword(category.name) === normalizedName
    ) ?? null
  );
};

export const upsertExpenseCategory = (categories, draft) => {
  const name = cleanExpenseCategoryText(draft?.name);
  if (!name) return normalizeCategories(categories);
  const normalized = normalizeCategories(categories);
  const existingById = normalized.find(
    (category) => draft.id && category.id === draft.id
  );
  const existingByName = findExpenseCategory(normalized, name);
  const existing = existingById ?? existingByName;
  const nextCategory = {
    id: existing?.id || createRowId(),
    name: existingById ? name : existingByName?.name || name,
    keywords: normalizeKeywordList(draft.keywords),
    amount: Number.isFinite(Number(draft.amount)) && Number(draft.amount) >= 0
      ? Number(draft.amount)
      : 0,
    match_count: Math.max(0, Math.floor(Number(draft.matchCount) || 0)),
  };
  return existing
    ? normalized.map((category) =>
        category.id === existing.id ? nextCategory : category
      )
    : [...normalized, nextCategory];
};

export const removeExpenseCategory = (categories, categoryId) =>
  normalizeCategories(categories).filter((category) => category.id !== categoryId);

export const calculateCategorizedTotal = (categories) =>
  normalizeCategories(categories).reduce((sum, category) => sum + category.amount, 0);

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
