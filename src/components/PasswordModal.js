import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, shadow, useTheme } from '../theme';
import { recovery } from '../utils/recovery';

// onReset (optional): async () => void — clears the item's password after a
// successful recovery-PIN check. Omit to disable the "Forgot password?" link.
const PasswordModal = ({ visible, onClose, onVerify, onVerified, onReset }) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [mode, setMode] = useState('password'); // 'password' | 'recovery'
  const [recoveryPin, setRecoveryPin] = useState('');

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
        setPassword('');
        onVerified();
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
      onVerified();
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
    onClose();
  };

  const recovering = mode === 'recovery';

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <Ionicons
              name={recovering ? 'key-outline' : 'lock-closed'}
              size={26}
              color={colors.primary}
            />
          </View>
          <Text style={styles.title}>{recovering ? 'Recover Access' : 'Locked'}</Text>
          <Text style={styles.subtitle}>
            {recovering
              ? 'Enter your recovery PIN to remove this password'
              : 'Enter the password to continue'}
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
            />
          ) : (
            <TextInput
              style={[styles.input, error ? styles.inputError : null]}
              placeholder="Password"
              placeholderTextColor={colors.textTertiary}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setError('');
              }}
              secureTextEntry
              autoFocus
            />
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {!recovering && onReset && (
            <TouchableOpacity onPress={handleForgotPassword} activeOpacity={0.7}>
              <Text style={styles.forgotLink}>Forgot password?</Text>
            </TouchableOpacity>
          )}
          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={recovering ? () => { setMode('password'); setError(''); } : handleClose}
              activeOpacity={0.7}
            >
              <Text style={styles.buttonText}>{recovering ? 'Back' : 'Cancel'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.verifyButton]}
              onPress={recovering ? handleRecover : handleVerify}
              disabled={verifying}
              activeOpacity={0.7}
            >
              <Text style={[styles.buttonText, styles.verifyButtonText]}>
                {verifying
                  ? (recovering ? 'Recovering...' : 'Verifying...')
                  : (recovering ? 'Reset Password' : 'Unlock')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const makeStyles = (colors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(15,23,42,0.45)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    content: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      padding: 24,
      width: '100%',
      maxWidth: 400,
      alignItems: 'center',
      ...shadow.card,
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
    input: {
      backgroundColor: colors.inputBg,
      borderRadius: radius.md,
      padding: 14,
      marginBottom: 8,
      fontSize: 16,
      color: colors.text,
      alignSelf: 'stretch',
    },
    inputError: {
      borderWidth: 1,
      borderColor: colors.danger,
    },
    error: {
      color: colors.danger,
      fontSize: 14,
      marginBottom: 8,
      textAlign: 'center',
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
