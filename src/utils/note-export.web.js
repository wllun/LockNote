import {
  buildNoteExportHtml,
  formatExportAmount,
  getExpenseExportCategories,
  getExpenseExportCategorizedTotal,
  getExpenseExportCategoryDescription,
  getExpenseExportMonthlyCommitments,
  getExpenseExportRows,
  getChecklistExportItems,
  getExportFileName,
  getExportTitle,
} from './note-export.mjs';
import { formatReminderSchedule, normalizeReminder } from './reminder-note.mjs';

const callBrowserMethod = (target, method, errorMessage, ...args) => {
  if (!target || typeof target[method] !== 'function') {
    throw new Error(errorMessage);
  }
  return target[method](...args);
};

export const exportNotePdf = async (data) => {
  data = data ?? {};
  const fileName = getExportFileName(data?.title, 'pdf', data?.type);
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    throw new Error('Allow pop-ups to print or save this note as a PDF.');
  }

  printWindow.opener = null;
  callBrowserMethod(printWindow.document, 'open', 'The browser could not prepare the PDF document.');
  callBrowserMethod(
    printWindow.document,
    'write',
    'The browser could not write the PDF document.',
    buildNoteExportHtml(data)
  );
  callBrowserMethod(printWindow.document, 'close', 'The browser could not finish the PDF document.');
  printWindow.document.title = fileName;

  await new Promise((resolve, reject) => {
    let started = false;
    const startPrint = () => {
      if (started) return;
      started = true;
      try {
        if (typeof printWindow.focus === 'function') printWindow.focus();
        callBrowserMethod(printWindow, 'print', 'Printing is not supported by this browser.');
        resolve();
      } catch (error) {
        reject(error instanceof Error
          ? error
          : new Error('The browser could not open the PDF print dialog.'));
      }
    };

    if (printWindow.document.readyState === 'complete') {
      window.setTimeout(startPrint, 0);
    } else {
      if (typeof printWindow.addEventListener === 'function') {
        printWindow.addEventListener('load', startPrint, { once: true });
      } else {
        printWindow.onload = startPrint;
      }
      window.setTimeout(startPrint, 250);
    }
  });
  return { canceled: false };
};

const getCanvasDownload = async (canvas) => {
  if (
    typeof canvas.toBlob === 'function'
    && typeof URL !== 'undefined'
    && typeof URL.createObjectURL === 'function'
  ) {
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error('The export image could not be created.'));
      }, 'image/png');
    });
    const url = URL.createObjectURL(blob);
    return {
      url,
      release: () => {
        if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
      },
    };
  }

  if (typeof canvas.toDataURL !== 'function') {
    throw new Error('PNG export is not supported by this browser.');
  }

  return { url: canvas.toDataURL('image/png'), release: null };
};

