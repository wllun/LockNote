import * as Print from 'expo-print';
import { buildNoteExportHtml, getExportFileName, getExportTitle } from './note-export.mjs';

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
  const contentLines = rows ? [] : wrapText(context, data.content, width - padding * 2);
  const height = Math.max(480, 210 + (rows ? rows.length * 58 + 110 : contentLines.length * 46));
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
    y += 72; context.font = 'bold 34px sans-serif'; context.textAlign = 'right'; context.fillText(`Total  RM ${Number(data.total || 0).toFixed(2)}`, width - padding, y);
  } else {
    let y = 190; contentLines.forEach((line) => { context.fillText(line, padding, y); y += 46; });
  }
  const link = document.createElement('a');
  link.download = getExportFileName(data.title, 'png', data.type);
  link.href = canvas.toDataURL('image/png');
  link.click();
};
