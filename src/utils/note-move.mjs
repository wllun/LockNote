export const buildNoteMoveDestinations = (folders = [], currentFolderId = null) => [
  {
    id: null,
    name: 'Home',
    isCurrent: currentFolderId === null,
    isLocked: false,
  },
  ...folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    isCurrent: folder.id === currentFolderId,
    isLocked: !!folder.password,
  })),
];
