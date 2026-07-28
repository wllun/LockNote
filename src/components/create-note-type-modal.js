import React, { useMemo } from 'react';
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
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
  const styles = useMemo(() => makeStyles(colors), [colors]);

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
      <View style={styles.overlay}>
        <View style={[styles.content, { paddingBottom: Math.max(28, insets.bottom + 16) }]}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Create new</Text>
              <Text style={styles.subtitle}>Choose a note type</Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Close note type selection"
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.options}>
            {NOTE_TYPES.map((type) => (
              <TouchableOpacity
                key={type.id}
                style={styles.option}
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
                  <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
                ) : (
                  <Text style={styles.comingSoon}>Soon</Text>
                )}
              </TouchableOpacity>
            ))}
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
      backgroundColor: 'rgba(15,23,42,0.45)',
      justifyContent: 'flex-end',
    },
    content: {
      width: '100%',
      maxWidth: 520,
      alignSelf: 'center',
      backgroundColor: colors.card,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 28,
      ...shadow.card,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      marginBottom: 18,
    },
    title: {
      color: colors.text,
      fontSize: 21,
      fontWeight: '700',
    },
    subtitle: {
      color: colors.textSecondary,
      fontSize: 14,
      marginTop: 3,
    },
    closeButton: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.inputBg,
    },
    options: {
      gap: 10,
    },
    option: {
      minHeight: 72,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: radius.md,
      backgroundColor: colors.inputBg,
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
      color: colors.textTertiary,
      fontSize: 12,
      fontWeight: '600',
    },
  });

export default CreateNoteTypeModal;
