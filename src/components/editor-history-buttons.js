import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const HistoryButton = ({
  available,
  colors,
  disabledStyle,
  icon,
  label,
  hint,
  onPress,
  style,
}) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={!available}
    style={[style, !available && disabledStyle]}
    activeOpacity={0.7}
    hitSlop={4}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityHint={hint}
    accessibilityState={{ disabled: !available }}
  >
    <Ionicons
      name={icon}
      size={21}
      color={available ? colors.text : colors.textTertiary}
    />
  </TouchableOpacity>
);

const EditorHistoryButtons = ({
  canRedo,
  canUndo,
  colors,
  disabledStyle,
  onRedo,
  onUndo,
  style,
}) => (
  <View style={styles.container}>
    <HistoryButton
      available={canUndo}
      colors={colors}
      disabledStyle={disabledStyle}
      icon="arrow-undo-outline"
      label="Undo last change"
      hint="Restores the previous text or editing action"
      onPress={onUndo}
      style={style}
    />
    <HistoryButton
      available={canRedo}
      colors={colors}
      disabledStyle={disabledStyle}
      icon="arrow-redo-outline"
      label="Redo last undone change"
      hint="Reapplies the most recently undone text or editing action"
      onPress={onRedo}
      style={style}
    />
  </View>
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
  },
});

export default EditorHistoryButtons;
