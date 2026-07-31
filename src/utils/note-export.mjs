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

export const buildNoteExportHtml = ({ title, content = '', rows, total }) => {
  const isExpense = Array.isArray(rows);
  const heading = escapeHtml(getExportTitle(title, isExpense ? 'expense' : 'note'));
  const body = isExpense
    ? `<table><thead><tr><th>Date</th><th>Remark</th><th class="amount">Amount (RM)</th></tr></thead><tbody>${rows
        .filter((row) => row.date?.trim() || row.remark?.trim() || row.amount?.trim())
        .map((row) => `<tr><td>${escapeHtml(row.date)}</td><td>${escapeHtml(row.remark)}</td><td class="amount">${escapeHtml(row.amount || '0.00')}</td></tr>`)
        .join('')}</tbody></table><div class="total"><span>Total</span><strong>RM ${Number(total || 0).toFixed(2)}</strong></div>`
    : `<div class="content">${escapeHtml(content).replaceAll('\n', '<br>')}</div>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    @page{margin:44px}*{box-sizing:border-box}body{margin:0;color:#172033;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:15px;line-height:1.6}header{padding-bottom:18px;margin-bottom:24px;border-bottom:2px solid #5b67f1}h1{margin:0 0 4px;font-size:26px;line-height:1.25}header p{margin:0;color:#687086;font-size:12px}.content{white-space:normal;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;font-size:14px}th{background:#5b67f1;color:#fff;text-align:left}th,td{padding:10px 12px;border:1px solid #dfe3ee}tbody tr:nth-child(even){background:#f6f7fb}.amount{text-align:right}.total{display:flex;justify-content:flex-end;gap:18px;margin-top:16px;font-size:18px}.total span{color:#687086}.total strong{color:#4854dc}
  </style></head><body><header><h1>${heading}</h1><p>Exported from LockNote</p></header>${body}</body></html>`;
};
