import React, { useMemo } from 'react';
import {
  Modal,
  Pressable,
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
    description: 'A simple text note',
    icon: 'document-text-outline',
    enabled: true,
  },
  {
    id: 'checklist',
    title: 'Checklist',
    description: 'Keep track of tasks and items',
    icon: 'checkbox-outline',
    enabled: false,
  },
  {
    id: 'expense',
    title: 'Expense Record',
    description: 'Record a date, remark, and amount',
    icon: 'receipt-outline',
    enabled: false,
  },
  {
    id: 'reminder',
    title: 'Reminder',
    description: 'A note with notification settings',
    icon: 'notifications-outline',
    enabled: false,
  },
];

const NoteTypeModal = ({ visible, onClose, onSelect }) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.overlay}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close note type selection"
      >
        <Pressable
          style={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 20) + 8 },
          ]}
          onPress={(event) => event.stopPropagation()}
        >
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
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.typeList}>
            {NOTE_TYPES.map((type) => (
              <TouchableOpacity
                key={type.id}
                style={[styles.typeItem, !type.enabled && styles.typeItemDisabled]}
                onPress={() => type.enabled && onSelect(type.id)}
                activeOpacity={type.enabled ? 0.7 : 1}
                disabled={!type.enabled}
                accessibilityRole="button"
                accessibilityState={{ disabled: !type.enabled }}
                accessibilityLabel={`${type.title}${type.enabled ? '' : ', coming soon'}`}
              >
                <View
                  style={[
                    styles.iconCircle,
                    !type.enabled && styles.iconCircleDisabled,
                  ]}
                >
                  <Ionicons
                    name={type.icon}
                    size={23}
                    color={type.enabled ? colors.primary : colors.textTertiary}
                  />
                </View>
                <View style={styles.typeText}>
                  <Text
                    style={[
                      styles.typeTitle,
                      !type.enabled && styles.disabledText,
                    ]}
                  >
                    {type.title}
                  </Text>
                  <Text
                    style={[
                      styles.typeDescription,
                      !type.enabled && styles.disabledText,
                    ]}
                  >
                    {type.description}
                  </Text>
                </View>
                {type.enabled ? (
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={colors.textTertiary}
                  />
                ) : (
                  <View style={styles.comingSoonBadge}>
                    <Text style={styles.comingSoonText}>Coming soon</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const makeStyles = (colors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(15,23,42,0.5)',
    },
    content: {
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
      padding: 20,
      paddingBottom: 28,
      gap: 20,
      backgroundColor: colors.card,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      ...shadow.card,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
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
      width: 38,
      height: 38,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.inputBg,
    },
    typeList: {
      gap: 10,
    },
    typeItem: {
      minHeight: 74,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.background,
    },
    typeItemDisabled: {
      opacity: 0.65,
    },
    iconCircle: {
      width: 46,
      height: 46,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    iconCircleDisabled: {
      backgroundColor: colors.inputBg,
    },
    typeText: {
      flex: 1,
    },
    typeTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '600',
    },
    typeDescription: {
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 2,
    },
    disabledText: {
      color: colors.textTertiary,
    },
    comingSoonBadge: {
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: radius.full,
      backgroundColor: colors.inputBg,
    },
    comingSoonText: {
      color: colors.textTertiary,
      fontSize: 11,
      fontWeight: '600',
    },
  });

export default NoteTypeModal;
