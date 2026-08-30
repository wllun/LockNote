import React, { useEffect, useMemo, useState } from 'react';
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
import { lockPasswordService } from '../services/lockPasswordService';
import { radius, shadow, useTheme } from '../theme';
import KeyboardAwareModalContent from './keyboard-aware-modal-content';

const ManageNoteLockModal = ({
  visible,
  isLocked,
  itemLabel = 'note',
  onClose,
  onLock,
  onUnlock,
}) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [status, setStatus] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    if (visible) {
      setStatus(null);
      lockPasswordService.getStatus()
        .then((nextStatus) => active && setStatus(nextStatus))
        .catch(() => active && setError('Lock settings could not be loaded.'));
    } else {
      setPassword('');
      setConfirmation('');
      setShowPassword(false);
      setError('');
      setBusy(false);
    }
    return () => { active = false; };
  }, [visible]);

  const creatingPassword = !isLocked && status && !status.configured && status.lockedCount === 0;

  const close = () => {
    if (!busy) onClose();
  };

  const submit = async () => {
    if (!password) {
      setError('Enter your LockNote password.');
      return;
    }
    if (creatingPassword && password !== confirmation) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      if (isLocked) await onUnlock(password);
      else await onLock(password);
      onClose();
    } catch (submitError) {
      setError(submitError?.message || `The ${itemLabel} lock could not be changed.`);
    } finally {
      setBusy(false);
    }
  };

  const title = isLocked
    ? 'Remove Lock'
    : creatingPassword
      ? 'Create LockNote Password'
      : 'Lock This Note';
  const description = isLocked
    ? `Enter the current LockNote password to remove protection from this ${itemLabel}.`
    : creatingPassword
      ? 'Create the one password that will be used for every locked note.'
      : status?.configured
        ? 'Enter your shared LockNote password.'
        : 'Enter a password already used by one of your locked notes.';

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
            <Ionicons
              name={isLocked ? 'lock-open-outline' : 'lock-closed-outline'}
              size={27}
              color={colors.primary}
            />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>

          {status ? (
            <>
              <Text style={styles.label}>
                {creatingPassword ? 'New password' : 'LockNote password'}
              </Text>
              <View style={[styles.passwordField, error && styles.errorBorder]}>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    setError('');
                  }}
                  placeholder={creatingPassword ? 'At least 8 characters' : 'Enter password'}
                  placeholderTextColor={colors.textTertiary}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete={creatingPassword ? 'new-password' : 'current-password'}
                  textContentType={creatingPassword ? 'newPassword' : 'password'}
                  editable={!busy}
                  autoFocus
                />
                <Pressable
                  style={styles.eyeButton}
                  onPress={() => setShowPassword((current) => !current)}
                  disabled={busy}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={21}
                    color={colors.textSecondary}
                  />
                </Pressable>
              </View>

              {creatingPassword ? (
                <>
                  <Text style={styles.label}>Confirm password</Text>
                  <TextInput
                    style={[styles.confirmInput, error && styles.errorBorder]}
                    value={confirmation}
                    onChangeText={(value) => {
                      setConfirmation(value);
                      setError('');
                    }}
                    placeholder="Enter the password again"
                    placeholderTextColor={colors.textTertiary}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    textContentType="newPassword"
                    editable={!busy}
                    onSubmitEditing={submit}
                  />
                </>
              ) : null}
            </>
          ) : (
            <ActivityIndicator style={styles.loader} color={colors.primary} />
          )}

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
              style={[
                styles.button,
                isLocked ? styles.removeButton : styles.lockButton,
                (busy || !status) && styles.disabled,
              ]}
              onPress={submit}
              disabled={busy || !status}
            >
              {busy ? (
                <ActivityIndicator color={isLocked ? colors.danger : colors.card} />
              ) : (
                <Text style={[
                  styles.buttonText,
                  isLocked ? styles.removeButtonText : styles.lockButtonText,
                ]}>
                  {isLocked ? 'Remove Lock' : 'Set Lock'}
                </Text>
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
  title: { color: colors.text, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  description: {
    marginTop: 7,
    marginBottom: 18,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  label: { marginBottom: 7, color: colors.text, fontSize: 13, fontWeight: '700' },
  passwordField: {
    minHeight: 52,
    marginBottom: 14,
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
  eyeButton: { width: 48, minHeight: 50, alignItems: 'center', justifyContent: 'center' },
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
  loader: { marginVertical: 18 },
  error: { marginTop: 9, color: colors.danger, fontSize: 13, lineHeight: 18 },
  buttons: { marginTop: 20, flexDirection: 'row', gap: 12 },
  button: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  cancelButton: { backgroundColor: colors.inputBg },
  lockButton: { backgroundColor: colors.primary },
  removeButton: { backgroundColor: colors.dangerSoft },
  buttonText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  lockButtonText: { color: colors.card },
  removeButtonText: { color: colors.danger },
  disabled: { opacity: 0.5 },
});

export default ManageNoteLockModal;
