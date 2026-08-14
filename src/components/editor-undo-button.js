import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const EditorUndoButton = ({
  canUndo,
  colors,
  disabledStyle,
  onUndo,
  style,
}) => (
  <TouchableOpacity
    onPress={onUndo}
    disabled={!canUndo}
    style={[style, !canUndo && disabledStyle]}
    activeOpacity={0.7}
    hitSlop={2}
    accessibilityRole="button"
    accessibilityLabel="Undo last change"
    accessibilityHint="Restores the previous text or editing action"
    accessibilityState={{ disabled: !canUndo }}
  >
    <Ionicons
      name="arrow-undo-outline"
      size={21}
      color={canUndo ? colors.text : colors.textTertiary}
    />
  </TouchableOpacity>
);

export default EditorUndoButton;
