import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, useTheme } from '../theme';
import { useSharedNoteViewAccess } from '../hooks/use-shared-note-view-access';
import { SHARING_INACTIVE_MESSAGE } from '../utils/shared-note-access.mjs';

const SharedNoteViewGate = ({ noteId, enabled, navigation, onUnavailable, children }) => {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const access = useSharedNoteViewAccess(noteId, enabled, onUnavailable);
  if (access.canView) return children;
  const checking = access.status === 'checking';
  const message = checking ? 'Checking shared note access…'
    : access.status === 'subscription' ? SHARING_INACTIVE_MESSAGE
      : access.status === 'offline' ? 'Connect to the internet to view shared notes.'
        : access.status === 'signed-out' ? 'Sign in to view shared notes.'
          : access.status === 'revoked' ? 'You no longer have access to this shared note.'
            : 'Shared note access could not be verified. Please try opening it again.';
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center',
        paddingHorizontal: 24, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, gap: 16 }}
    >
      {checking && <ActivityIndicator color={colors.primary} />}
      <Text selectable accessibilityLiveRegion="polite" style={{ color: colors.text, textAlign: 'center', fontSize: 16, lineHeight: 24 }}>
        {message}
      </Text>
      <Pressable
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        style={({ pressed }) => ({ minHeight: 48, minWidth: 100, paddingHorizontal: 20, paddingVertical: 12,
          alignItems: 'center', justifyContent: 'center', borderRadius: radius.md,
          backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 })}
      >
        <Text style={{ color: colors.card, fontSize: 16, fontWeight: '700' }}>Back</Text>
      </Pressable>
    </ScrollView>
  );
};

export default SharedNoteViewGate;
