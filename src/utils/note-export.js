import * as Print from 'expo-print';
import { Directory, File } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { PixelRatio } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { buildNoteExportHtml, getExportFileName } from './note-export.mjs';

const requireFunction = (value, message) => {
  if (typeof value !== 'function') throw new Error(message);
  return value;
};

const measureView = (viewRef) => new Promise((resolve) => {
  if (typeof viewRef?.measure !== 'function') return resolve(null);
  viewRef.measure((_x, _y, width, height) => {
    if (width > 0 && height > 0) resolve({ width, height });
    else resolve(null);
  });
});

const getHighResolutionCaptureSize = async (viewRef) => {
  const layout = await measureView(viewRef);
  if (!layout) return {};

  const pixelRatio = PixelRatio.get();
  const sourceWidth = Math.round(layout.width * pixelRatio);
  const sourceHeight = Math.round(layout.height * pixelRatio);
  const preferredScale = Math.min(2, Math.max(1.5, 1440 / sourceWidth));
  const maxScaleForMemory = Math.sqrt(24000000 / (sourceWidth * sourceHeight));
  const scale = Math.max(1, Math.min(preferredScale, maxScaleForMemory));

  return {
    width: Math.round(sourceWidth * scale),
    height: Math.round(sourceHeight * scale),
  };
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

const createNotePdf = async (data) => {
  const printToFileAsync = requireFunction(
    Print.printToFileAsync,
    'PDF export is unavailable in this app build.'
  );
  const result = await printToFileAsync({ html: buildNoteExportHtml(data) });
  if (typeof result?.uri !== 'string' || !result.uri.trim()) {
    throw new Error('The PDF file could not be created.');
  }
  return {
    uri: result.uri,
    fileName: getExportFileName(data?.title, 'pdf', data?.type),
    mimeType: 'application/pdf',
  };
};

const createNoteImage = async (viewRef, data) => {
  if (!viewRef) throw new Error('The export preview is not ready yet.');
  const captureView = requireFunction(
    captureRef,
    'Image export is unavailable in this app build.'
  );
  const captureSize = await getHighResolutionCaptureSize(viewRef);
  const uri = await captureView(viewRef, {
    format: 'png',
    quality: 1,
    result: 'tmpfile',
    ...captureSize,
  });
  if (typeof uri !== 'string' || !uri.trim()) {
    throw new Error('The image file could not be created.');
  }
  return {
    uri,
    fileName: getExportFileName(data?.title, 'png', data?.type),
    mimeType: 'image/png',
  };
};

const isDirectoryPickerCancellation = (error) => {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('pick') && (message.includes('cancelled') || message.includes('canceled'));
};

const addTimestampToFileName = (fileName) => {
  const dotIndex = fileName.lastIndexOf('.');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (dotIndex <= 0) return `${fileName}-${stamp}`;
  return `${fileName.slice(0, dotIndex)}-${stamp}${fileName.slice(dotIndex)}`;
};

const createDestinationFile = (directory, fileName, mimeType) => {
  try {
    return directory.createFile(fileName, mimeType);
  } catch (error) {
    if (!String(error?.message || error || '').toLowerCase().includes('exist')) throw error;
    return directory.createFile(addTimestampToFileName(fileName), mimeType);
  }
};

const saveFileToSelectedDirectory = async ({ uri, fileName, mimeType }) => {
  let directory;
  try {
    directory = await Directory.pickDirectoryAsync();
  } catch (error) {
    if (isDirectoryPickerCancellation(error)) return { canceled: true };
    throw error;
  }

  const source = new File(uri);
  const destination = createDestinationFile(directory, fileName, mimeType);
  destination.write(await source.bytes());
  return { canceled: false, uri: destination.uri };
};

export const saveNotePdf = async (data) => {
  const file = await createNotePdf(data);
  return saveFileToSelectedDirectory(file);
};

export const saveNoteImage = async (viewRef, data) => {
  const file = await createNoteImage(viewRef, data);
  const isAvailableAsync = requireFunction(
    MediaLibrary.isAvailableAsync,
    'Saving images to the gallery is unavailable in this app build.'
  );
  if (!(await isAvailableAsync())) {
    throw new Error('Saving images to the gallery is not available on this device.');
  }
  const requestPermissionsAsync = requireFunction(
    MediaLibrary.requestPermissionsAsync,
    'Gallery permission is unavailable in this app build.'
  );
  const permission = await requestPermissionsAsync(true);
  if (!permission?.granted) {
    throw new Error('Allow LockNote to add images to your gallery, then try again.');
  }
  const saveToLibraryAsync = requireFunction(
    MediaLibrary.saveToLibraryAsync,
    'Saving images to the gallery is unavailable in this app build.'
  );
  await saveToLibraryAsync(file.uri);
  return { canceled: false };
};

export const shareNotePdf = async (data) => {
  const file = await createNotePdf(data);
  await shareFile(file.uri, {
    dialogTitle: `Export ${getExportFileName(data?.title, 'pdf', data?.type)}`,
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
  });
};

export const shareNoteImage = async (viewRef, data) => {
  const file = await createNoteImage(viewRef, data);
  await shareFile(file.uri, {
    dialogTitle: `Export ${getExportFileName(data?.title, 'png', data?.type)}`,
    mimeType: 'image/png',
    UTI: 'public.png',
  });
};

// Preserve the original public names for any callers outside the export modal.
export const exportNotePdf = shareNotePdf;
export const exportNoteImage = shareNoteImage;
