import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Modal,
  Pressable,
  StyleSheet,
} from 'react-native';
import { AppAlert as Alert } from '../utils/app-alert';
import { Ionicons } from '@expo/vector-icons';
import { radius, shadow, useTheme } from '../theme';
import { recovery } from '../utils/recovery';
import KeyboardAwareModalContent from './keyboard-aware-modal-content';

// onReset (optional): async () => void — clears the item's password after a
// successful recovery-PIN check. Omit to disable the "Forgot password?" link.
const PasswordModal = ({
  visible,
  onClose,
  onVerify,
  onVerified,
  onReset,
  title = 'Locked',
  subtitle = 'Enter the password to continue',
  verifyLabel = 'Unlock',
  variant = 'default',
  details = [],
}) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [mode, setMode] = useState('password'); // 'password' | 'recovery'
  const [recoveryPin, setRecoveryPin] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const destructive = variant === 'danger';

  const handleVerify = async () => {
    if (!password.trim()) {
      setError('Please enter the password');
      return;
    }

    setVerifying(true);
    setError('');

    try {
      const isValid = await onVerify(password);
      if (isValid) {
        await onVerified();
        setPassword('');
      } else {
        setError('Incorrect password');
      }
    } catch (err) {
      setError('Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const handleForgotPassword = async () => {
    const has = await recovery.hasPin();
    if (!has) {
      Alert.alert(
        'No recovery PIN set',
        'Set a recovery PIN in Settings to enable password recovery for locked items.'
      );
      return;
    }
    setError('');
    setMode('recovery');
  };

  const handleRecover = async () => {
    if (!recoveryPin.trim()) {
      setError('Enter your recovery PIN');
      return;
    }
    setVerifying(true);
    setError('');
    try {
      const ok = await recovery.verifyPin(recoveryPin);
      if (!ok) {
        setError('Incorrect recovery PIN');
        return;
      }
      await onReset();
      setRecoveryPin('');
      await onVerified();
    } catch (err) {
      setError('Recovery failed');
    } finally {
      setVerifying(false);
    }
  };

  const handleClose = () => {
    setPassword('');
    setRecoveryPin('');
    setError('');
    setMode('password');
    setShowPassword(false);
    onClose();
  };

  const recovering = mode === 'recovery';
  const submitDisabled = verifying || !(recovering ? recoveryPin : password).trim();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
    >
      <KeyboardAwareModalContent>
        <View
          style={[styles.content, destructive && styles.destructiveContent]}
          accessibilityViewIsModal
          accessibilityRole={destructive ? 'alert' : undefined}
        >
          <View style={[styles.iconCircle, destructive && styles.dangerIconCircle]}>
            <Ionicons
              name={recovering ? 'key-outline' : destructive ? 'trash-outline' : 'lock-closed'}
              size={26}
              color={destructive ? colors.danger : colors.primary}
            />
          </View>
          <Text
            style={[styles.title, destructive && styles.destructiveTextAlignment]}
            accessibilityRole="header"
          >
            {recovering ? 'Recover Access' : title}
          </Text>
          <Text style={[styles.subtitle, destructive && styles.destructiveTextAlignment]}>
            {recovering
              ? 'Enter your recovery PIN to remove this password'
              : subtitle}
          </Text>

          {!recovering && details.length > 0 && (
            <View style={styles.detailsCard}>
              {details.map((detail, index) => (
                <View
                  key={`${detail.label}-${index}`}
                  style={[styles.detailRow, index > 0 && styles.detailRowBorder]}
                >
                  {!!detail.iconName && (
                    <Ionicons
                      name={detail.iconName}
                      size={18}
                      color={colors.primary}
                      style={styles.detailIcon}
                    />
                  )}
                  <View style={styles.detailText}>
                    {!!detail.label && (
                      <Text style={styles.detailLabel}>{detail.label}</Text>
                    )}
                    <Text style={styles.detailValue} numberOfLines={detail.numberOfLines}>
                      {detail.value}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.inputLabel}>
            {recovering ? 'Recovery PIN' : 'Password'}
          </Text>
          {recovering ? (
            <TextInput
              style={[styles.input, error ? styles.inputError : null]}
              placeholder="Recovery PIN"
              placeholderTextColor={colors.textTertiary}
              value={recoveryPin}
              onChangeText={(text) => {
                setRecoveryPin(text);
                setError('');
              }}
              secureTextEntry
              autoFocus
              accessibilityLabel="Recovery PIN"
              onSubmitEditing={handleRecover}
            />
          ) : (
            <View style={[styles.passwordField, error && styles.inputError]}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter password"
                placeholderTextColor={colors.textTertiary}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  setError('');
                }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                textContentType="password"
                autoFocus
                accessibilityLabel={destructive ? 'Password required to confirm deletion' : 'Password'}
                onSubmitEditing={handleVerify}
              />
              <Pressable
                style={({ pressed }) => [styles.visibilityButton, pressed && styles.pressed]}
                onPress={() => setShowPassword((current) => !current)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={21}
                  color={colors.textSecondary}
                />
              </Pressable>
            </View>
          )}
          {error ? (
            <Text
              style={styles.error}
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
            >
              {error}
            </Text>
          ) : null}
          {!recovering && onReset && (
            <Pressable
              style={({ pressed }) => pressed && styles.pressed}
              onPress={handleForgotPassword}
              accessibilityRole="button"
            >
              <Text style={styles.forgotLink}>Forgot password?</Text>
            </Pressable>
          )}
          <View style={styles.buttons}>
            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.cancelButton,
                pressed && styles.pressed,
              ]}
              onPress={recovering ? () => { setMode('password'); setError(''); } : handleClose}
              accessibilityRole="button"
              accessibilityLabel={recovering ? 'Back to password entry' : 'Cancel password entry'}
            >
              <Text style={styles.buttonText}>{recovering ? 'Back' : 'Cancel'}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.button,
                destructive ? styles.deleteButton : styles.verifyButton,
                submitDisabled && styles.buttonDisabled,
                pressed && !submitDisabled && styles.pressed,
              ]}
              onPress={recovering ? handleRecover : handleVerify}
              disabled={submitDisabled}
              accessibilityRole="button"
              accessibilityLabel={recovering ? 'Verify recovery PIN' : verifyLabel}
              accessibilityState={{ disabled: submitDisabled, busy: verifying }}
            >
              <Text style={[styles.buttonText, styles.verifyButtonText]}>
                {verifying
                  ? (recovering ? 'Recovering...' : destructive ? 'Deleting...' : 'Verifying...')
                  : (recovering ? 'Reset Password' : verifyLabel)}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAwareModalContent>
    </Modal>
  );
};

