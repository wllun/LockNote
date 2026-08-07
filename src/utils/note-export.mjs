const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

export const getExportTitle = (title = '', type = 'note') =>
  title.trim() || (type === 'expense' ? 'Untitled expense record' : 'Untitled note');

export const getExportFileName = (title = '', extension, type = 'note') => {
  const safeTitle = getExportTitle(title, type)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'LockNote export';
  return `${safeTitle}.${extension}`;
};

export const formatExportAmount = (value) => {
  const amount = Number(value);
  return (Number.isFinite(amount) && amount >= 0 ? amount : 0).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

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

export const getExpenseExportCategoryDescription = (category) => {
  const keywords = Array.isArray(category?.keywords) ? category.keywords : [];
  if (!keywords.length) return 'Manual amount';
  const matchCount = Math.max(0, Math.floor(Number(category?.match_count) || 0));
  return `${keywords.join(', ')} - ${matchCount} matching ${matchCount === 1 ? 'entry' : 'entries'}`;
};

export const getExpenseExportCategorizedTotal = (categories = []) =>
  getExpenseExportCategories(categories).reduce((sum, category) => sum + category.amount, 0);

export const buildNoteExportHtml = ({
  title,
  content = '',
  rows,
  total,
  categories = [],
  summaryNote = '',
}) => {
  const isExpense = Array.isArray(rows);
  const heading = escapeHtml(getExportTitle(title, isExpense ? 'expense' : 'note'));
  const exportCategories = getExpenseExportCategories(categories);
  const exportSummaryNote = typeof summaryNote === 'string' ? summaryNote.trim() : '';
  const monthlySummary = isExpense && (exportCategories.length || exportSummaryNote)
    ? `<section class="monthly-summary"><h2>Monthly summary</h2>${exportCategories.length
        ? `<table class="summary-table"><thead><tr><th>Category</th><th>Calculation</th><th class="amount">Amount (RM)</th></tr></thead><tbody>${exportCategories
            .map((category) => `<tr><td>${escapeHtml(category.name)}</td><td>${escapeHtml(getExpenseExportCategoryDescription(category))}</td><td class="amount">${formatExportAmount(category.amount)}</td></tr>`)
            .join('')}</tbody></table><div class="summary-total"><span>Categorized total</span><strong>RM ${formatExportAmount(getExpenseExportCategorizedTotal(exportCategories))}</strong></div>`
        : ''}${exportSummaryNote
        ? `<div class="summary-note"><h3>Summary note</h3><p>${escapeHtml(exportSummaryNote).replaceAll('\n', '<br>')}</p></div>`
        : ''}</section>`
    : '';
  const body = isExpense
    ? `<table><thead><tr><th>Date</th><th>Remark</th><th class="amount">Amount (RM)</th></tr></thead><tbody>${rows
        .filter((row) => row.date?.trim() || row.remark?.trim() || row.amount?.trim())
        .map((row) => `<tr><td>${escapeHtml(row.date)}</td><td>${escapeHtml(row.remark)}</td><td class="amount">${escapeHtml(row.amount || '0.00')}</td></tr>`)
        .join('')}</tbody></table><div class="total"><span>Total</span><strong>RM ${formatExportAmount(total)}</strong></div>${monthlySummary}`
    : `<div class="content">${escapeHtml(content).replaceAll('\n', '<br>')}</div>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    @page{margin:44px}*{box-sizing:border-box}body{margin:0;color:#172033;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:15px;line-height:1.6}header{padding-bottom:18px;margin-bottom:24px;border-bottom:2px solid #5b67f1}h1{margin:0 0 4px;font-size:26px;line-height:1.25}header p{margin:0;color:#687086;font-size:12px}.content{white-space:normal;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;font-size:14px}thead{display:table-header-group}th{background:#5b67f1;color:#fff;text-align:left}th,td{padding:10px 12px;border:1px solid #dfe3ee}tbody tr:nth-child(even){background:#f6f7fb}.amount{text-align:right;font-variant-numeric:tabular-nums}.total,.summary-total{display:flex;justify-content:flex-end;gap:18px;margin-top:16px;font-size:18px}.total span,.summary-total span{color:#687086}.total strong,.summary-total strong{color:#4854dc}.monthly-summary{margin-top:34px;padding-top:24px;border-top:2px solid #dfe3ee}.monthly-summary h2{margin:0 0 14px;font-size:20px;line-height:1.3}.summary-table th{background:#eef0fe;color:#30384c}.summary-note{margin-top:22px;padding:16px;background:#f6f7fb;border-left:4px solid #5b67f1}.summary-note h3{margin:0 0 6px;font-size:14px}.summary-note p{margin:0;color:#30384c;white-space:normal;overflow-wrap:anywhere}
  </style></head><body><header><h1>${heading}</h1><p>Exported from LockNote</p></header>${body}</body></html>`;
};
