import { Alert, Platform } from 'react-native';
import { requestConfirmation } from './confirmation.mjs';

export const confirmDestructiveAction = ({
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
}) => {
  requestConfirmation({
    isWeb: Platform.OS === 'web',
    webConfirm: (prompt) => globalThis.confirm?.(prompt),
    nativeAlert: (...args) => Alert.alert(...args),
    title,
    message,
    confirmLabel,
    onConfirm,
  });
};
