import * as Print from 'expo-print';
import {
  buildNoteExportHtml,
  formatExportAmount,
  getExpenseExportCategories,
  getExpenseExportCategorizedTotal,
  getExpenseExportCategoryDescription,
  getExpenseExportMonthlyCommitments,
  getExportFileName,
  getExportTitle,
} from './note-export.mjs';

export const exportNotePdf = async (data) => {
  await Print.printToFileAsync({ html: buildNoteExportHtml(data) });
};

const wrapText = (context, text, maxWidth) => {
  const lines = [];
  String(text || '').split('\n').forEach((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) return lines.push('');
    let line = words.shift();
    words.forEach((word) => {
      const candidate = `${line} ${word}`;
      if (context.measureText(candidate).width <= maxWidth) line = candidate;
      else { lines.push(line); line = word; }
    });
    lines.push(line);
  });
  return lines;
};

export const exportNoteImage = async (_viewRef, data) => {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const width = 1080;
  const padding = 72;
  context.font = '32px sans-serif';
  const rows = data.rows?.filter((row) => row.date?.trim() || row.remark?.trim() || row.amount?.trim());
  const categories = getExpenseExportCategories(data.categories);
  const commitments = getExpenseExportMonthlyCommitments(data.monthlyCommitments);
  const summaryNote = typeof data.summaryNote === 'string' ? data.summaryNote.trim() : '';
  const hasMonthlySummary = categories.length > 0 || summaryNote.length > 0;
  const contentLines = rows ? [] : wrapText(context, data.content, width - padding * 2);
  context.font = '24px sans-serif';
  const summaryNoteLines = summaryNote
    ? wrapText(context, summaryNote, width - padding * 2 - 32)
    : [];
  const expenseHeight = rows ? 262 + rows.length * 58 : 0;
  const commitmentHeight = commitments.length
    ? 172 + commitments.length * 62
    : 0;
  const summaryHeight = hasMonthlySummary
    ? 110 + categories.length * 62 + (categories.length ? 58 : 0) + (summaryNote ? 54 + summaryNoteLines.length * 38 : 0)
    : 0;
  const height = Math.max(
    480,
    rows
      ? expenseHeight + commitmentHeight + summaryHeight + 120
      : 210 + contentLines.length * 46
  );
  canvas.width = width;
  canvas.height = height;
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height);
  context.fillStyle = '#172033'; context.font = 'bold 48px sans-serif';
  context.fillText(getExportTitle(data.title, data.type), padding, 90, width - padding * 2);
  context.fillStyle = '#5b67f1'; context.fillRect(padding, 125, width - padding * 2, 4);
  context.font = '32px sans-serif'; context.fillStyle = '#172033';
  if (rows) {
    let y = 190;
    context.font = 'bold 28px sans-serif'; context.fillText('Date', padding, y); context.fillText('Remark', 260, y); context.fillText('Amount (RM)', 770, y);
    context.font = '28px sans-serif';
    rows.forEach((row) => { y += 58; context.fillText(row.date || '', padding, y); context.fillText(row.remark || '', 260, y, 480); context.textAlign = 'right'; context.fillText(row.amount || '0.00', width - padding, y); context.textAlign = 'left'; });
    y += 72; context.font = 'bold 34px sans-serif'; context.textAlign = 'right'; context.fillText(`Total  RM ${formatExportAmount(data.total)}`, width - padding, y); context.textAlign = 'left';
    if (commitments.length) {
      y += 72;
      context.fillStyle = '#dfe3ee'; context.fillRect(padding, y - 34, width - padding * 2, 3);
      context.fillStyle = '#172033'; context.font = 'bold 34px sans-serif'; context.fillText('Monthly commitments', padding, y);
      y += 42;
      commitments.forEach((item) => {
        context.fillStyle = '#30384c'; context.font = 'bold 24px sans-serif'; context.fillText(item.remark, padding, y, 420);
        context.textAlign = 'right'; context.fillText(`RM ${formatExportAmount(item.amount)}`, width - padding, y); context.textAlign = 'left';
        context.fillStyle = '#687086'; context.font = '19px sans-serif';
        context.fillText(
          `${item.day ? `Due day ${item.day}` : 'No due day'} · ${item.isPaid ? 'Paid' : 'Unpaid'}`,
          padding,
          y + 27,
          width - padding * 2 - 220
        );
        y += 62;
      });
      const remaining = commitments
        .filter((item) => !item.isPaid)
        .reduce((sum, item) => sum + item.amount, 0);
      context.fillStyle = '#4854dc'; context.font = 'bold 25px sans-serif'; context.textAlign = 'right';
      context.fillText(`Remaining  RM ${formatExportAmount(remaining)}`, width - padding, y + 4);
      context.textAlign = 'left'; y += 58;
    }
    if (hasMonthlySummary) {
      y += 72;
      context.fillStyle = '#dfe3ee'; context.fillRect(padding, y - 34, width - padding * 2, 3);
      context.fillStyle = '#172033'; context.font = 'bold 34px sans-serif'; context.fillText('Monthly summary', padding, y);
      y += 42;
      categories.forEach((category) => {
        context.fillStyle = '#30384c'; context.font = 'bold 24px sans-serif'; context.fillText(category.name, padding, y, 420);
        context.textAlign = 'right'; context.fillText(`RM ${formatExportAmount(category.amount)}`, width - padding, y); context.textAlign = 'left';
        context.fillStyle = '#687086'; context.font = '19px sans-serif'; context.fillText(getExpenseExportCategoryDescription(category), padding, y + 27, width - padding * 2 - 220);
        y += 62;
      });
      if (categories.length) {
        context.fillStyle = '#4854dc'; context.font = 'bold 25px sans-serif'; context.textAlign = 'right';
        context.fillText(`Categorized total  RM ${formatExportAmount(getExpenseExportCategorizedTotal(categories))}`, width - padding, y + 4);
        context.textAlign = 'left'; y += 58;
      }
      if (summaryNote) {
        context.fillStyle = '#f6f7fb'; context.fillRect(padding, y, width - padding * 2, 48 + summaryNoteLines.length * 38);
        context.fillStyle = '#4854dc'; context.fillRect(padding, y, 5, 48 + summaryNoteLines.length * 38);
        y += 34; context.fillStyle = '#30384c'; context.font = 'bold 21px sans-serif'; context.fillText('Summary note', padding + 22, y);
        context.font = '22px sans-serif'; summaryNoteLines.forEach((line) => { y += 38; context.fillText(line, padding + 22, y, width - padding * 2 - 44); });
      }
    }
  } else {
    let y = 190; contentLines.forEach((line) => { context.fillText(line, padding, y); y += 46; });
  }
  const link = document.createElement('a');
  link.download = getExportFileName(data.title, 'png', data.type);
  link.href = canvas.toDataURL('image/png');
  link.click();
};
