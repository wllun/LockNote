import React, { useMemo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, shadow, useTheme } from '../theme';

const variantConfig = {
  danger: { icon: 'warning-outline', colorKey: 'danger', softColorKey: 'dangerSoft' },
  error: { icon: 'alert-circle-outline', colorKey: 'danger', softColorKey: 'dangerSoft' },
  warning: { icon: 'warning-outline', colorKey: 'folder', softColorKey: 'folderSoft' },
  info: { icon: 'information-circle-outline', colorKey: 'primary', softColorKey: 'primarySoft' },
};

const AppDialogModal = ({
  visible,
  title,
  message,
  details = [],
  variant = 'info',
  iconName,
  actions = [],
  onRequestClose,
  testID = 'app-dialog',
  contained = false,
}) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const config = variantConfig[variant] || variantConfig.info;
  const iconColor = colors[config.colorKey];
  const iconBackground = colors[config.softColorKey];
  const stackActions = actions.length > 2;

  const dialogContent = visible ? (
        <View
          style={[
            styles.overlay,
            contained && styles.containedOverlay,
            {
              paddingTop: Math.max(insets.top, 16),
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onRequestClose}
            accessible={false}
          />

          <View
            style={styles.panel}
            accessibilityViewIsModal
            accessibilityRole="alert"
            testID={testID}
          >
            <ScrollView
              style={styles.content}
              contentContainerStyle={styles.contentContainer}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <View style={[styles.iconBox, { backgroundColor: iconBackground }]}>
                <Ionicons
                  name={iconName || config.icon}
                  size={25}
                  color={iconColor}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
              </View>

              <Text style={styles.title} accessibilityRole="header">
                {title}
              </Text>
              {!!message && <Text style={styles.message}>{message}</Text>}

              {details.length > 0 && (
                <View style={styles.detailsCard}>
                  {details.map((detail, index) => (
                    <View
                      key={`${detail.label}-${index}`}
                      style={[styles.detailRow, index > 0 && styles.detailRowBorder]}
                    >
                      {!!detail.iconName && (
                        <Ionicons
                          name={detail.iconName}
                          size={18}
                          color={colors.primary}
                          style={styles.detailIcon}
                          accessibilityElementsHidden
                          importantForAccessibility="no"
                        />
                      )}
                      <View style={styles.detailText}>
                        {!!detail.label && (
                          <Text style={styles.detailLabel}>{detail.label}</Text>
                        )}
                        <Text style={styles.detailValue} numberOfLines={detail.numberOfLines}>
                          {detail.value}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>

            <View style={[styles.actions, stackActions && styles.actionsStacked]}>
              {actions.map((action, index) => {
                const destructive = action.style === 'destructive';
                const cancel = action.style === 'cancel';
                return (
                  <Pressable
                    key={`${action.label}-${index}`}
                    style={({ pressed, focused }) => [
                      styles.action,
                      stackActions && styles.actionStacked,
                      destructive
                        ? styles.destructiveAction
                        : cancel
                          ? styles.cancelAction
                          : styles.primaryAction,
                      focused && styles.actionFocused,
                      pressed && styles.actionPressed,
                    ]}
                    onPress={action.onPress}
                    accessibilityRole="button"
                    accessibilityLabel={action.accessibilityLabel || action.label}
                    accessibilityHint={action.accessibilityHint}
                  >
                    <Text
                      style={[
                        styles.actionText,
                        destructive
                          ? styles.destructiveActionText
                          : cancel
                            ? styles.cancelActionText
                            : styles.primaryActionText,
                      ]}
                    >
                      {action.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
  ) : null;

  if (contained) return dialogContent;

  return (
    <Modal
      visible={visible}
      animationType={visible ? 'fade' : 'none'}
      transparent
      statusBarTranslucent
      onRequestClose={onRequestClose}
    >
      {dialogContent}
    </Modal>
  );
};

const makeStyles = (colors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 18,
      backgroundColor: colors.backdropStrong,
    },
    containedOverlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 50,
      elevation: 50,
    },
    panel: {
      width: '100%',
      maxWidth: 420,
      maxHeight: '90%',
      padding: 22,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      ...shadow.card,
    },
    content: {
      flexShrink: 1,
      width: '100%',
    },
    contentContainer: {
      alignItems: 'flex-start',
    },
    iconBox: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
    },
    title: {
      marginTop: 16,
      color: colors.text,
      fontSize: 20,
      lineHeight: 26,
      fontWeight: '800',
    },
    message: {
      marginTop: 8,
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 21,
    },
    detailsCard: {
      width: '100%',
      marginTop: 18,
      paddingHorizontal: 14,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.inputBg,
    },
    detailRow: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 11,
      paddingVertical: 12,
    },
    detailRowBorder: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    detailIcon: {
      marginTop: 3,
    },
    detailText: {
      flex: 1,
    },
    detailLabel: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '600',
    },
    detailValue: {
      marginTop: 2,
      color: colors.text,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '600',
    },
    actions: {
      width: '100%',
      flexDirection: 'row',
      gap: 10,
      marginTop: 20,
    },
    actionsStacked: {
      flexDirection: 'column',
    },
    action: {
      minHeight: 50,
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 14,
      borderRadius: radius.md,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    actionStacked: {
      width: '100%',
      flex: 0,
    },
    cancelAction: {
      borderColor: colors.border,
      backgroundColor: colors.inputBg,
    },
    primaryAction: {
      backgroundColor: colors.primary,
    },
    destructiveAction: {
      backgroundColor: colors.dangerAction,
    },
    actionFocused: {
      borderColor: colors.primary,
    },
    actionPressed: {
      opacity: 0.76,
    },
    actionText: {
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '700',
      textAlign: 'center',
    },
    cancelActionText: {
      color: colors.text,
    },
    primaryActionText: {
      color: colors.card,
    },
    destructiveActionText: {
      color: colors.onDanger,
    },
  });

export default AppDialogModal;
