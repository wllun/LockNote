import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { radius, shadow, useTheme } from '../theme';

// ponytail: entering animations are native-only — reanimated web leaves items visibility:hidden
const entering = (index) =>
  Platform.OS === 'web' ? undefined : FadeInDown.duration(220).delay(Math.min(index * 40, 240));

const FolderItem = ({ folder, onPress, onTogglePin, index = 0 }) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

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
        <View style={styles.iconContainer}>
          <Ionicons name="folder" size={22} color={colors.folder} />
        </View>
        <View style={styles.content}>
          <Text style={styles.name} numberOfLines={1}>
            {folder.name}
          </Text>
        </View>
        <View style={styles.trailing}>
          {folder.password && (
            <Ionicons name="lock-closed" size={14} color={colors.textTertiary} />
          )}
          <TouchableOpacity
            style={styles.pinButton}
            onPress={handlePinPress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.6}
          >
            <Ionicons
              name={folder.is_pinned ? 'pin' : 'pin-outline'}
              size={16}
              color={folder.is_pinned ? colors.primary : colors.textTertiary}
            />
          </TouchableOpacity>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const makeStyles = (colors) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      padding: 14,
      marginBottom: 10,
      borderRadius: radius.md,
      ...shadow.card,
    },
    iconContainer: {
      width: 42,
      height: 42,
      borderRadius: radius.sm,
      backgroundColor: colors.folderSoft,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    content: {
      flex: 1,
    },
    name: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    trailing: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    pinButton: {
      padding: 2,
    },
  });

export default FolderItem;
