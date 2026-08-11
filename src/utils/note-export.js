import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { buildNoteExportHtml, getExportFileName } from './note-export.mjs';

const shareFile = async (uri, options) => {
  if (typeof uri !== 'string' || !uri.trim()) {
    throw new Error('The export file could not be created.');
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(uri, options);
};

export const exportNotePdf = async (data) => {
  const result = await Print.printToFileAsync({ html: buildNoteExportHtml(data) });
  await shareFile(result?.uri, {
    dialogTitle: `Export ${getExportFileName(data?.title, 'pdf', data?.type)}`,
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
  });
};

export const exportNoteImage = async (viewRef, data) => {
  if (!viewRef) throw new Error('The export preview is not ready yet.');
  const uri = await captureRef(viewRef, { format: 'png', quality: 1, result: 'tmpfile' });
  await shareFile(uri, {
    dialogTitle: `Export ${getExportFileName(data?.title, 'png', data?.type)}`,
    mimeType: 'image/png',
    UTI: 'public.png',
  });
};
