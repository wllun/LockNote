import { formatReminderSchedule, normalizeReminder } from './reminder-note.mjs';
import {
  DEFAULT_EXPENSE_CURRENCY,
  getExpenseCurrency,
  normalizeExpenseCurrency,
} from './expense-record.mjs';

const asText = (value) => String(value ?? '');

const escapeHtml = (value = '') => asText(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const preserveLineBreaks = (value) => value.replace(/\n/g, '<br>');

export const getExportTitle = (title = '', type = 'note') =>
  asText(title).trim() || (
    type === 'expense'
      ? 'Untitled expense record'
      : type === 'checklist'
        ? 'Untitled checklist'
        : type === 'reminder'
          ? 'Untitled reminder'
        : 'Untitled note'
  );

const EXPORT_TYPE_LABELS = {
  note: 'Note',
  checklist: 'Checklist',
  expense: 'Expense',
  reminder: 'Reminder',
};

const padDatePart = (value) => String(value).padStart(2, '0');

export const formatExportFileTimestamp = (exportedAt = new Date()) => {
  const parsedDate = exportedAt instanceof Date ? exportedAt : new Date(exportedAt);
  const date = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())} ${padDatePart(date.getHours())}${padDatePart(date.getMinutes())}`;
};

export const addExportFileCollisionSuffix = (fileName, collisionIndex = 0) => {
  const normalizedIndex = Math.max(0, Math.floor(Number(collisionIndex) || 0));
  if (!normalizedIndex) return fileName;
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0) return `${fileName} (${normalizedIndex})`;
  return `${fileName.slice(0, dotIndex)} (${normalizedIndex})${fileName.slice(dotIndex)}`;
};

export const getExportFileName = (
  title = '',
  extension = 'pdf',
  type = 'note',
  exportedAt = new Date()
) => {
  const normalizedType = Object.prototype.hasOwnProperty.call(EXPORT_TYPE_LABELS, type)
    ? type
    : 'note';
  const typeLabel = EXPORT_TYPE_LABELS[normalizedType];
  const safeTitle = asText(title)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  const descriptiveName = safeTitle
    ? `${safeTitle} - ${typeLabel}`
    : `Untitled ${typeLabel}`;
  const safeExtension = asText(extension)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') || 'pdf';
  return `${descriptiveName} - ${formatExportFileTimestamp(exportedAt)}.${safeExtension}`;
};

export const formatExportAmount = (value) => {
  const amount = Number(value);
  return (Number.isFinite(amount) && amount >= 0 ? amount : 0).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const formatExportMoney = (
  value,
  currency = DEFAULT_EXPENSE_CURRENCY
) => `${getExpenseCurrency(currency).symbol} ${formatExportAmount(value)}`;

export const getExpenseExportCategories = (categories = []) =>
  (Array.isArray(categories) ? categories : [])
    .filter((category) => category && typeof category === 'object')
    .map((category) => ({
      ...category,
      name: String(category.name ?? '').trim(),
      keywords: (Array.isArray(category.keywords) ? category.keywords : [])
        .map((keyword) => String(keyword ?? '').trim())
        .filter(Boolean),
      amount: Number.isFinite(Number(category.amount)) && Number(category.amount) >= 0
        ? Number(category.amount)
        : 0,
      match_count: Math.max(0, Math.floor(Number(category.match_count) || 0)),
    }))
    .filter((category) => category.name);

export const getExpenseExportRows = (rows = []) =>
  (Array.isArray(rows) ? rows : [])
    .filter((row) => row && typeof row === 'object' && !Array.isArray(row))
    .map((row) => ({
      id: row.id,
      date: asText(row.date).trim(),
      remark: asText(row.remark).trim(),
      amount: asText(row.amount).trim(),
    }))
    .filter((row) => row.date || row.remark || row.amount);

export const getExpenseExportCategoryDescription = (category) => {
  const keywords = Array.isArray(category?.keywords) ? category.keywords : [];
  if (!keywords.length) return 'Manual amount';
  const matchCount = Math.max(0, Math.floor(Number(category?.match_count) || 0));
  return `${keywords.join(', ')} - ${matchCount} matching ${matchCount === 1 ? 'entry' : 'entries'}`;
};

export const getExpenseExportCategorizedTotal = (categories = []) =>
  getExpenseExportCategories(categories).reduce((sum, category) => sum + category.amount, 0);

export const getExpenseExportMonthlyCommitments = (commitments = []) =>
  (Array.isArray(commitments) ? commitments : [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      id: item.id,
      day: String(item.day ?? '').replace(/\D/g, '').slice(0, 2),
      remark: String(item.remark ?? '').trim(),
      amount: Number.isFinite(Number(item.amount)) && Number(item.amount) >= 0
        ? Number(item.amount)
        : 0,
      isPaid: item.isPaid === true,
    }))
    .filter((item) => item.remark);

export const getChecklistExportItems = (items = []) =>
  (Array.isArray(items) ? items : [])
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      id: item.id,
      text: String(item.text ?? '').trim(),
      completed: item.completed === true,
    }))
    .filter((item) => item.text);

export const buildNoteExportHtml = ({
  title,
  content = '',
  rows,
  total,
  categories = [],
  summaryNote = '',
  monthlyCommitments = [],
  currency = DEFAULT_EXPENSE_CURRENCY,
  checklistItems,
  reminder,
  type = 'note',
} = {}) => {
  const isExpense = Array.isArray(rows);
  const isChecklist = type === 'checklist' || Array.isArray(checklistItems);
  const isReminder = type === 'reminder';
  const heading = escapeHtml(
    getExportTitle(title, isExpense ? 'expense' : isChecklist ? 'checklist' : isReminder ? 'reminder' : 'note')
  );
  const exportCategories = getExpenseExportCategories(categories);
  const exportRows = getExpenseExportRows(rows);
  const exportSummaryNote = typeof summaryNote === 'string' ? summaryNote.trim() : '';
  const exportCommitments = getExpenseExportMonthlyCommitments(monthlyCommitments);
  const exportCurrency = normalizeExpenseCurrency(currency);
  const currencySymbol = getExpenseCurrency(exportCurrency).symbol;
  const exportChecklistItems = getChecklistExportItems(checklistItems);
  const commitmentSummary = exportCommitments.length
    ? `<section class="monthly-summary first-section"><h2>Monthly commitments</h2><table class="summary-table"><thead><tr><th>Status</th><th>Bill</th><th>Due</th><th class="amount">Amount (${escapeHtml(currencySymbol)})</th></tr></thead><tbody>${exportCommitments
        .map((item) => `<tr><td>${item.isPaid ? 'Paid' : 'Unpaid'}</td><td>${escapeHtml(item.remark)}</td><td>${item.day ? `Day ${escapeHtml(item.day)}` : '-'}</td><td class="amount">${formatExportAmount(item.amount)}</td></tr>`)
        .join('')}</tbody></table><div class="summary-total"><span>Remaining</span><strong>${formatExportMoney(exportCommitments.filter((item) => !item.isPaid).reduce((sum, item) => sum + item.amount, 0), exportCurrency)}</strong></div></section>`
    : '';
  const monthlySummary = isExpense && (exportCategories.length || exportSummaryNote)
    ? `<section class="monthly-summary"><h2>Monthly summary</h2>${exportCategories.length
        ? `<table class="summary-table"><thead><tr><th>Category</th><th>Calculation</th><th class="amount">Amount (${escapeHtml(currencySymbol)})</th></tr></thead><tbody>${exportCategories
            .map((category) => `<tr><td>${escapeHtml(category.name)}</td><td>${escapeHtml(getExpenseExportCategoryDescription(category))}</td><td class="amount">${formatExportAmount(category.amount)}</td></tr>`)
            .join('')}</tbody></table><div class="summary-total"><span>Categorized total</span><strong>${formatExportMoney(getExpenseExportCategorizedTotal(exportCategories), exportCurrency)}</strong></div>`
        : ''}${exportSummaryNote
        ? `<div class="summary-note"><h3>Summary note</h3><p>${preserveLineBreaks(escapeHtml(exportSummaryNote))}</p></div>`
        : ''}</section>`
    : '';
  const checklistCompleted = exportChecklistItems.filter((item) => item.completed).length;
  const exportReminder = normalizeReminder(reminder);
  const body = isExpense
    ? `${commitmentSummary}<section class="daily-expenses${exportCommitments.length ? '' : ' first-section'}"><h2>Daily expenses</h2><table><thead><tr><th>Day</th><th>Remark</th><th class="amount">${escapeHtml(currencySymbol)}</th></tr></thead><tbody>${exportRows
        .map((row) => `<tr><td>${escapeHtml(row.date)}</td><td>${escapeHtml(row.remark)}</td><td class="amount">${escapeHtml(row.amount || '0.00')}</td></tr>`)
        .join('')}</tbody></table><div class="total"><span>Total</span><strong>${formatExportMoney(total, exportCurrency)}</strong></div></section>${monthlySummary}`
    : isChecklist
      ? `<div class="checklist-summary">${checklistCompleted} of ${exportChecklistItems.length} completed</div><div class="checklist">${exportChecklistItems.length
          ? exportChecklistItems
              .map((item) => `<div class="checklist-item${item.completed ? ' completed' : ''}"><span class="checklist-box">${item.completed ? '&#10003;' : ''}</span><span>${escapeHtml(item.text)}</span></div>`)
              .join('')
          : '<p class="empty">No checklist items</p>'}</div>`
      : isReminder
        ? `<section class="reminder-card"><div><strong>${exportReminder.enabled ? 'Reminder scheduled' : 'Reminder is off'}</strong><p>${escapeHtml(exportReminder.enabled ? formatReminderSchedule(exportReminder) : 'No notification scheduled')}</p></div></section><div class="content">${preserveLineBreaks(escapeHtml(content || 'This reminder note is empty.'))}</div>`
        : `<div class="content">${preserveLineBreaks(escapeHtml(content || 'This note is empty.'))}</div>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${heading}</title><style>
    @page{margin:44px}*{box-sizing:border-box}body{margin:0;color:#172033;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:15px;line-height:1.6}header{padding-bottom:18px;margin-bottom:24px;border-bottom:2px solid #5b67f1}h1{margin:0 0 4px;font-size:26px;line-height:1.25}header p{margin:0;color:#687086;font-size:12px}.content{white-space:normal;overflow-wrap:anywhere}.reminder-card{padding:14px 16px;margin-bottom:22px;border:1px solid #c7cdfd;border-left:5px solid #5b67f1;border-radius:12px;background:#f1f2ff;break-inside:avoid}.reminder-card strong{color:#30384c}.reminder-card p{margin:2px 0 0;color:#687086;font-size:13px}.checklist-summary{margin-bottom:16px;color:#4854dc;font-size:14px;font-weight:700}.checklist{display:grid;gap:10px}.checklist-item{display:flex;align-items:flex-start;gap:12px;padding:10px 12px;border:1px solid #dfe3ee;border-radius:10px;break-inside:avoid}.checklist-item.completed{color:#7b8498;text-decoration:line-through}.checklist-box{width:22px;height:22px;flex:0 0 22px;display:inline-flex;align-items:center;justify-content:center;border:2px solid #9aa3b7;border-radius:6px;color:#fff;font-size:15px;line-height:1}.checklist-item.completed .checklist-box{background:#5b67f1;border-color:#5b67f1;text-decoration:none}.empty{color:#687086}h2{margin:0 0 14px;font-size:20px;line-height:1.3}table{width:100%;border-collapse:collapse;font-size:14px}thead{display:table-header-group}th{background:#5b67f1;color:#fff;text-align:left}th,td{padding:10px 12px;border:1px solid #dfe3ee}tbody tr:nth-child(even){background:#f6f7fb}.amount{text-align:right;font-variant-numeric:tabular-nums}.total,.summary-total{display:flex;justify-content:flex-end;gap:18px;margin-top:16px;font-size:18px}.total span,.summary-total span{color:#687086}.total strong,.summary-total strong{color:#4854dc}.daily-expenses,.monthly-summary{margin-top:34px;padding-top:24px;border-top:2px solid #dfe3ee}.first-section{margin-top:0;padding-top:0;border-top:0}.summary-table th{background:#eef0fe;color:#30384c}.summary-note{margin-top:22px;padding:16px;background:#f6f7fb;border-left:4px solid #5b67f1}.summary-note h3{margin:0 0 6px;font-size:14px}.summary-note p{margin:0;color:#30384c;white-space:normal;overflow-wrap:anywhere}
  </style></head><body><header><h1>${heading}</h1><p>Exported from LockNote</p></header>${body}</body></html>`;
};
