export const NOTE_BACKGROUND_MAX_BYTES = 10 * 1024 * 1024;
export const NOTE_BACKGROUND_URI_FIELD = 'background_image_uri';

const IMAGE_EXTENSIONS = new Set([
  'avif',
  'bmp',
  'gif',
  'heic',
  'heif',
  'jpeg',
  'jpg',
  'png',
  'webp',
]);

export const isLocalNoteBackgroundUri = (uri) =>
  typeof uri === 'string' &&
  (uri.startsWith('file:') || uri.startsWith('blob:') || uri.startsWith('data:image/'));

export const normalizeNoteBackgroundPreferences = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([noteId, uri]) => typeof noteId === 'string' && noteId && isLocalNoteBackgroundUri(uri)
    )
  );
};

export const applyNoteBackgroundPreferences = (notes = [], preferences = {}) =>
  notes.map((note) => ({
    ...note,
    [NOTE_BACKGROUND_URI_FIELD]: preferences[note.id] || null,
  }));

export const getNoteBackgroundOverlayColor = (surface, opacity = 0.82) => {
  const match = /^#([0-9a-f]{6})$/i.exec(surface || '');
  if (!match) return surface;
  const value = Number.parseInt(match[1], 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  const alpha = Math.max(0, Math.min(1, Number(opacity)));
  return `rgba(${red},${green},${blue},${alpha})`;
};

export const getPickedImageExtension = (asset = {}) => {
  const candidates = [asset.fileName, asset.uri, asset.mimeType]
    .filter((value) => typeof value === 'string')
    .map((value) => value.split(/[?#]/)[0].split(/[/.]/).pop().toLowerCase());
  return candidates.find((candidate) => IMAGE_EXTENSIONS.has(candidate)) || 'jpg';
};

export const getPickedImageSize = (asset = {}) => {
  const size = asset.fileSize ?? asset.file?.size;
  return Number.isFinite(size) && size >= 0 ? size : null;
};

export const isPickedImageTooLarge = (asset = {}, fallbackSize = null) => {
  const size = getPickedImageSize(asset) ?? fallbackSize;
  return Number.isFinite(size) && size > NOTE_BACKGROUND_MAX_BYTES;
};

