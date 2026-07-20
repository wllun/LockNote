import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { radius, shadow, useTheme } from '../theme';

// ponytail: entering animations are native-only — reanimated web leaves items visibility:hidden
const entering = (index) =>
  Platform.OS === 'web' ? undefined : FadeInDown.duration(220).delay(Math.min(index * 40, 240));

const NoteItem = ({ note, onPress, onTogglePin, index = 0 }) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const locked = !!note.password;

  const handlePinPress = (e) => {
    e.stopPropagation?.();
    onTogglePin?.();
  };

  return (
    <Animated.View entering={entering(index)}>
      <TouchableOpacity
        style={styles.container}
        onPress={onPress}
        onLongPress={onTogglePin}
        activeOpacity={0.7}
      >
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {note.title || 'Untitled'}
          </Text>
          {locked && (
            <View style={styles.lockBadge}>
              <Ionicons name="lock-closed" size={12} color={colors.folder} />
            </View>
          )}
          <TouchableOpacity
            style={styles.pinButton}
            onPress={handlePinPress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.6}
          >
            <Ionicons
              name={note.is_pinned ? 'pin' : 'pin-outline'}
              size={16}
              color={note.is_pinned ? colors.primary : colors.textTertiary}
            />
          </TouchableOpacity>
        </View>
        <Text style={styles.preview} numberOfLines={2}>
          {locked ? 'Locked note' : note.content || 'No content'}
        </Text>
        <Text style={styles.date}>{formatDate(note.updated_at)}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const makeStyles = (colors) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.card,
      padding: 16,
      marginBottom: 10,
      borderRadius: radius.md,
      ...shadow.card,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
    title: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      flex: 1,
    },
    lockBadge: {
      width: 24,
      height: 24,
      borderRadius: radius.full,
      backgroundColor: colors.folderSoft,
      justifyContent: 'center',
      alignItems: 'center',
    },
    pinButton: {
      padding: 2,
    },
    preview: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 8,
      lineHeight: 20,
    },
    date: {
      fontSize: 12,
      color: colors.textTertiary,
    },
  });

export default NoteItem;
