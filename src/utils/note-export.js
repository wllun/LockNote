import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { buildNoteExportHtml, getExportFileName } from './note-export.mjs';

const requireFunction = (value, message) => {
  if (typeof value !== 'function') throw new Error(message);
  return value;
};

const shareFile = async (uri, options) => {
  if (typeof uri !== 'string' || !uri.trim()) {
    throw new Error('The export file could not be created.');
  }
  const isAvailableAsync = requireFunction(
    Sharing.isAvailableAsync,
    'File sharing is unavailable in this app build.'
  );
  if (!(await isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  const shareAsync = requireFunction(
    Sharing.shareAsync,
    'File sharing is unavailable in this app build.'
  );
  await shareAsync(uri, options);
};

export const exportNotePdf = async (data) => {
  const printToFileAsync = requireFunction(
    Print.printToFileAsync,
    'PDF export is unavailable in this app build.'
  );
  const result = await printToFileAsync({ html: buildNoteExportHtml(data) });
  await shareFile(result?.uri, {
    dialogTitle: `Export ${getExportFileName(data?.title, 'pdf', data?.type)}`,
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
  });
};

export const exportNoteImage = async (viewRef, data) => {
  if (!viewRef) throw new Error('The export preview is not ready yet.');
  const captureView = requireFunction(
    captureRef,
    'Image export is unavailable in this app build.'
  );
  const uri = await captureView(viewRef, { format: 'png', quality: 1, result: 'tmpfile' });
  await shareFile(uri, {
    dialogTitle: `Export ${getExportFileName(data?.title, 'png', data?.type)}`,
    mimeType: 'image/png',
    UTI: 'public.png',
  });
};