const clickDownloadLink = (link) => {
  if (document.body && typeof document.body.appendChild === 'function') {
    document.body.appendChild(link);
  }
  callBrowserMethod(link, 'click', 'The browser could not start the image download.');
  if (typeof link.remove === 'function') link.remove();
  else if (link.parentNode && typeof link.parentNode.removeChild === 'function') {
    link.parentNode.removeChild(link);
  }
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
  data = data ?? {};
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The browser could not create the export image.');
  const width = 1080;
  const padding = 72;
  context.font = '32px sans-serif';
  const isExpense = Array.isArray(data?.rows);
  const rows = isExpense ? getExpenseExportRows(data.rows) : null;
  const categories = getExpenseExportCategories(data.categories);
  const commitments = getExpenseExportMonthlyCommitments(data.monthlyCommitments);
  const isChecklist = data.type === 'checklist' || Array.isArray(data.checklistItems);
  const isReminder = data.type === 'reminder';
  const checklistItems = getChecklistExportItems(data.checklistItems);
  const summaryNote = typeof data.summaryNote === 'string' ? data.summaryNote.trim() : '';
  const hasMonthlySummary = categories.length > 0 || summaryNote.length > 0;
  const contentLines = rows || isChecklist
    ? []
    : wrapText(context, data.content || 'This note is empty.', width - padding * 2);
  const checklistLines = checklistItems.map((item) => ({
    ...item,
    lines: wrapText(context, item.text, width - padding * 2 - 70),
  }));
  context.font = '24px sans-serif';
  const summaryNoteLines = summaryNote
    ? wrapText(context, summaryNote, width - padding * 2 - 32)
    : [];
  const expenseHeight = rows ? 312 + rows.length * 58 : 0;
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
      : isChecklist
        ? 250 + checklistLines.reduce((sum, item) => sum + Math.max(58, item.lines.length * 38 + 20), 0)
        : 210 + contentLines.length * 46 + (isReminder ? 110 : 0)
  );
  const preferredScale = 2;
  const maxScaleForMemory = Math.sqrt(24000000 / (width * height));
  const resolutionScale = Math.max(1, Math.min(preferredScale, maxScaleForMemory));
  canvas.width = Math.round(width * resolutionScale);
  canvas.height = Math.round(height * resolutionScale);
  context.scale(resolutionScale, resolutionScale);
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height);
  context.fillStyle = '#172033'; context.font = 'bold 48px sans-serif';
  context.fillText(getExportTitle(data?.title, data?.type), padding, 90, width - padding * 2);
  context.fillStyle = '#5b67f1'; context.fillRect(padding, 125, width - padding * 2, 4);
  context.font = '32px sans-serif'; context.fillStyle = '#172033';
  if (rows) {
    let y = 190;
    if (commitments.length) {
      context.fillStyle = '#172033'; context.font = 'bold 34px sans-serif'; context.fillText('Monthly commitments', padding, y);
      y += 42;
      commitments.forEach((item) => {
        context.fillStyle = '#30384c'; context.font = 'bold 24px sans-serif'; context.fillText(item.remark, padding, y, 420);
        context.textAlign = 'right'; context.fillText(`RM ${formatExportAmount(item.amount)}`, width - padding, y); context.textAlign = 'left';
        context.fillStyle = '#687086'; context.font = '19px sans-serif';
        context.fillText(
          `${item.day ? `Due day ${item.day}` : 'No due day'} - ${item.isPaid ? 'Paid' : 'Unpaid'}`,
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

    if (commitments.length) {
      y += 72;
      context.fillStyle = '#dfe3ee'; context.fillRect(padding, y - 34, width - padding * 2, 3);
    }
    context.fillStyle = '#172033'; context.font = 'bold 34px sans-serif';
    context.fillText('Daily expenses', padding, y);
    y += 50;
    context.font = 'bold 28px sans-serif'; context.fillText('Day', padding, y); context.fillText('Remark', 260, y); context.textAlign = 'right'; context.fillText('RM', width - padding, y); context.textAlign = 'left';
    context.font = '28px sans-serif';
    rows.forEach((row) => { y += 58; context.fillText(row.date || '', padding, y); context.fillText(row.remark || '', 260, y, 480); context.textAlign = 'right'; context.fillText(row.amount || '0.00', width - padding, y); context.textAlign = 'left'; });
    y += 72; context.font = 'bold 34px sans-serif'; context.textAlign = 'right'; context.fillText(`Total  RM ${formatExportAmount(data.total)}`, width - padding, y); context.textAlign = 'left';

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
  } else if (isChecklist) {
    let y = 190;
    const completed = checklistItems.filter((item) => item.completed).length;
    context.fillStyle = '#4854dc'; context.font = 'bold 25px sans-serif';
    context.fillText(`${completed} of ${checklistItems.length} completed`, padding, y);
    y += 42;
    checklistLines.forEach((item) => {
      const rowHeight = Math.max(58, item.lines.length * 38 + 20);
      context.strokeStyle = '#dfe3ee'; context.lineWidth = 2;
      context.strokeRect(padding, y, width - padding * 2, rowHeight - 8);
      context.fillStyle = item.completed ? '#5b67f1' : '#ffffff';
      context.fillRect(padding + 14, y + 14, 28, 28);
      context.strokeStyle = item.completed ? '#5b67f1' : '#9aa3b7';
      context.strokeRect(padding + 14, y + 14, 28, 28);
      if (item.completed) {
        context.fillStyle = '#ffffff'; context.font = 'bold 22px sans-serif';
        context.fillText('\u2713', padding + 18, y + 37);
      }
      context.fillStyle = item.completed ? '#7b8498' : '#30384c';
      context.font = '28px sans-serif';
      item.lines.forEach((line, lineIndex) => {
        context.fillText(line, padding + 62, y + 37 + lineIndex * 38, width - padding * 2 - 76);
      });
      y += rowHeight;
    });
  } else {
    let y = 190;
    if (isReminder) {
      const exportedReminder = normalizeReminder(data.reminder);
      context.fillStyle = '#f1f2ff'; context.fillRect(padding, y - 24, width - padding * 2, 82);
      context.fillStyle = '#4854dc'; context.font = 'bold 25px sans-serif';
      context.fillText(exportedReminder.enabled ? 'Reminder scheduled' : 'Reminder is off', padding + 22, y + 8);
      context.fillStyle = '#687086'; context.font = '20px sans-serif';
      context.fillText(exportedReminder.enabled ? formatReminderSchedule(exportedReminder) : 'No notification scheduled', padding + 22, y + 40, width - padding * 2 - 44);
      y += 110; context.fillStyle = '#172033'; context.font = '32px sans-serif';
    }
    contentLines.forEach((line) => { context.fillText(line, padding, y); y += 46; });
  }
  const download = await getCanvasDownload(canvas);
  const link = document.createElement('a');
  link.download = getExportFileName(data?.title, 'png', data?.type);
  link.href = download.url;
  clickDownloadLink(link);
  if (download.release) window.setTimeout(download.release, 0);
  return { canceled: false };
};

export const saveNotePdf = exportNotePdf;
export const saveNoteImage = exportNoteImage;

// Web already exposes the browser's print/download UI, so these aliases keep
// the native and web adapters identical without adding duplicate web actions.
export const shareNotePdf = exportNotePdf;
export const shareNoteImage = exportNoteImage;
