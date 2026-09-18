import { useEffect } from 'react';
import { subscribeSyncEvents } from '../services/syncActivity.mjs';

// Keep repository/focus reloads; never replace an editor's in-memory draft.
export const useSyncRefresh = (navigation, reload) => {
  useEffect(() => subscribeSyncEvents((event) => {
    if (event.type === 'success' && navigation.isFocused()) reload();
  }), [navigation, reload]);
};
