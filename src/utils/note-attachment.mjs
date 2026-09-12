export const MAX_NOTE_ATTACHMENTS = 20;
export const MAX_ATTACHMENT_SOURCE_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENT_STORED_BYTES = 1024 * 1024;
export const ATTACHMENT_MAX_DIMENSION = 2000;
export const MIN_ATTACHMENT_DISPLAY_WIDTH_RATIO = 0.35;

export const normalizeAttachmentDisplayWidthRatio = (value) => {
  const ratio = Number(value);
  if (!Number.isFinite(ratio)) return 1;
  return Math.max(MIN_ATTACHMENT_DISPLAY_WIDTH_RATIO, Math.min(1, ratio));
};

export const createAttachmentId = (
  timestamp = Date.now(),
  random = Math.random()
) => `${Number(timestamp).toString(36)}${Number(random).toString(36).slice(2, 12)}`;

export const isAttachmentSourceTooLarge = (byteSize) => {
  const size = Number(byteSize);
  return Number.isFinite(size) && size > MAX_ATTACHMENT_SOURCE_BYTES;
};

export const isAttachmentOptimized = (byteSize) => {
  const size = Number(byteSize);
  return Number.isFinite(size) && size >= 0 && size < MAX_ATTACHMENT_STORED_BYTES;
};

export const getAttachmentSelectionLimit = (currentCount = 0) =>
  Math.max(0, MAX_NOTE_ATTACHMENTS - Math.max(0, Math.floor(Number(currentCount) || 0)));

export const getResizeDimensions = (width, height, maxDimension = ATTACHMENT_MAX_DIMENSION) => {
  const safeWidth = Math.max(1, Math.floor(Number(width) || 1));
  const safeHeight = Math.max(1, Math.floor(Number(height) || 1));
  const longest = Math.max(safeWidth, safeHeight);
  if (longest <= maxDimension) return { width: safeWidth, height: safeHeight };
  const ratio = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(safeWidth * ratio)),
    height: Math.max(1, Math.round(safeHeight * ratio)),
  };
};

export const normalizeAttachment = (value = {}) => ({
  id: String(value.id ?? ''),
  note_id: String(value.note_id ?? ''),
  local_uri: value.local_uri || null,
  data_uri: value.data_uri || null,
  mime_type: String(value.mime_type || 'image/jpeg'),
  width: Math.max(1, Math.floor(Number(value.width) || 1)),
  height: Math.max(1, Math.floor(Number(value.height) || 1)),
  byte_size: Math.max(0, Math.floor(Number(value.byte_size) || 0)),
  display_order: Math.max(0, Math.floor(Number(value.display_order) || 0)),
  anchor_offset: Math.max(0, Math.floor(Number(value.anchor_offset) || 0)),
  display_width_ratio: normalizeAttachmentDisplayWidthRatio(value.display_width_ratio),
  cloud_path: value.cloud_path || null,
  sync_status: value.sync_status || null,
  created_at: value.created_at || null,
  updated_at: value.updated_at || null,
});

export const sortAttachments = (attachments = []) => [...attachments]
  .map(normalizeAttachment)
  .sort((left, right) => (
    left.display_order - right.display_order
    || new Date(left.created_at || 0) - new Date(right.created_at || 0)
    || left.id.localeCompare(right.id)
  ));

export const moveAttachment = (attachments = [], attachmentId, direction) => {
  const ordered = sortAttachments(attachments);
  const index = ordered.findIndex((item) => item.id === attachmentId);
  const target = direction === 'left' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= ordered.length) return ordered;
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  return ordered.map((item, displayOrder) => ({ ...item, display_order: displayOrder }));
};

export const buildInlineNoteBlocks = (content = '', attachments = []) => {
  const text = String(content ?? '');
  const ordered = sortAttachments(attachments)
    .map((item) => ({ ...item, anchor_offset: Math.min(text.length, item.anchor_offset) }))
    .sort((left, right) => left.anchor_offset - right.anchor_offset || left.display_order - right.display_order);
  const groups = [];
  for (const attachment of ordered) {
    const group = groups[groups.length - 1];
    if (group?.offset === attachment.anchor_offset) group.attachments.push(attachment);
    else groups.push({ offset: attachment.anchor_offset, attachments: [attachment] });
  }

  const blocks = [];
  let cursor = 0;
  let previousId = 'start';
  groups.forEach((group) => {
    const nextId = group.attachments[0].id;
    blocks.push({
      id: `text:${previousId}:${nextId}`,
      type: 'text',
      text: text.slice(cursor, group.offset),
      start: cursor,
      end: group.offset,
      has_next_images: true,
    });
    group.attachments.forEach((attachment) => {
      blocks.push({ id: `image:${attachment.id}`, type: 'image', attachment });
      previousId = attachment.id;
    });
    cursor = group.offset;
  });
  blocks.push({
    id: `text:${previousId}:end`,
    type: 'text',
    text: text.slice(cursor),
    start: cursor,
    end: text.length,
    has_next_images: false,
  });
  return blocks;
};

