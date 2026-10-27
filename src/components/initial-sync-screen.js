import React, { useMemo } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, useTheme, useThemeMode } from '../theme';

const InitialSyncScreen = ({ sync, onCancel, onContinue }) => {
  const colors = useTheme();
  const { scheme } = useThemeMode();
  const styles = useMemo(() => makeStyles(colors, scheme === 'dark' ? colors.background : colors.card), [colors, scheme]);
  const insets = useSafeAreaInsets();
  const complete = sync.status === 'complete';
  const progress = sync.progress || {};
  const title = complete ? 'Your notes are ready' : sync.busy ? 'Syncing your notes' : 'Finish syncing your notes';
  const detail = progress.phase === 'images'
    ? `Checking images · ${progress.completed || 0} of ${progress.total || 0} notes`
    : progress.phase === 'notes' ? `Saving ${progress.notes || 0} notes safely…` : 'Connecting to your account…';
  return (
    <Modal visible={sync.visible} animationType="none" onRequestClose={sync.busy ? onCancel : onContinue}>
      <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.body} accessibilityViewIsModal>
          <View style={styles.icon}><Ionicons name={complete ? 'checkmark-circle-outline' : 'cloud-download-outline'} size={42} color={colors.primary} /></View>
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
          <Text style={styles.description}>{complete
            ? sync.result?.notes ? 'Your cloud notes have been downloaded. Existing local notes were kept.' : 'No cloud notes yet. Your local notes were kept.'
            : 'Downloading the notes and images already saved in your account. Your existing local notes will be kept.'}</Text>
          {sync.busy && <View style={styles.progress}>
            <ActivityIndicator size="large" color={colors.primary} accessibilityLabel="Sync in progress" />
            <Text style={styles.progressText} accessibilityLiveRegion="polite">{detail}</Text>
          </View>}
          {!!sync.error && <Text style={styles.error} accessibilityRole="alert">{sync.error}</Text>}
          {!sync.busy && !complete && !sync.error && <Text style={styles.notice}>Sync was paused. Completed downloads are kept; unfinished downloads will be retried.</Text>}
          <View style={styles.actions}>
            {complete ? <Pressable onPress={onContinue} style={({ pressed }) => [styles.primary, pressed && styles.pressed]} accessibilityRole="button"><Text style={styles.primaryText}>Open notes</Text></Pressable>
              : sync.busy ? <Pressable onPress={onCancel} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Cancel initial sync"><Text style={styles.secondaryText}>Cancel sync</Text></Pressable>
                : <>
                  <Pressable onPress={sync.start} style={({ pressed }) => [styles.primary, pressed && styles.pressed]} accessibilityRole="button"><Text style={styles.primaryText}>Resume sync</Text></Pressable>
                  <Pressable onPress={onContinue} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]} accessibilityRole="button"><Text style={styles.secondaryText}>Continue later</Text></Pressable>
                </>}
          </View>
          {!complete && <Text style={styles.footnote}>You can resume from Profile. Cancelling does not delete your notes.</Text>}
        </View>
      </ScrollView>
    </Modal>
  );
};

const makeStyles = (colors, onPrimary) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  body: { width: '100%', maxWidth: 440, alignItems: 'center' },
  icon: { width: 88, height: 88, borderRadius: 24, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  title: { color: colors.text, fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  description: { color: colors.textSecondary, fontSize: 15, lineHeight: 23, textAlign: 'center' },
  progress: { alignItems: 'center', gap: 16, marginTop: 28 },
  progressText: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' },
  notice: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 24 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 24 },
  actions: { width: '100%', gap: 12, marginTop: 28 },
  primary: { minHeight: 50, borderRadius: radius.sm, padding: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  primaryText: { color: onPrimary, fontSize: 16, fontWeight: '700' },
  secondary: { minHeight: 50, borderRadius: radius.sm, padding: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  secondaryText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.7 },
  footnote: { color: colors.textSecondary, textAlign: 'center', fontSize: 12, lineHeight: 18, marginTop: 20 },
});

export default InitialSyncScreen;
