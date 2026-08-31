import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { lockPasswordService } from '../services/lockPasswordService';
import { radius, shadow, useTheme } from '../theme';
import { AppAlert as Alert } from '../utils/app-alert';
import { validateLockPassword } from '../utils/lock-password.mjs';
import KeyboardAwareModalContent from './keyboard-aware-modal-content';

const LockPasswordResetModal = ({ visible }) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { session, finishLockPasswordRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    if (busy) return;
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setError('');
    finishLockPasswordRecovery();
  };

  const resetPassword = async () => {
    const validationError = validateLockPassword(password);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const result = await lockPasswordService.resetPasswordAfterEmail(
        password,
        session?.user
      );
      setPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      finishLockPasswordRecovery();
      Alert.alert(
        'LockNote password reset',
        'Your locked notes now use the new LockNote password. Existing amounts and note content were not changed.',
        [{ text: 'OK' }],
        {
          variant: 'success',
          iconName: 'checkmark-circle-outline',
          details: [
            { label: 'Locked notes updated', value: String(result.updatedCount) },
          ],
        }
      );
    } catch (resetError) {
      setError(resetError?.message || 'The LockNote password could not be reset.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={!!visible}
      animationType={visible ? 'fade' : 'none'}
      transparent
      onRequestClose={close}
    >
      <KeyboardAwareModalContent>
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.iconCircle}>
            <Ionicons name="key-outline" size={27} color={colors.primary} />
          </View>
          <Text style={styles.title}>Reset LockNote Password</Text>
          <Text style={styles.description}>
            Set one new password for all locked notes. This does not change your account password.
          </Text>

          <Text style={styles.label}>New password</Text>
          <View style={[styles.passwordField, error && styles.errorBorder]}>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                setError('');
              }}
              placeholder="At least 6 characters"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              autoFocus
              editable={!busy}
            />
            <Pressable
              style={styles.eyeButton}
              onPress={() => setShowPassword((current) => !current)}
              disabled={busy}
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

          <Text style={styles.label}>Confirm password</Text>
          <TextInput
            style={[styles.confirmInput, error && styles.errorBorder]}
            value={confirmPassword}
            onChangeText={(value) => {
              setConfirmPassword(value);
              setError('');
            }}
            placeholder="Enter the new password again"
            placeholderTextColor={colors.textTertiary}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            editable={!busy}
            onSubmitEditing={resetPassword}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.buttons}>
            <Pressable
              style={[styles.button, styles.cancelButton]}
              onPress={close}
              disabled={busy}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.saveButton, busy && styles.disabled]}
              onPress={resetPassword}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={colors.card} />
              ) : (
                <Text style={[styles.buttonText, styles.saveButtonText]}>Reset</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAwareModalContent>
    </Modal>
  );
};

const makeStyles = (colors) => StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 420,
    padding: 24,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    ...shadow.card,
  },
  iconCircle: {
    width: 56,
    height: 56,
    marginBottom: 14,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  description: {
    marginTop: 7,
    marginBottom: 20,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  label: {
    marginBottom: 7,
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  passwordField: {
    minHeight: 52,
    marginBottom: 15,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.inputBg,
  },
  input: {
    flex: 1,
    minHeight: 50,
    paddingHorizontal: 14,
    color: colors.text,
    fontSize: 16,
    outlineStyle: 'none',
  },
  eyeButton: {
    width: 48,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmInput: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.inputBg,
    color: colors.text,
    fontSize: 16,
    outlineStyle: 'none',
  },
  errorBorder: { borderColor: colors.danger },
  error: {
    marginTop: 9,
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  buttons: {
    marginTop: 20,
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  cancelButton: { backgroundColor: colors.inputBg },
  saveButton: { backgroundColor: colors.primary },
  buttonText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  saveButtonText: { color: colors.card },
  disabled: { opacity: 0.5 },
});

export default LockPasswordResetModal;
