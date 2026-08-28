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
import { validatePassword } from '../utils/auth.mjs';
import KeyboardAwareModalContent from './keyboard-aware-modal-content';

const LockPasswordSettingsModal = ({ visible, status, onClose, onSaved }) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const oldPasswordRequired = !!status?.configured || (status?.lockedCount ?? 0) > 0;

  useEffect(() => {
    if (!visible) {
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswords(false);
      setError('');
    }
  }, [visible]);

  const close = () => {
    if (!busy) onClose();
  };

  const save = async () => {
    if (oldPasswordRequired && !oldPassword) {
      setError(status?.configured
        ? 'Enter your old LockNote password.'
        : 'Enter one existing note password.');
      return;
    }
    const validationError = validatePassword(newPassword);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const result = await lockPasswordService.setOrChangePassword({
        oldPassword,
        newPassword,
      });
      await onSaved(result);
    } catch (saveError) {
      setError(saveError?.message || 'The LockNote password could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const renderInput = ({ label, value, onChangeText, placeholder, autoFocus }) => (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, error && styles.errorBorder]}
        value={value}
        onChangeText={(text) => {
          onChangeText(text);
          setError('');
        }}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        secureTextEntry={!showPasswords}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={label.startsWith('Old') ? 'current-password' : 'new-password'}
        textContentType={label.startsWith('Old') ? 'password' : 'newPassword'}
        autoFocus={autoFocus}
        editable={!busy}
      />
    </>
  );

  return (
    <Modal visible={!!visible} animationType="fade" transparent onRequestClose={close}>
      <KeyboardAwareModalContent>
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.iconCircle}>
            <Ionicons name="key-outline" size={27} color={colors.primary} />
          </View>
          <Text style={styles.title}>
            {status?.configured ? 'Change LockNote Password' : 'Set LockNote Password'}
          </Text>
          <Text style={styles.description}>
            One password is used for every locked note. It stays separate from your account password.
          </Text>

          {oldPasswordRequired && renderInput({
            label: status?.configured ? 'Old password' : 'Existing note password',
            value: oldPassword,
            onChangeText: setOldPassword,
            placeholder: status?.configured
              ? 'Enter your current LockNote password'
              : 'Enter a password used by a locked note',
            autoFocus: true,
          })}
          {renderInput({
            label: 'New password',
            value: newPassword,
            onChangeText: setNewPassword,
            placeholder: 'At least 8 characters',
            autoFocus: !oldPasswordRequired,
          })}
          {renderInput({
            label: 'Confirm password',
            value: confirmPassword,
            onChangeText: setConfirmPassword,
            placeholder: 'Enter the new password again',
          })}

          <Pressable
            style={styles.showRow}
            onPress={() => setShowPasswords((current) => !current)}
            disabled={busy}
            accessibilityRole="button"
          >
            <Ionicons
              name={showPasswords ? 'eye-off-outline' : 'eye-outline'}
              size={19}
              color={colors.primary}
            />
            <Text style={styles.showText}>
              {showPasswords ? 'Hide passwords' : 'Show passwords'}
            </Text>
          </Pressable>

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
              onPress={save}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={colors.card} />
              ) : (
                <Text style={[styles.buttonText, styles.saveButtonText]}>Save</Text>
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
    marginBottom: 18,
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
  input: {
    minHeight: 52,
    marginBottom: 14,
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
  showRow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  showText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  error: {
    marginTop: 9,
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  buttons: { marginTop: 20, flexDirection: 'row', gap: 12 },
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

export default LockPasswordSettingsModal;
