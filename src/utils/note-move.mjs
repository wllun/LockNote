export const buildNoteMoveDestinations = (folders = [], currentFolderId = null) => [
  {
    id: null,
    name: 'Home',
    path: 'Home',
    isCurrent: currentFolderId === null,
    isLocked: false,
  },
  ...folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    path: folder.path || folder.name,
    isCurrent: folder.id === currentFolderId,
    isLocked: !!folder.password,
  })),
];
