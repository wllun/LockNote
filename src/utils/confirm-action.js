import { Alert, Platform } from 'react-native';

export const confirmDestructiveAction = ({
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
}) => {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }

  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: confirmLabel,
      style: 'destructive',
      onPress: onConfirm,
    },
  ]);
};
