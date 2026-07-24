export const getDB = () => {
  throw new Error('SQLite is not available on web. Use AsyncStorage repositories instead.');
};

export const initDB = async () => ({ type: 'web' });
