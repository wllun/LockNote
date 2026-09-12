import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { attachmentRepo } from '../db/attachmentRepo';
import {
  MAX_ATTACHMENT_SOURCE_BYTES,
  MAX_ATTACHMENT_STORED_BYTES,
  getAttachmentSelectionLimit,
  getResizeDimensions,
  isAttachmentSourceTooLarge,
  isAttachmentOptimized,
} from './note-attachment.mjs';

const compressionAttempts = [
  { maxDimension: 2000, quality: 0.82 },
  { maxDimension: 1800, quality: 0.72 },
  { maxDimension: 1600, quality: 0.62 },
  { maxDimension: 1400, quality: 0.52 },
  { maxDimension: 1200, quality: 0.42 },
  { maxDimension: 1000, quality: 0.32 },
  { maxDimension: 800, quality: 0.24 },
  { maxDimension: 640, quality: 0.16 },
];

const getUriSize = async (uri) => {
  if (Platform.OS === 'web') return (await (await fetch(uri)).blob()).size;
  return Number(new File(uri).size) || 0;
};

const getSourceSize = async (asset) => {
  const known = Number(asset?.fileSize ?? asset?.file?.size);
  if (Number.isFinite(known) && known >= 0) return known;
  return await getUriSize(asset.uri);
};

export const optimizeNoteAttachment = async (asset) => {
  if (!asset?.uri) throw new Error('The selected image could not be read.');
  const sourceSize = await getSourceSize(asset);
  if (isAttachmentSourceTooLarge(sourceSize)) {
    const error = new Error('Choose images that are 5 MB or smaller.');
    error.code = 'ATTACHMENT_SOURCE_TOO_LARGE';
    error.limit = MAX_ATTACHMENT_SOURCE_BYTES;
    throw error;
  }

  let latest = null;
  for (const attempt of compressionAttempts) {
    const dimensions = getResizeDimensions(asset.width, asset.height, attempt.maxDimension);
    const context = ImageManipulator.manipulate(asset.uri);
    if (dimensions.width !== asset.width || dimensions.height !== asset.height) {
      context.resize({ width: dimensions.width, height: dimensions.height });
    }
    const rendered = await context.renderAsync();
    const result = await rendered.saveAsync({
      compress: attempt.quality,
      format: SaveFormat.JPEG,
      base64: false,
    });
    const byteSize = await getUriSize(result.uri);
    latest = {
      uri: result.uri,
      mime_type: 'image/jpeg',
      width: result.width,
      height: result.height,
      byte_size: byteSize,
    };
    if (isAttachmentOptimized(byteSize)) return latest;
  }

  const error = new Error('This image could not be reduced below 1 MB. Choose another image.');
  error.code = 'ATTACHMENT_OPTIMIZE_FAILED';
  error.limit = MAX_ATTACHMENT_STORED_BYTES;
  error.result = latest;
  throw error;
};

export const pickNoteAttachments = async (noteId, currentCount = 0, anchorOffset = 0) => {
  const remaining = getAttachmentSelectionLimit(currentCount);
  if (!remaining) {
    const error = new Error('This note already has 20 images.');
    error.code = 'ATTACHMENT_LIMIT_REACHED';
    throw error;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    allowsMultipleSelection: true,
    orderedSelection: true,
    selectionLimit: remaining,
    quality: 1,
    base64: false,
    defaultTab: Platform.OS === 'android' ? 'photos' : undefined,
  });
  if (result.canceled || !result.assets?.length) return { canceled: true, attachments: [] };
  if (result.assets.length > remaining) {
    const error = new Error(`You can add only ${remaining} more ${remaining === 1 ? 'image' : 'images'} to this note.`);
    error.code = 'ATTACHMENT_LIMIT_REACHED';
    throw error;
  }

  // Validate every source before saving any of them, so a rejected selection
  // never leaves the note half-updated.
  for (const asset of result.assets) {
    const sourceSize = await getSourceSize(asset);
    if (isAttachmentSourceTooLarge(sourceSize)) {
      const error = new Error('Choose images that are 5 MB or smaller.');
      error.code = 'ATTACHMENT_SOURCE_TOO_LARGE';
      throw error;
    }
  }

  const attachments = [];
  const initialDisplayWidthRatio = result.assets.length > 1 ? 0.5 : 1;
  for (const asset of result.assets) {
    const optimized = await optimizeNoteAttachment(asset);
    attachments.push(await attachmentRepo.add(noteId, {
      ...optimized,
      anchor_offset: Math.max(0, Math.floor(Number(anchorOffset) || 0)),
      display_width_ratio: initialDisplayWidthRatio,
    }));
  }
  return { canceled: false, attachments };
};
