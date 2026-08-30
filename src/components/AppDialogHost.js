import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AppDialogModal from './AppDialogModal';
import { registerAppAlertHandler } from '../utils/app-alert';
import {
  inferDialogVariant,
  normalizeActiveDialogButtons,
} from '../utils/app-dialog.mjs';

const AppDialogHost = () => {
  const [queue, setQueue] = useState([]);
  const activeDialog = queue[0] || null;

  useEffect(
    () => registerAppAlertHandler((dialog) => setQueue((current) => [...current, dialog])),
    []
  );

  const dismiss = useCallback(() => {
    const onDismiss = activeDialog?.options?.onDismiss;
    setQueue((current) => current.slice(1));
    Promise.resolve().then(() => onDismiss?.());
  }, [activeDialog]);

  const actions = useMemo(
    () =>
      normalizeActiveDialogButtons(activeDialog).map((button) => ({
        label: button.text,
        style: button.style,
        onPress: () => {
          setQueue((current) => current.slice(1));
          Promise.resolve().then(() => button.onPress?.());
        },
      })),
    [activeDialog]
  );

  const variant = inferDialogVariant(
    activeDialog?.title,
    activeDialog?.buttons,
    activeDialog?.options?.variant
  );

  return (
    <AppDialogModal
      visible={!!activeDialog}
      title={activeDialog?.title || ''}
      message={activeDialog?.message || ''}
      details={activeDialog?.options?.details || []}
      variant={variant}
      iconName={activeDialog?.options?.iconName}
      actions={actions}
      onRequestClose={dismiss}
    />
  );
};

export default AppDialogHost;
