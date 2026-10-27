import { useEffect, useState } from 'react';
import { folderSortPreference } from '../utils/folder-sort-preference';
import { normalizeFolderSortPreferences } from '../utils/folder-sort.mjs';

export const useFolderSort = (navigation) => {
  const [preferences, setPreferences] = useState(() => normalizeFolderSortPreferences());
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true, revision = 0;
    const read = async () => {
      const request = ++revision;
      try {
        const value = await folderSortPreference.read();
        if (active && request === revision) setPreferences(value);
      } catch { /* Keep the current presentation; save retries storage and reports failures. */ }
      finally { if (active) setReady(true); }
    };
    const unsubscribe = folderSortPreference.subscribe((value) => {
      revision += 1;
      if (active) { setPreferences(value); setReady(true); }
    });
    const removeFocus = navigation.addListener('focus', read);
    read();
    return () => { active = false; revision += 1; unsubscribe(); removeFocus(); };
  }, [navigation]);
  return { preferences, ready };
};
