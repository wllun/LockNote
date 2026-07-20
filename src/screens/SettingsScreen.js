import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, shadow, useTheme, useThemeMode } from '../theme';
import { recovery } from '../utils/recovery';

const THEME_OPTIONS = [
  { mode: 'system', label: 'System', icon: 'contrast-outline' },
  { mode: 'light', label: 'Light', icon: 'sunny-outline' },
  { mode: 'dark', label: 'Dark', icon: 'moon-outline' },
];

const SettingsScreen = () => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { mode, setMode } = useThemeMode();

  const [hasRecovery, setHasRecovery] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [recoveryError, setRecoveryError] = useState('');

  const refreshRecoveryStatus = useCallback(() => {
    recovery.hasPin().then(setHasRecovery);
  }, []);

  useEffect(() => {
    refreshRecoveryStatus();
  }, [refreshRecoveryStatus]);

  const openRecoveryModal = () => {
    setPin('');
    setConfirmPin('');
    setRecoveryError('');
    setShowRecoveryModal(true);
  };

  const handleSaveRecoveryPin = async () => {
    if (!pin.trim()) {
      setRecoveryError('Enter a PIN');
      return;
    }
    if (pin !== confirmPin) {
      setRecoveryError('PINs do not match');
      return;
    }
    await recovery.setPin(pin);
    setShowRecoveryModal(false);
    refreshRecoveryStatus();
  };

  const handleRemoveRecoveryPin = () => {
    Alert.alert(
      'Remove Recovery PIN',
      'Without a recovery PIN, a forgotten password on a folder or note cannot be reset.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await recovery.clearPin();
            refreshRecoveryStatus();
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Appearance</Text>
        <View style={styles.card}>
          <View style={styles.themeRow}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="color-palette-outline" size={19} color={colors.primary} />
            </View>
            <Text style={styles.themeLabel}>Theme</Text>
          </View>
          <View style={styles.segment}>
            {THEME_OPTIONS.map((opt) => {
              const active = mode === opt.mode;
              return (
                <TouchableOpacity
                  key={opt.mode}
                  style={[styles.segmentButton, active && styles.segmentButtonActive]}
                  activeOpacity={0.7}
                  onPress={() => setMode(opt.mode)}
                >
                  <Ionicons
                    name={opt.icon}
                    size={18}
                    color={active ? colors.card : colors.textSecondary}
                  />
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.item} activeOpacity={0.7} onPress={openRecoveryModal}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="key-outline" size={19} color={colors.primary} />
            </View>
            <View style={styles.itemContent}>
              <Text style={styles.itemLabel}>Recovery PIN</Text>
              <Text style={styles.itemDescription}>
                {hasRecovery
                  ? 'Enabled — tap to change'
                  : 'Not set — lets you reset a forgotten password'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
          {hasRecovery && (
            <>
              <View style={styles.separator} />
              <TouchableOpacity
                style={styles.item}
                activeOpacity={0.7}
                onPress={handleRemoveRecoveryPin}
              >
                <View style={[styles.iconCircle, { backgroundColor: colors.dangerSoft }]}>
                  <Ionicons name="trash-outline" size={19} color={colors.danger} />
                </View>
                <View style={styles.itemContent}>
                  <Text style={[styles.itemLabel, { color: colors.danger }]}>
                    Remove Recovery PIN
                  </Text>
                </View>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.item} activeOpacity={0.7}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="cloud-upload-outline" size={19} color={colors.primary} />
            </View>
            <View style={styles.itemContent}>
              <Text style={styles.itemLabel}>Backup Data</Text>
              <Text style={styles.itemDescription}>Coming soon</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.card}>
          <View style={styles.item}>
            <View style={[styles.iconCircle, { backgroundColor: colors.folderSoft }]}>
              <Ionicons name="information-circle-outline" size={19} color={colors.folder} />
            </View>
            <View style={styles.itemContent}>
              <Text style={styles.itemLabel}>Version</Text>
              <Text style={styles.itemValue}>1.0.0</Text>
            </View>
          </View>
          <View style={styles.separator} />
          <View style={styles.item}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="phone-portrait-outline" size={19} color={colors.primary} />
            </View>
            <View style={styles.itemContent}>
              <Text style={styles.itemLabel}>Storage</Text>
              <Text style={styles.itemValue}>Local (Offline)</Text>
            </View>
          </View>
        </View>
      </View>

      <Modal visible={showRecoveryModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconCircle}>
              <Ionicons name="key-outline" size={26} color={colors.primary} />
            </View>
            <Text style={styles.modalTitle}>
              {hasRecovery ? 'Change Recovery PIN' : 'Set Recovery PIN'}
            </Text>
            <Text style={styles.modalDescription}>
              Use this PIN to reset a forgotten folder or note password.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="New PIN"
              placeholderTextColor={colors.textTertiary}
              value={pin}
              onChangeText={(t) => {
                setPin(t);
                setRecoveryError('');
              }}
              secureTextEntry
              autoFocus
            />
            <TextInput
              style={styles.input}
              placeholder="Confirm PIN"
              placeholderTextColor={colors.textTertiary}
              value={confirmPin}
              onChangeText={(t) => {
                setConfirmPin(t);
                setRecoveryError('');
              }}
              secureTextEntry
            />
            {recoveryError ? <Text style={styles.modalError}>{recoveryError}</Text> : null}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                activeOpacity={0.7}
                onPress={() => setShowRecoveryModal(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                activeOpacity={0.7}
                onPress={handleSaveRecoveryPin}
              >
                <Text style={[styles.modalButtonText, styles.saveButtonText]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const makeStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    section: {
      marginTop: 24,
      paddingHorizontal: 16,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 8,
      marginLeft: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      overflow: 'hidden',
      ...shadow.card,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
    },
    themeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      paddingBottom: 6,
    },
    segment: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 14,
      paddingBottom: 14,
    },
    segmentButton: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: radius.sm,
      backgroundColor: colors.inputBg,
    },
    segmentButtonActive: {
      backgroundColor: colors.primary,
    },
    segmentText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    segmentTextActive: {
      color: colors.card,
    },
    separator: {
      height: 1,
      backgroundColor: colors.border,
      marginLeft: 64,
    },
    iconCircle: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    itemContent: {
      flex: 1,
      marginLeft: 12,
    },
    itemLabel: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
    },
    themeLabel: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
      marginLeft: 12,
    },
    itemValue: {
      fontSize: 13,
      color: colors.textTertiary,
      marginTop: 2,
    },
    itemDescription: {
      fontSize: 13,
      color: colors.textTertiary,
      marginTop: 2,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15,23,42,0.45)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    modalContent: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      padding: 24,
      width: '100%',
      maxWidth: 400,
      alignItems: 'center',
      ...shadow.card,
    },
    modalIconCircle: {
      width: 56,
      height: 56,
      borderRadius: radius.full,
      backgroundColor: colors.primarySoft,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 14,
    },
    modalTitle: {
      fontSize: 19,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    modalDescription: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 18,
      textAlign: 'center',
    },
    modalError: {
      color: colors.danger,
      fontSize: 14,
      marginBottom: 8,
      textAlign: 'center',
    },
    input: {
      backgroundColor: colors.inputBg,
      borderRadius: radius.md,
      padding: 14,
      marginBottom: 12,
      fontSize: 16,
      color: colors.text,
      alignSelf: 'stretch',
    },
    modalButtons: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 8,
      alignSelf: 'stretch',
    },
    modalButton: {
      flex: 1,
      padding: 14,
      borderRadius: radius.md,
      alignItems: 'center',
    },
    cancelButton: {
      backgroundColor: colors.inputBg,
    },
    saveButton: {
      backgroundColor: colors.primary,
    },
    modalButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    saveButtonText: {
      color: colors.card,
    },
  });

export default SettingsScreen;
