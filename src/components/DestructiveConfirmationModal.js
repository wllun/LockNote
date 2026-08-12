import React, { useMemo } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, shadow, useTheme } from '../theme';

const DestructiveConfirmationModal = ({
  visible,
  title,
  description,
  details = [],
  confirmLabel = 'Delete',
  onCancel,
  onConfirm,
}) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View
        style={[
          styles.overlay,
          Platform.OS === 'web' ? styles.overlayWeb : styles.overlayPhone,
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
          accessible={false}
        />

        <View
          style={[
            styles.panel,
            Platform.OS === 'web' ? styles.panelWeb : styles.panelPhone,
            Platform.OS !== 'web' && {
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
          accessibilityViewIsModal
          testID="destructive-confirmation-dialog"
        >
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.iconCircle}>
              <Ionicons name="trash-outline" size={26} color={colors.danger} />
            </View>

            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            <Text style={styles.description}>{description}</Text>

            {details.length > 0 && (
              <View style={styles.detailsCard}>
                {details.map((detail, index) => (
                  <View
                    key={`${detail.label}-${index}`}
                    style={[
                      styles.detailRow,
                      index > 0 && styles.detailRowBorder,
                    ]}
                  >
                    <Text style={styles.detailLabel}>{detail.label}</Text>
                    <Text
                      style={styles.detailValue}
                      numberOfLines={detail.numberOfLines}
                    >
                      {detail.value}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              style={({ pressed, focused }) => [
                styles.action,
                styles.cancelAction,
                focused && styles.actionFocused,
                pressed && styles.cancelActionPressed,
              ]}
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel deletion"
              accessibilityHint="Closes this dialog without deleting anything"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>

            <Pressable
              style={({ pressed, focused }) => [
                styles.action,
                styles.deleteAction,
                focused && styles.actionFocused,
                pressed && styles.deleteActionPressed,
              ]}
              onPress={onConfirm}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              accessibilityHint="Permanently removes this item from the expense note"
            >
              <Ionicons name="trash-outline" size={19} color={colors.onDanger} />
              <Text style={styles.deleteText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const makeStyles = (colors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(15,23,42,0.52)',
      padding: 16,
    },
    overlayPhone: {
      justifyContent: 'flex-end',
    },
    overlayWeb: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    panel: {
      width: '100%',
      maxHeight: '92%',
      paddingTop: 24,
      paddingHorizontal: 20,
      paddingBottom: 20,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadow.card,
    },
    panelPhone: {
      borderRadius: radius.lg,
    },
    panelWeb: {
      maxWidth: 420,
      borderRadius: radius.lg,
    },
    content: {
      width: '100%',
      flexShrink: 1,
    },
    contentContainer: {
      alignItems: 'center',
    },
    iconCircle: {
      width: 52,
      height: 52,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.full,
      backgroundColor: colors.dangerSoft,
    },
    title: {
      marginTop: 16,
      color: colors.text,
      fontSize: 20,
      lineHeight: 26,
      fontWeight: '800',
      textAlign: 'center',
    },
    description: {
      marginTop: 8,
      maxWidth: 340,
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
    },
    detailsCard: {
      width: '100%',
      marginTop: 20,
      paddingHorizontal: 14,
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
    },
    detailRow: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingVertical: 13,
    },
    detailRowBorder: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    detailLabel: {
      width: 64,
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '600',
    },
    detailValue: {
      flex: 1,
      color: colors.text,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '600',
      textAlign: 'right',
    },
    actions: {
      width: '100%',
      flexDirection: 'row',
      gap: 12,
      marginTop: 20,
    },
    action: {
      minHeight: 50,
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 16,
      borderWidth: 2,
      borderColor: 'transparent',
      borderRadius: radius.md,
    },
    cancelAction: {
      backgroundColor: colors.inputBg,
      borderColor: colors.border,
    },
    cancelActionPressed: {
      opacity: 0.72,
    },
    cancelText: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '700',
    },
    deleteAction: {
      backgroundColor: colors.dangerAction,
    },
    actionFocused: {
      borderColor: colors.primary,
    },
    deleteActionPressed: {
      opacity: 0.78,
    },
    deleteText: {
      color: colors.onDanger,
      fontSize: 15,
      fontWeight: '800',
    },
  });

export default DestructiveConfirmationModal;
