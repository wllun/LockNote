import { AppAlert } from './app-alert';

export const confirmDestructiveAction = ({
  title,
  message,
  confirmLabel = 'Delete',
  details = [],
  variant = 'danger',
  iconName = 'trash-outline',
  onConfirm,
}) => {
  AppAlert.alert(
    title,
    message,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: confirmLabel, style: 'destructive', onPress: onConfirm },
    ],
    { details, variant, iconName }
  );
};