export const groupInlineNoteBlocks = (blocks = []) => {
  const grouped = [];
  for (const block of Array.isArray(blocks) ? blocks : []) {
    const previous = grouped[grouped.length - 1];
    if (block?.type === 'image' && previous?.type === 'image-row') {
      previous.blocks.push(block);
    } else if (block?.type === 'image') {
      grouped.push({ id: `row:${block.id}`, type: 'image-row', blocks: [block] });
    } else if (block) {
      grouped.push(block);
    }
  }
  return grouped;
};

export const replaceInlineTextBlock = (content, attachments, block, nextText) => {
  const text = String(content ?? '');
  const replacement = String(nextText ?? '');
  const start = Math.max(0, Math.min(text.length, Number(block?.start) || 0));
  const end = Math.max(start, Math.min(text.length, Number(block?.end) || start));
  const delta = replacement.length - (end - start);
  const nextContent = `${text.slice(0, start)}${replacement}${text.slice(end)}`;
  const nextAttachments = sortAttachments(attachments).map((attachment) => {
    const followsBlock = attachment.anchor_offset > end
      || (block?.has_next_images && attachment.anchor_offset === end);
    return followsBlock
      ? { ...attachment, anchor_offset: Math.max(0, attachment.anchor_offset + delta) }
      : attachment;
  });
  return { content: nextContent, attachments: nextAttachments };
};

export const moveInlineAttachment = (content, attachments, attachmentId, direction) => {
  const text = String(content ?? '');
  const ordered = sortAttachments(attachments);
  const selected = ordered.find((item) => item.id === attachmentId);
  if (!selected) return ordered;

  const sameAnchor = ordered.filter((item) => item.anchor_offset === selected.anchor_offset);
  const sameIndex = sameAnchor.findIndex((item) => item.id === attachmentId);
  if ((direction === 'up' && sameIndex > 0) || (direction === 'down' && sameIndex < sameAnchor.length - 1)) {
    const target = sameAnchor[direction === 'up' ? sameIndex - 1 : sameIndex + 1];
    return ordered
      .map((item) => {
        if (item.id === selected.id) return { ...item, display_order: target.display_order };
        if (item.id === target.id) return { ...item, display_order: selected.display_order };
        return item;
      })
      .sort((left, right) => left.anchor_offset - right.anchor_offset || left.display_order - right.display_order)
      .map((item, displayOrder) => ({ ...item, display_order: displayOrder }));
  }

  let anchorOffset;
  if (direction === 'up') {
    const previousBreak = text.lastIndexOf('\n', Math.max(-1, selected.anchor_offset - 2));
    anchorOffset = previousBreak < 0 ? 0 : previousBreak + 1;
  } else {
    const nextBreak = text.indexOf('\n', selected.anchor_offset);
    anchorOffset = nextBreak < 0 ? text.length : nextBreak + 1;
  }
  if (anchorOffset === selected.anchor_offset) return ordered;
  return ordered
    .map((item) => item.id === selected.id ? { ...item, anchor_offset: anchorOffset } : item)
    .sort((left, right) => left.anchor_offset - right.anchor_offset || left.display_order - right.display_order)
    .map((item, displayOrder) => ({ ...item, display_order: displayOrder }));
};

export const placeInlineAttachment = (
  content,
  attachments,
  attachmentId,
  { anchorOffset = 0, targetAttachmentId = null, placement = 'after' } = {}
) => {
  const text = String(content ?? '');
  const ordered = sortAttachments(attachments)
    .map((item) => ({ ...item, anchor_offset: Math.min(text.length, item.anchor_offset) }))
    .sort((left, right) => left.anchor_offset - right.anchor_offset || left.display_order - right.display_order);
  const selected = ordered.find((item) => item.id === attachmentId);
  if (!selected) return ordered.map((item, displayOrder) => ({ ...item, display_order: displayOrder }));

  const remaining = ordered.filter((item) => item.id !== attachmentId);
  const targetIndex = targetAttachmentId
    ? remaining.findIndex((item) => item.id === targetAttachmentId)
    : -1;
  const safeAnchor = targetIndex >= 0
    ? remaining[targetIndex].anchor_offset
    : Math.max(0, Math.min(text.length, Math.floor(Number(anchorOffset) || 0)));
  const moved = { ...selected, anchor_offset: safeAnchor };

  let insertionIndex;
  if (targetIndex >= 0) {
    insertionIndex = targetIndex + (placement === 'before' ? 0 : 1);
  } else {
    insertionIndex = remaining.findIndex((item) => item.anchor_offset > safeAnchor);
    if (insertionIndex < 0) insertionIndex = remaining.length;
  }
  remaining.splice(insertionIndex, 0, moved);
  return remaining.map((item, displayOrder) => ({ ...item, display_order: displayOrder }));
};
