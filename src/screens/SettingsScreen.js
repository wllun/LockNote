import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { AppAlert as Alert } from '../utils/app-alert';
import { Ionicons } from '@expo/vector-icons';
import { radius, shadow, useTheme, useThemeMode } from '../theme';
import ExpenseCurrencyModal from '../components/expense-currency-modal';
import LockPasswordSettingsModal from '../components/lock-password-settings-modal';
import { backupService } from '../services/backupService';
import { expenseCurrencyService } from '../services/expenseCurrencyService';
import { lockPasswordService } from '../services/lockPasswordService';
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

  const [lockPasswordStatus, setLockPasswordStatus] = useState(null);
  const [showLockPasswordModal, setShowLockPasswordModal] = useState(false);
  const [lockPasswordBusy, setLockPasswordBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(null);
  const [expenseCurrency, setExpenseCurrency] = useState(
    DEFAULT_EXPENSE_CURRENCY
  );
  const [showExpenseCurrencyModal, setShowExpenseCurrencyModal] = useState(false);
  const [currencyBusy, setCurrencyBusy] = useState(false);
  const selectedExpenseCurrency = getExpenseCurrency(expenseCurrency);

  const refreshLockPasswordStatus = useCallback(async () => {
    await lockPasswordService.removeUnsafeLegacyRecoveryPin();
    const status = await lockPasswordService.getStatus();
    setLockPasswordStatus(status);
    return status;
  }, []);

  useEffect(() => {
    refreshLockPasswordStatus();
    expenseCurrencyPreference.load().then(setExpenseCurrency);
    const unsubscribe = navigation.addListener('focus', refreshLockPasswordStatus);
    return unsubscribe;
  }, [navigation, refreshLockPasswordStatus]);

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

  const handleLockPasswordSaved = async (result) => {
    setShowLockPasswordModal(false);
    await refreshLockPasswordStatus();
    Alert.alert(
      'LockNote password saved',
      result.recoveryEnabled
        ? `Email recovery is linked to ${result.recoveryEmail}.`
        : 'The password is saved locally. Sign in and change it again to link email recovery.',
      [{ text: 'OK' }],
      {
        variant: 'success',
        iconName: 'checkmark-circle-outline',
        details: [
          { label: 'Locked notes updated', value: String(result.updatedCount) },
          ...(result.legacyLockedCount
            ? [{
                label: 'Older passwords remaining',
                value: String(result.legacyLockedCount),
              }]
            : []),
        ],
      }
    );
  };

  const handleForgotLockPassword = async () => {
    if (lockPasswordBusy) return;
    setLockPasswordBusy(true);
    try {
      await lockPasswordService.requestResetEmail();
      const refreshed = await refreshLockPasswordStatus();
      Alert.alert(
        'Check your email',
        `A one-time reset link was sent to ${refreshed.maskedRecoveryEmail}.`,
        [{ text: 'OK' }],
        { variant: 'info', iconName: 'mail-outline' }
      );
    } catch (error) {
      Alert.alert(
        'Email reset unavailable',
        error?.message || 'The reset email could not be sent.',
        [{ text: 'OK' }],
        { variant: 'error', iconName: 'alert-circle-outline' }
      );
    } finally {
      setLockPasswordBusy(false);
    }
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
          <TouchableOpacity
            style={[styles.item, !lockPasswordStatus && styles.itemDisabled]}
            activeOpacity={0.7}
            onPress={() => setShowLockPasswordModal(true)}
            disabled={!lockPasswordStatus}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="key-outline" size={19} color={colors.primary} />
            </View>
            <View style={styles.itemContent}>
              <Text style={styles.itemLabel}>
                {lockPasswordStatus?.configured ? 'Change Password' : 'Set Password'}
              </Text>
              <Text style={styles.itemDescription}>
                One password for all locked notes
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
          <View style={styles.separator} />
          <TouchableOpacity
            style={[
              styles.item,
              (lockPasswordBusy || !lockPasswordStatus) && styles.itemDisabled,
            ]}
            activeOpacity={0.7}
            onPress={handleForgotLockPassword}
            disabled={lockPasswordBusy || !lockPasswordStatus}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.folderSoft }]}>
              <Ionicons name="mail-outline" size={19} color={colors.folder} />
            </View>
            <View style={styles.itemContent}>
              <Text style={styles.itemLabel}>Forgot Password</Text>
              <Text style={styles.itemDescription}>
                {lockPasswordStatus?.recoveryEnabled
                  ? `Email reset · ${lockPasswordStatus.maskedRecoveryEmail}`
                  : 'Requires a signed-in recovery email'}
              </Text>
            </View>
            {lockPasswordBusy ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            )}
          </TouchableOpacity>
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
                For expense notes
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
          Currency changes the unit, not the amounts.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Files & Backup</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.item}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('Archive')}
            accessibilityRole="button"
            accessibilityLabel="Open Archive"
            accessibilityHint="View and restore archived notes"
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="archive-outline" size={19} color={colors.primary} />
            </View>
            <View style={styles.itemContent}>
              <Text style={styles.itemLabel}>Archive</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
          <View style={styles.separator} />
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
            </View>
            {backupBusy === 'import' || backupBusy === 'restore' ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            )}
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

      <LockPasswordSettingsModal
        visible={showLockPasswordModal}
        status={lockPasswordStatus}
        onClose={() => setShowLockPasswordModal(false)}
        onSaved={handleLockPasswordSaved}
      />

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
  });

export default SettingsScreen;
