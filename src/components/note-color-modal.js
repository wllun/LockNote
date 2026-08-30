import React, { useMemo } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, shadow, useTheme } from '../theme';
import {
  getNoteColorTheme,
  normalizeNoteColor,
  NOTE_COLOR_OPTIONS,
} from '../utils/note-color.mjs';

const NoteColorModal = ({ visible, value, onClose, onSelect }) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const selectedColor = normalizeNoteColor(value);

  return (
    <Modal
      visible={visible}
      transparent
      animationType={visible ? 'fade' : 'none'}
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, Platform.OS === 'web' ? styles.overlayWeb : styles.overlayPhone]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
        <View
          style={[
            styles.panel,
            Platform.OS === 'web' ? styles.panelWeb : styles.panelPhone,
            Platform.OS !== 'web' && { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
          accessibilityViewIsModal
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Note color</Text>
              <Text style={styles.subtitle}>Choose a background for this note</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close note color picker"
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.grid}>
            {NOTE_COLOR_OPTIONS.map((option) => {
              const palette = getNoteColorTheme(option.id, colors);
              const selected = selectedColor === option.id;
              return (
                <Pressable
                  key={option.id}
                  style={({ pressed }) => [
                    styles.option,
                    selected && { borderColor: palette.accent, borderWidth: 2 },
                    pressed && styles.pressed,
                  ]}
                  onPress={() => onSelect(option.id)}
                  accessibilityRole="radio"
                  accessibilityLabel={`${option.label} note color`}
                  accessibilityState={{ selected }}
                >
                  <View
                    style={[
                      styles.swatch,
                      { backgroundColor: palette.surface, borderColor: palette.accent },
                    ]}
                  >
                    {selected && <Ionicons name="checkmark" size={20} color={palette.accent} />}
                  </View>
                  <Text style={styles.optionLabel}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const makeStyles = (colors) => StyleSheet.create({
  overlay: { flex: 1, padding: 16, backgroundColor: colors.backdrop },
  overlayPhone: { justifyContent: 'flex-end' },
  overlayWeb: { alignItems: 'center', justifyContent: 'center' },
  panel: { padding: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  panelPhone: { width: '100%', borderRadius: radius.lg },
  panelWeb: { width: '100%', maxWidth: 430, borderRadius: radius.lg },
  header: { minHeight: 52, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
  title: { color: colors.text, fontSize: 19, fontWeight: '800' },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  closeButton: { width: 44, height: 44, marginTop: -8, marginRight: -8, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  option: { minWidth: 68, minHeight: 76, flexGrow: 1, flexBasis: '21%', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  swatch: { width: 34, height: 34, borderRadius: radius.full, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  optionLabel: { color: colors.text, fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.72 },
});

export default NoteColorModal;
