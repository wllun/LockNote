import React, { useMemo } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, shadow, useTheme } from '../theme';

const NOTE_TYPES = [
  {
    id: 'note',
    title: 'Note',
    description: 'Write a plain text note',
    icon: 'document-text-outline',
    available: true,
  },
  {
    id: 'checklist',
    title: 'Checklist',
    description: 'Create a list with checkboxes',
    icon: 'checkbox-outline',
    available: false,
  },
  {
    id: 'expense',
    title: 'Expense Record',
    description: 'Record a date, remark, and amount',
    icon: 'receipt-outline',
    available: false,
  },
  {
    id: 'reminder',
    title: 'Reminder',
    description: 'Add notification settings to a note',
    icon: 'alarm-outline',
    available: false,
  },
];

const CreateNoteTypeModal = ({ visible, onClose, onSelect }) => {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isDesktopWeb = process.env.EXPO_OS === 'web' && width >= 720;
  const maxContentHeight = isDesktopWeb
    ? Math.max(320, height - 64)
    : Math.max(320, height - Math.max(insets.top + 12, 28));

  const handleSelect = (type) => {
    if (!type.available) {
      Alert.alert(
        `${type.title} coming soon`,
        'This note type is not available yet. Choose Note to create a plain text note.'
      );
      return;
    }

    onClose();
    onSelect(type.id);
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, isDesktopWeb && styles.overlayDesktop]}>
        <View
          testID="create-note-type-dialog"
          style={[
            styles.content,
            isDesktopWeb ? styles.contentDesktop : styles.contentSheet,
            {
              maxHeight: maxContentHeight,
              paddingBottom: isDesktopWeb ? 28 : Math.max(28, insets.bottom + 16),
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.heading}>
              <View style={styles.headingIcon}>
                <Ionicons name="sparkles" size={20} color={colors.primary} />
              </View>
              <View style={styles.headingText}>
                <Text style={styles.title}>Create new</Text>
                <Text style={styles.subtitle}>Choose what you want to capture</Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.closeButton, isDesktopWeb && styles.webControl]}
              onPress={onClose}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Close note type selection"
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.optionsScroll}
            contentContainerStyle={[
              styles.options,
              isDesktopWeb && styles.optionsDesktop,
            ]}
            showsVerticalScrollIndicator={!isDesktopWeb}
          >
            {NOTE_TYPES.map((type) => (
              <TouchableOpacity
                key={type.id}
                style={[
                  styles.option,
                  isDesktopWeb && styles.optionDesktop,
                  type.available ? styles.optionAvailable : styles.optionUnavailable,
                  isDesktopWeb && styles.webControl,
                ]}
                onPress={() => handleSelect(type)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Create ${type.title}`}
                accessibilityHint={
                  type.available ? type.description : `${type.title} is coming soon`
                }
              >
                <View style={styles.iconCircle}>
                  <Ionicons name={type.icon} size={24} color={colors.primary} />
                </View>
                <View style={styles.optionText}>
                  <Text style={styles.optionTitle}>{type.title}</Text>
                  <Text style={styles.optionDescription}>{type.description}</Text>
                </View>
                {type.available ? (
                  <View style={styles.readyBadge}>
                    <Text style={styles.readyText}>Ready</Text>
                    <Ionicons name="arrow-forward" size={14} color={colors.primary} />
                  </View>
                ) : (
                  <Text style={styles.comingSoon}>Soon</Text>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>

          {isDesktopWeb && (
            <Text style={styles.footerNote}>More note types are on the way.</Text>
          )}
        </View>
      </View>
    </Modal>
  );
};

const makeStyles = (colors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(8,12,24,0.58)',
      justifyContent: 'flex-end',
    },
    overlayDesktop: {
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    content: {
      width: '100%',
      alignSelf: 'center',
      backgroundColor: colors.card,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 28,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadow.card,
    },
    contentSheet: {
      maxWidth: 520,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
    },
    contentDesktop: {
      maxWidth: 700,
      borderRadius: 24,
      paddingHorizontal: 28,
      paddingTop: 26,
      boxShadow: '0 24px 80px rgba(2, 6, 23, 0.34)',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      paddingBottom: 22,
    },
    heading: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    headingIcon: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    headingText: {
      flex: 1,
    },
    title: {
      color: colors.text,
      fontSize: 22,
      fontWeight: '700',
    },
    subtitle: {
      color: colors.textSecondary,
      fontSize: 14,
      marginTop: 2,
    },
    closeButton: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.inputBg,
    },
    webControl: {
      cursor: 'pointer',
    },
    optionsScroll: {
      flexShrink: 1,
    },
    options: {
      gap: 12,
      paddingBottom: 2,
    },
    optionsDesktop: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    option: {
      minHeight: 72,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: radius.md,
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    optionDesktop: {
      flexBasis: '48%',
      flexGrow: 1,
      minHeight: 92,
      padding: 16,
    },
    optionAvailable: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
    },
    optionUnavailable: {
      borderColor: colors.border,
    },
    iconCircle: {
      width: 46,
      height: 46,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    optionText: {
      flex: 1,
      gap: 3,
    },
    optionTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '600',
    },
    optionDescription: {
      color: colors.textSecondary,
      fontSize: 13,
    },
    comingSoon: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '700',
      backgroundColor: colors.card,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: radius.full,
      overflow: 'hidden',
    },
    readyBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.card,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: radius.full,
    },
    readyText: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: '700',
    },
    footerNote: {
      color: colors.textTertiary,
      fontSize: 12,
      textAlign: 'center',
      paddingTop: 18,
    },
  });

export default CreateNoteTypeModal;
