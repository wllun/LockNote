import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Alert,
} from 'react-native';

const PasswordModal = ({ visible, onClose, onVerify, onVerified }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);

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

  const handleClose = () => {
    setPassword('');
    setError('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <Text style={styles.title}>Enter Password</Text>
          <TextInput
            style={[styles.input, error ? styles.inputError : null]}
            placeholder="Password"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setError('');
            }}
            secureTextEntry
            autoFocus
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={handleClose}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.verifyButton]}
              onPress={handleVerify}
              disabled={verifying}
            >
              <Text style={[styles.buttonText, styles.verifyButtonText]}>
                {verifying ? 'Verifying...' : 'Unlock'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 24,
    width: '80%',
    maxWidth: 400,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    fontSize: 16,
  },
  inputError: {
    borderColor: '#FF3B30',
  },
  error: {
    color: '#FF3B30',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 12,
  },
  button: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  verifyButton: {
    backgroundColor: '#007AFF',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  verifyButtonText: {
    color: 'white',
  },
});

export default PasswordModal;
