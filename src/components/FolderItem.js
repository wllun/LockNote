import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { radius, shadow, useTheme } from '../theme';

// ponytail: entering animations are native-only — reanimated web leaves items visibility:hidden
const entering = (index) =>
  Platform.OS === 'web' ? undefined : FadeInDown.duration(220).delay(Math.min(index * 40, 240));

const FolderItem = ({ folder, noteCount = 0, onPress, onOpenActions, index = 0 }) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const handleActionsPress = (e) => {
    e.stopPropagation?.();
    onOpenActions?.();
  };

  return (
    <Animated.View entering={entering(index)}>
      <TouchableOpacity
        style={styles.container}
        onPress={onPress}
        onLongPress={Platform.OS === 'web' ? undefined : onOpenActions}
        delayLongPress={450}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${folder.name}, ${noteCount} ${noteCount === 1 ? 'note' : 'notes'}`}
        accessibilityHint={
          Platform.OS === 'web'
            ? 'Opens this folder'
            : 'Opens this folder. Long press for more actions'
        }
        accessibilityActions={
          Platform.OS === 'web'
            ? undefined
            : [{ name: 'longpress', label: 'Show folder actions' }]
        }
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === 'longpress') onOpenActions?.();
        }}
      >
        <View style={styles.iconContainer}>
          <Ionicons name="folder" size={22} color={colors.folder} />
          <View style={styles.noteCountBadge}>
            <Text style={styles.noteCountText} accessible={false}>
              {noteCount}
            </Text>
          </View>
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
          {!!folder.is_pinned && (
            <View style={styles.pinBadge}>
              <Ionicons name="pin" size={13} color={colors.primary} />
            </View>
          )}
          {Platform.OS === 'web' && (
            <Pressable
              style={({ pressed }) => [
                styles.webMenuButton,
                pressed && styles.webMenuButtonPressed,
              ]}
              onPress={handleActionsPress}
              accessibilityRole="button"
              accessibilityLabel={`More actions for ${folder.name}`}
            >
              <Ionicons
                name="ellipsis-vertical"
                size={20}
                color={colors.textSecondary}
              />
            </Pressable>
          )}
          {Platform.OS !== 'web' && (
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textTertiary}
            />
          )}
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
      marginRight: 18,
      position: 'relative',
    },
    noteCountBadge: {
      position: 'absolute',
      right: -6,
      bottom: -6,
      minWidth: 22,
      height: 22,
      paddingHorizontal: 5,
      borderRadius: radius.full,
      borderWidth: 2,
      borderColor: colors.card,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    noteCountText: {
      color: colors.card,
      fontSize: 12,
      lineHeight: 14,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
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
    pinBadge: {
      width: 24,
      height: 24,
      borderRadius: radius.full,
      backgroundColor: colors.primarySoft,
      justifyContent: 'center',
      alignItems: 'center',
    },
    webMenuButton: {
      width: 44,
      height: 44,
      marginVertical: -8,
      borderRadius: radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    webMenuButtonPressed: {
      backgroundColor: colors.inputBg,
    },
  });

export default FolderItem;
