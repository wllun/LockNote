import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppAlert as Alert } from '../utils/app-alert';
import { radius, shadow, useTheme } from '../theme';
import { pickNoteBackground } from '../utils/note-background-picker';
import { noteBackgroundPreference } from '../utils/note-background-preference';
import NoteBackgroundLayer from './note-background-layer';

const NoteBackgroundModal = ({ visible, noteId, value, onClose, onChanged }) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) setBusy(false);
  }, [visible]);

  const chooseImage = async () => {
    if (!noteId || busy) return;
    setBusy(true);
    try {
      const result = await pickNoteBackground(noteId);
      if (!result.canceled) {
        onChanged?.(result.uri);
        onClose?.();
      }
    } catch (error) {
      Alert.alert(
        'Background not changed',
        error?.code === 'IMAGE_TOO_LARGE'
          ? 'Choose an image that is 10 MB or smaller.'
          : 'LockNote could not save that image. Try another image.'
      );
    } finally {
      setBusy(false);
    }
  };

  const removeImage = async () => {
    if (!noteId || busy) return;
    setBusy(true);
    try {
      await noteBackgroundPreference.remove(noteId);
      onChanged?.(null);
      onClose?.();
    } catch {
      Alert.alert('Background not removed', 'LockNote could not remove this background image.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType={visible ? 'fade' : 'none'}
      onRequestClose={busy ? undefined : onClose}
    >
      <View style={[styles.overlay, Platform.OS === 'web' ? styles.overlayWeb : styles.overlayPhone]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={busy ? undefined : onClose}
          accessible={false}
        />
        <View
          style={[
            styles.panel,
            Platform.OS === 'web' ? styles.panelWeb : styles.panelPhone,
            Platform.OS !== 'web' && { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
          accessibilityViewIsModal
        >
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Note background</Text>
              <Text style={styles.subtitle}>Stored only on this device</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
              onPress={onClose}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Close note background settings"
              accessibilityState={{ disabled: busy }}
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.preview}>
            {value ? (
              <>
                <NoteBackgroundLayer uri={value} surface={colors.card} opacity={0.72} borderRadius={radius.md} />
                <View style={styles.previewCopy}>
                  <Text style={styles.previewTitle}>Readable by design</Text>
                  <Text style={styles.previewText}>A soft theme overlay keeps note text clear.</Text>
                </View>
              </>
            ) : (
              <View style={styles.emptyPreview}>
                <Ionicons name="image-outline" size={30} color={colors.textTertiary} />
                <Text style={styles.emptyText}>No background image</Text>
              </View>
            )}
          </View>

          <Text style={styles.helper}>Choose one image up to 10 MB. It is not included in sync, sharing, or backups.</Text>

          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && !busy && styles.pressed]}
              onPress={chooseImage}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={value ? 'Change note background image' : 'Choose note background image'}
              accessibilityState={{ disabled: busy }}
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.card} />
              ) : (
                <Ionicons name="images-outline" size={20} color={colors.card} />
              )}
              <Text style={styles.primaryButtonText}>{value ? 'Change image' : 'Choose image'}</Text>
            </Pressable>
            {!!value && (
              <Pressable
                style={({ pressed }) => [styles.removeButton, pressed && !busy && styles.pressed]}
                onPress={removeImage}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Remove note background image"
                accessibilityState={{ disabled: busy }}
              >
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
                <Text style={styles.removeButtonText}>Remove</Text>
              </Pressable>
            )}
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
  headerCopy: { flex: 1, minWidth: 0, paddingRight: 12 },
  title: { color: colors.text, fontSize: 19, fontWeight: '800' },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  closeButton: { width: 44, height: 44, marginTop: -8, marginRight: -8, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  preview: { position: 'relative', minHeight: 142, overflow: 'hidden', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.inputBg, justifyContent: 'center' },
  previewCopy: { padding: 20, gap: 5 },
  previewTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  previewText: { maxWidth: 250, color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  emptyPreview: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  helper: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 12 },
  actions: { gap: 10, marginTop: 16 },
  primaryButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.primary },
  primaryButtonText: { color: colors.card, fontSize: 15, fontWeight: '800' },
  removeButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.danger },
  removeButtonText: { color: colors.danger, fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.72 },
});

export default NoteBackgroundModal;
