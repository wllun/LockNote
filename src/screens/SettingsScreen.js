import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { AppAlert as Alert } from '../utils/app-alert';
import { Ionicons } from '@expo/vector-icons';
import { radius, shadow, useTheme, useThemeMode } from '../theme';
import { recovery } from '../utils/recovery';
import KeyboardAwareModalContent from '../components/keyboard-aware-modal-content';
import ExpenseCurrencyModal from '../components/expense-currency-modal';
import { backupService } from '../services/backupService';
import { expenseCurrencyService } from '../services/expenseCurrencyService';
import { expenseCurrencyPreference } from '../utils/expense-currency-preference';
import {
  DEFAULT_EXPENSE_CURRENCY,
  getExpenseCurrency,
} from '../utils/expense-record.mjs';

const THEME_OPTIONS = [
  { mode: 'system', label: 'System', icon: 'contrast-outline' },
  { mode: 'light', label: 'Light', icon: 'sunny-outline' },
  { mode: 'dark', label: 'Dark', icon: 'moon-outline' },
];

const SettingsScreen = ({ navigation }) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { mode, setMode } = useThemeMode();

  const [hasRecovery, setHasRecovery] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  const [backupBusy, setBackupBusy] = useState(null);
  const [expenseCurrency, setExpenseCurrency] = useState(
    DEFAULT_EXPENSE_CURRENCY
  );
  const [showExpenseCurrencyModal, setShowExpenseCurrencyModal] = useState(false);
  const [currencyBusy, setCurrencyBusy] = useState(false);
  const selectedExpenseCurrency = getExpenseCurrency(expenseCurrency);

  const refreshRecoveryStatus = useCallback(() => {
    recovery.hasPin().then(setHasRecovery);
  }, []);

  useEffect(() => {
    refreshRecoveryStatus();
    expenseCurrencyPreference.load().then(setExpenseCurrency);
  }, [refreshRecoveryStatus]);

  const updateDefaultExpenseCurrency = async (nextCurrency, applyToExisting) => {
    setCurrencyBusy(true);
    try {
      const savedCurrency = await expenseCurrencyPreference.save(nextCurrency);
      setExpenseCurrency(savedCurrency);
      if (!applyToExisting) return;

      const result = await expenseCurrencyService.applyToExistingNotes(
        savedCurrency
      );
      const hasIncompleteUpdates =
        result.failedCount > 0 || result.pendingCloudCount > 0;
      Alert.alert(
        hasIncompleteUpdates ? 'Currency updated locally' : 'Currency updated',
        result.noteCount
          ? `The currency display was changed for ${result.updatedCount} existing private or owned expense note${result.updatedCount === 1 ? '' : 's'}. Entered amounts were not converted.`
          : 'There were no existing expense notes to update. New expense notes will use the selected currency.',
        [{ text: 'OK' }],
        {
          variant: hasIncompleteUpdates ? 'warning' : 'info',
          iconName: 'cash-outline',
          details: [
            {
              label: 'Default currency',
              value: `${getExpenseCurrency(savedCurrency).name} (${savedCurrency})`,
            },
            ...(result.pendingCloudCount
              ? [{
                  label: 'Waiting to sync',
                  value: String(result.pendingCloudCount),
                }]
              : []),
            ...(result.failedCount
              ? [{ label: 'Could not update', value: String(result.failedCount) }]
              : []),
          ],
        }
      );
    } catch (error) {
      Alert.alert(
        'Currency update failed',
        error?.message || 'LockNote could not update the expense currency.',
        [{ text: 'OK' }],
        { variant: 'error', iconName: 'alert-circle-outline' }
      );
    } finally {
      setCurrencyBusy(false);
    }
  };

  const handleExpenseCurrencySelect = (nextCurrency) => {
    setShowExpenseCurrencyModal(false);
    if (nextCurrency === expenseCurrency) return;

    const current = getExpenseCurrency(expenseCurrency);
    const next = getExpenseCurrency(nextCurrency);
    Alert.alert(
      'Change default expense currency?',
      `New expense notes will use ${next.name} (${next.code}). Would you also like to apply it to all existing private and owned expense notes? Shared-with-you notes stay unchanged. Entered amounts will not be converted or exchanged.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'New notes only',
          onPress: () => updateDefaultExpenseCurrency(next.code, false),
        },
        {
          text: 'Apply to all',
          onPress: () => updateDefaultExpenseCurrency(next.code, true),
        },
      ],
      {
        variant: 'warning',
        iconName: 'cash-outline',
        details: [
          {
            label: 'Current default',
            value: `${current.code} · ${current.symbol}`,
          },
          { label: 'New default', value: `${next.code} · ${next.symbol}` },
        ],
      }
    );
  };

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
      ],
      {
        variant: 'danger',
        iconName: 'key-outline',
        details: [{ label: 'Recovery PIN', value: 'Currently enabled' }],
      }
    );
  };

  const showBackupError = (error) => {
    Alert.alert(
      'Backup failed',
      error?.message || 'LockNote could not complete the backup operation.',
      [{ text: 'OK' }],
      { variant: 'danger', iconName: 'alert-circle-outline' }
    );
  };

  const restoreSelectedBackup = async (selection, mode) => {
    setBackupBusy('restore');
    try {
      const result = await backupService.restoreBackup(selection, mode);
      Alert.alert(
        'Backup restored',
        `${result.folderCount} folder${result.folderCount === 1 ? '' : 's'} and ${result.noteCount} note${result.noteCount === 1 ? '' : 's'} were ${mode === 'replace' ? 'restored' : 'merged'}.`,
        [{ text: 'OK' }],
        {
          variant: 'success',
          iconName: 'checkmark-circle-outline',
          details: [
            { label: 'Mode', value: mode === 'replace' ? 'Replace private data' : 'Merge by latest edit' },
            { label: 'Deleted records', value: String(result.deletedCount) },
          ],
        }
      );
    } catch (error) {
      showBackupError(error);
    } finally {
      setBackupBusy(null);
    }
  };

  const handleExportBackup = async () => {
    if (backupBusy) return;
    setBackupBusy('export');
    try {
      const result = await backupService.exportBackup();
      Alert.alert(
        'Backup ready',
        'Your portable LockNote JSON backup was created.',
        [{ text: 'OK' }],
        {
          variant: 'success',
          iconName: 'checkmark-circle-outline',
          details: [
            { label: 'Folders', value: String(result.folderCount) },
            { label: 'Notes', value: String(result.noteCount) },
            { label: 'File', value: result.filename },
          ],
        }
      );
    } catch (error) {
      showBackupError(error);
    } finally {
      setBackupBusy(null);
    }
  };

  const handleImportBackup = async () => {
    if (backupBusy) return;
    setBackupBusy('import');
    try {
      const selection = await backupService.pickBackup();
      setBackupBusy(null);
      if (!selection) return;
      const { summary } = selection;
      Alert.alert(
        'Import backup?',
        'Merge keeps current data and applies the newest version of each item. Replace removes current private folders and notes first. Shared-with-me notes stay on this device.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Merge', onPress: () => restoreSelectedBackup(selection, 'merge') },
          {
            text: 'Replace',
            style: 'destructive',
            onPress: () => restoreSelectedBackup(selection, 'replace'),
          },
        ],
        {
          variant: 'warning',
          iconName: 'download-outline',
          details: [
            { label: 'File', value: selection.filename },
            { label: 'Folders', value: String(summary.folderCount) },
            { label: 'Notes', value: String(summary.noteCount) },
            { label: 'Deleted records', value: String(summary.deletedCount) },
            { label: 'Created', value: new Date(summary.exportedAt).toLocaleString() },
          ],
        }
      );
    } catch (error) {
      setBackupBusy(null);
      showBackupError(error);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      contentInsetAdjustmentBehavior="automatic"
    >
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
        <Text style={styles.sectionTitle}>Expenses</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={[styles.item, currencyBusy && styles.itemDisabled]}
            activeOpacity={0.7}
            onPress={() => setShowExpenseCurrencyModal(true)}
            disabled={currencyBusy}
            accessibilityRole="button"
            accessibilityLabel={`Default expense currency ${selectedExpenseCurrency.name}, ${selectedExpenseCurrency.code}`}
            accessibilityHint="Changes the default for new expense notes"
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="cash-outline" size={19} color={colors.primary} />
            </View>
            <View style={styles.itemContent}>
              <Text style={styles.itemLabel}>Default currency</Text>
              <Text style={styles.itemDescription}>
                Used when creating a new expense note
              </Text>
            </View>
            {currencyBusy ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <View style={styles.currencyValueRow}>
                <Text style={styles.currencyValue}>
                  {selectedExpenseCurrency.code} · {selectedExpenseCurrency.symbol}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.textTertiary}
                />
              </View>
            )}
          </TouchableOpacity>
        </View>
        <Text style={styles.dataNotice}>
          Currency changes only the displayed unit. LockNote does not convert amounts.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.item}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('Trash')}
            accessibilityRole="button"
            accessibilityLabel="Open Trash"
            accessibilityHint="View, restore, or permanently delete removed notes"
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.dangerSoft }]}>
              <Ionicons name="trash-outline" size={19} color={colors.danger} />
            </View>
            <View style={styles.itemContent}>
              <Text style={styles.itemLabel}>Trash</Text>
              <Text style={styles.itemDescription}>Notes deleted permanently after 30 days</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
          <View style={styles.separator} />
          <TouchableOpacity
            style={[styles.item, backupBusy && styles.itemDisabled]}
            activeOpacity={0.7}
            onPress={handleImportBackup}
            disabled={!!backupBusy}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.folderSoft }]}>
              <Ionicons name="push-outline" size={19} color={colors.folder} />
            </View>
            <View style={styles.itemContent}>
              <Text style={styles.itemLabel}>Import Backup</Text>
              <Text style={styles.itemDescription}>Preview, then merge or replace</Text>
            </View>
            {backupBusy === 'import' || backupBusy === 'restore' ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            )}
          </TouchableOpacity>
        </View>
        <Text style={styles.dataNotice}>
          Backup files contain note content and password hashes. They are not encrypted.
        </Text>
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
        <KeyboardAwareModalContent>
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
        </KeyboardAwareModalContent>
      </Modal>

      <ExpenseCurrencyModal
        visible={showExpenseCurrencyModal}
        value={expenseCurrency}
        onSelect={handleExpenseCurrencySelect}
        onClose={() => setShowExpenseCurrencyModal(false)}
        description="Choose the default used when creating a new expense note."
      />
    </ScrollView>
  );
};

const makeStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    contentContainer: {
      paddingBottom: 24,
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
    itemDisabled: {
      opacity: 0.55,
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
    currencyValueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    currencyValue: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: '800',
    },
    dataNotice: {
      color: colors.textTertiary,
      fontSize: 12,
      lineHeight: 17,
      marginHorizontal: 4,
      marginTop: 8,
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
