import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { getNoteBackgroundOverlayColor } from '../utils/note-background.mjs';

const NoteBackgroundLayer = ({ uri, surface, opacity = 0.82, borderRadius = 0 }) => {
  if (!uri) return null;
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.clip, { borderRadius }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Image source={{ uri }} resizeMode="cover" style={StyleSheet.absoluteFill} />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: getNoteBackgroundOverlayColor(surface, opacity) },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});

export default NoteBackgroundLayer;

