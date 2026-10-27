import AsyncStorage from '@react-native-async-storage/async-storage';
import { createFolderSortPreferenceService } from './folder-sort.mjs';

export const folderSortPreference = createFolderSortPreferenceService(AsyncStorage);
