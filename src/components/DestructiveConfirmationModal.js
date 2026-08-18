import React from 'react';
import AppDialogModal from './AppDialogModal';

const DestructiveConfirmationModal = ({
  visible,
  title,
  description,
  details = [],
  confirmLabel = 'Delete',
  onCancel,
  onConfirm,
}) => (
  <AppDialogModal
    visible={visible}
    title={title}
    message={description}
    details={details}
    variant="danger"
    iconName="trash-outline"
    actions={[
      {
        label: 'Cancel',
        style: 'cancel',
        onPress: onCancel,
        accessibilityHint: 'Closes this dialog without deleting anything',
      },
      {
        label: confirmLabel,
        style: 'destructive',
        onPress: onConfirm,
      },
    ]}
    onRequestClose={onCancel}
    testID="destructive-confirmation-dialog"
  />
);

export default DestructiveConfirmationModal;
