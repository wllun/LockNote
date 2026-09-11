import React, { useMemo } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, shadow, useTheme } from '../theme';
import { buildFolderMoveDestinations } from '../utils/folder-hierarchy.mjs';

const MoveFolderModal = ({ visible, folders, folderId, onClose, onSelect }) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const destinations = buildFolderMoveDestinations(folders, folderId);

  return (
    <Modal visible={visible} animationType={visible ? 'fade' : 'none'} transparent onRequestClose={onClose}>
      <View style={[styles.overlay, Platform.OS === 'web' ? styles.overlayWeb : styles.overlayPhone]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
        <View style={[
          styles.panel,
          Platform.OS === 'web' ? styles.panelWeb : styles.panelPhone,
          Platform.OS !== 'web' && { paddingBottom: Math.max(insets.bottom, 12) },
        ]} accessibilityViewIsModal>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Move folder</Text>
              <Text style={styles.subtitle}>Choose a parent folder</Text>
            </View>
            <Pressable style={styles.closeButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close move folder">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {destinations.map((destination) => {
              const disabled = destination.isCurrent || !!destination.disabledReason;
              return (
                <Pressable
                  key={destination.id ?? 'home'}
                  style={({ pressed }) => [
                    styles.destination,
                    destination.isCurrent && styles.current,
                    disabled && !destination.isCurrent && styles.disabled,
                    pressed && !disabled && styles.pressed,
                  ]}
                  disabled={disabled}
                  onPress={() => { onClose(); onSelect(destination.id); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Move folder to ${destination.path}`}
                  accessibilityState={{ disabled, selected: destination.isCurrent }}
                >
                  <View style={styles.icon}>
                    <Ionicons name={destination.id === null ? 'home-outline' : 'folder-outline'} size={20} color={destination.isCurrent ? colors.primary : colors.textSecondary} />
                  </View>
                  <View style={styles.labelGroup}>
                    <Text style={[styles.name, destination.isCurrent && styles.currentName]} numberOfLines={1}>{destination.path}</Text>
                    {!!destination.disabledReason && <Text style={styles.reason} numberOfLines={2}>{destination.disabledReason}</Text>}
                  </View>
                  {destination.isLocked && <Ionicons name="lock-closed" size={15} color={colors.textTertiary} />}
                  {destination.isCurrent && <Text style={styles.currentLabel}>Current</Text>}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const makeStyles = (colors) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.backdrop, padding: 16 },
  overlayPhone: { justifyContent: 'flex-end' },
  overlayWeb: { justifyContent: 'center', alignItems: 'center' },
  panel: { overflow: 'hidden', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  panelPhone: { width: '100%', maxHeight: '78%', borderRadius: radius.lg },
  panelWeb: { width: '100%', maxWidth: 460, maxHeight: '74%', borderRadius: radius.lg },
  header: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 18, paddingRight: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  subtitle: { marginTop: 2, color: colors.textSecondary, fontSize: 13 },
  closeButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full },
  list: { flexGrow: 0 },
  listContent: { paddingVertical: 8 },
  destination: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18 },
  current: { backgroundColor: colors.primarySoft },
  disabled: { opacity: 0.46 },
  pressed: { backgroundColor: colors.inputBg },
  icon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.inputBg },
  labelGroup: { flex: 1, paddingVertical: 8 },
  name: { color: colors.text, fontSize: 15, fontWeight: '600' },
  currentName: { color: colors.primary },
  reason: { marginTop: 2, color: colors.textTertiary, fontSize: 11, lineHeight: 15 },
  currentLabel: { color: colors.primary, fontSize: 11, fontWeight: '700' },
});

export default MoveFolderModal;
