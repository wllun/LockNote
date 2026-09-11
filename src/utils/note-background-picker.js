import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { isPickedImageTooLarge } from './note-background.mjs';
import { noteBackgroundPreference } from './note-background-preference';

export const pickNoteBackground = async (noteId) => {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    allowsMultipleSelection: false,
    quality: 0.85,
    base64: false,
    selectionLimit: 1,
    defaultTab: Platform.OS === 'android' ? 'photos' : undefined,
  });
  if (result.canceled || !result.assets?.[0]) return { canceled: true, uri: null };
  const asset = result.assets[0];
  if (isPickedImageTooLarge(asset)) {
    const error = new Error('The selected image is larger than 10 MB.');
    error.code = 'IMAGE_TOO_LARGE';
    throw error;
  }
  return {
    canceled: false,
    uri: await noteBackgroundPreference.saveAsset(noteId, asset),
  };
};