const makeStyles = (colors) =>
  StyleSheet.create({
    content: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      padding: 24,
      width: '100%',
      maxWidth: 400,
      alignItems: 'center',
      ...shadow.card,
    },
    destructiveContent: {
      alignItems: 'flex-start',
      borderWidth: 1,
      borderColor: colors.border,
    },
    iconCircle: {
      width: 56,
      height: 56,
      borderRadius: radius.full,
      backgroundColor: colors.primarySoft,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 14,
    },
    dangerIconCircle: {
      backgroundColor: colors.dangerSoft,
    },
    title: {
      fontSize: 19,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 4,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 18,
      textAlign: 'center',
    },
    destructiveTextAlignment: {
      alignSelf: 'stretch',
      textAlign: 'left',
    },
    detailsCard: {
      width: '100%',
      marginBottom: 18,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.inputBg,
    },
    detailRow: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 11,
      paddingVertical: 12,
    },
    detailRowBorder: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    detailIcon: { marginTop: 3 },
    detailText: { flex: 1 },
    detailLabel: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '600',
    },
    detailValue: {
      marginTop: 2,
      color: colors.text,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '600',
    },
    inputLabel: {
      alignSelf: 'stretch',
      marginBottom: 7,
      color: colors.text,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '700',
    },
    input: {
      backgroundColor: colors.inputBg,
      borderRadius: radius.md,
      padding: 14,
      marginBottom: 8,
      fontSize: 16,
      color: colors.text,
      alignSelf: 'stretch',
    },
    passwordField: {
      width: '100%',
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.inputBg,
    },
    passwordInput: {
      flex: 1,
      minWidth: 0,
      minHeight: 50,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: colors.text,
      fontSize: 16,
      outlineStyle: 'none',
    },
    visibilityButton: {
      width: 48,
      minHeight: 50,
      alignItems: 'center',
      justifyContent: 'center',
    },
    inputError: {
      borderWidth: 1,
      borderColor: colors.danger,
    },
    error: {
      color: colors.danger,
      fontSize: 14,
      marginBottom: 8,
      textAlign: 'left',
    },
    forgotLink: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: '600',
      textAlign: 'center',
      marginTop: 4,
    },
    buttons: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 12,
      alignSelf: 'stretch',
    },
    button: {
      flex: 1,
      padding: 14,
      borderRadius: radius.md,
      alignItems: 'center',
    },
    cancelButton: {
      backgroundColor: colors.inputBg,
    },
    verifyButton: {
      backgroundColor: colors.primary,
    },
    deleteButton: {
      backgroundColor: colors.dangerAction,
    },
    buttonDisabled: { opacity: 0.45 },
    pressed: { opacity: 0.72 },
    buttonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    verifyButtonText: {
      color: colors.card,
    },
  });

export default PasswordModal;
