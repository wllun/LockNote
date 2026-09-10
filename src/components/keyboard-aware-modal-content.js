import React, { forwardRef } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

const KeyboardAwareModalContent = forwardRef(
  ({ children, overlayStyle, contentContainerStyle }, ref) => {
    const insets = useSafeAreaInsets();
    const colors = useTheme();

    return (
      <View
        style={[styles.overlay, { backgroundColor: colors.backdrop }, overlayStyle]}
      >
        <KeyboardAvoidingView
          style={styles.keyboardAvoider}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          enabled={Platform.OS === 'ios'}
        >
          <ScrollView
            ref={ref}
            style={styles.scroll}
            contentContainerStyle={[
              styles.content,
              {
                paddingTop: Math.max(24, insets.top + 12),
                paddingBottom: Math.max(24, insets.bottom + 12),
              },
              contentContainerStyle,
            ]}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }
);

KeyboardAwareModalContent.displayName = 'KeyboardAwareModalContent';

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  keyboardAvoider: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
});

export default KeyboardAwareModalContent;
