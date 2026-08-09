export const requestConfirmation = ({
  isWeb,
  webConfirm,
  nativeAlert,
  title,
  message,
  confirmLabel,
  onConfirm,
}) => {
  if (isWeb) {
    if (webConfirm?.(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }

  nativeAlert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: confirmLabel,
      style: 'destructive',
      onPress: onConfirm,
    },
  ]);
};
