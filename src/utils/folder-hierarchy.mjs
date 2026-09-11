export const MAX_FOLDER_DEPTH = 2;

export const getFolderDepthLimitMessage = (maxDepth = MAX_FOLDER_DEPTH) =>
  maxDepth === 2
    ? 'Only one subfolder level is allowed.'
    : `Folders can be nested up to ${maxDepth} levels.`;

const parentIdOf = (folder) => folder?.parent_id ?? null;

export const sortFolderSiblings = (left, right) =>
  Number(Boolean(right?.is_pinned)) - Number(Boolean(left?.is_pinned)) ||
  new Date(right?.created_at || 0) - new Date(left?.created_at || 0) ||
  String(left?.name || '').localeCompare(String(right?.name || ''));

export const getFolderPath = (folders = [], folderId) => {
  if (!folderId) return [];
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path = [];
  const visited = new Set();
  let current = byId.get(folderId);

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current);
    current = parentIdOf(current) ? byId.get(parentIdOf(current)) : null;
  }
  return current ? [] : path;
};

export const getFolderDepth = (folders = [], folderId) =>
  getFolderPath(folders, folderId).length;

export const getFolderDescendantIds = (
  folders = [],
  folderId,
  { includeSelf = true } = {}
) => {
  if (!folderId) return [];
  const childrenByParent = new Map();
  for (const folder of folders) {
    const parentId = parentIdOf(folder);
    if (!parentId) continue;
    const children = childrenByParent.get(parentId) || [];
    children.push(folder.id);
    childrenByParent.set(parentId, children);
  }

  const result = [];
  const visited = new Set();
  const queue = [folderId];
  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    if (includeSelf || id !== folderId) result.push(id);
    queue.push(...(childrenByParent.get(id) || []));
  }
  return result;
};

export const getFolderSubtreeHeight = (folders = [], folderId) => {
  const descendants = new Set(getFolderDescendantIds(folders, folderId));
  let maximum = 1;
  for (const id of descendants) {
    const path = getFolderPath(folders, id);
    const rootIndex = path.findIndex((folder) => folder.id === folderId);
    if (rootIndex !== -1) maximum = Math.max(maximum, path.length - rootIndex);
  }
  return maximum;
};

export const getVisibleSubtreeFolderIds = (folders = [], folderId) => {
  const descendants = new Set(getFolderDescendantIds(folders, folderId));
  return [...descendants].filter((id) => {
    const path = getFolderPath(folders, id);
    const rootIndex = path.findIndex((folder) => folder.id === folderId);
    if (rootIndex === -1) return false;
    return path.slice(rootIndex + 1).every((folder) => !folder.is_deleted && !folder.is_archived);
  });
};

export const getFolderHierarchyIssue = (
  folders = [],
  { maxDepth = MAX_FOLDER_DEPTH } = {}
) => {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  for (const folder of folders) {
    const parentId = parentIdOf(folder);
    if (parentId && !byId.has(parentId)) {
      return `folder ${folder.id} refers to a parent folder that does not exist.`;
    }
    if (parentId === folder.id) return `folder ${folder.id} cannot contain itself.`;
    const path = getFolderPath(folders, folder.id);
    if (!path.length) return `folder ${folder.id} is part of a circular folder path.`;
    if (path.length > maxDepth) {
      return `folder ${folder.id} is deeper than the ${maxDepth}-level limit.`;
    }
  }
  return null;
};

export const getFolderMoveError = (
  folders = [],
  folderId,
  targetParentId,
  { maxDepth = MAX_FOLDER_DEPTH } = {}
) => {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const folder = byId.get(folderId);
  if (!folder) return 'This folder no longer exists.';
  if (targetParentId === folderId) return 'A folder cannot be moved inside itself.';
  if (targetParentId !== null && !byId.has(targetParentId)) {
    return 'The destination folder no longer exists.';
  }
  if (targetParentId !== null && (byId.get(targetParentId).is_deleted || byId.get(targetParentId).is_archived)) {
    return 'The destination folder is unavailable.';
  }
  if (targetParentId !== null && getFolderDescendantIds(folders, folderId).includes(targetParentId)) {
    return 'A folder cannot be moved inside one of its subfolders.';
  }

  const destinationDepth = targetParentId === null ? 0 : getFolderDepth(folders, targetParentId);
  const subtreeHeight = getFolderSubtreeHeight(folders, folderId);
  if (targetParentId === null) {
    return subtreeHeight <= maxDepth ? null : getFolderDepthLimitMessage(maxDepth);
  }
  if (destinationDepth < 1) return 'The destination folder path is invalid.';
  if (destinationDepth + subtreeHeight > maxDepth) {
    return maxDepth === 2
      ? 'This move would create more than one subfolder level.'
      : `This move would exceed the ${maxDepth}-level folder limit.`;
  }
  return null;
};

export const isFolderEffectivelyVisible = (folders = [], folderId) => {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const visited = new Set();
  let current = byId.get(folderId);
  while (current) {
    if (visited.has(current.id) || current.is_deleted || current.is_archived) return false;
    visited.add(current.id);
    const parentId = parentIdOf(current);
    current = parentId ? byId.get(parentId) : null;
    if (parentId && !current) return false;
  }
  return visited.size > 0;
};

export const getVisibleFolders = (folders = []) =>
  folders.filter((folder) => isFolderEffectivelyVisible(folders, folder.id));

export const flattenFolderHierarchy = (folders = []) => {
  const visible = getVisibleFolders(folders);
  const visibleIds = new Set(visible.map((folder) => folder.id));
  const childrenByParent = new Map();
  for (const folder of visible) {
    const parentId = visibleIds.has(parentIdOf(folder)) ? parentIdOf(folder) : null;
    const children = childrenByParent.get(parentId) || [];
    children.push(folder);
    childrenByParent.set(parentId, children);
  }
  for (const children of childrenByParent.values()) children.sort(sortFolderSiblings);

  const flattened = [];
  const visit = (parentId, depth, path) => {
    for (const folder of childrenByParent.get(parentId) || []) {
      const nextPath = [...path, folder.name];
      flattened.push({ ...folder, depth, path: nextPath.join(' / ') });
      visit(folder.id, depth + 1, nextPath);
    }
  };
  visit(null, 0, []);
  return flattened;
};

export const buildFolderMoveDestinations = (folders = [], folderId) => [
  {
    id: null,
    name: 'Home',
    path: 'Home',
    depth: 0,
    isCurrent: parentIdOf(folders.find((folder) => folder.id === folderId)) === null,
    disabledReason: getFolderMoveError(folders, folderId, null),
  },
  ...flattenFolderHierarchy(folders)
    .filter((folder) => folder.id !== folderId)
    .map((folder) => ({
      id: folder.id,
      name: folder.name,
      path: folder.path,
      depth: folder.depth + 1,
      isLocked: !!folder.password,
      isCurrent: parentIdOf(folders.find((item) => item.id === folderId)) === folder.id,
      disabledReason: getFolderMoveError(folders, folderId, folder.id),
    })),
];
