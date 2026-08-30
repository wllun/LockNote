const ERROR_TITLE_PATTERN = /error|failed|could not|unable|invalid|required|check/i;
const WARNING_TITLE_PATTERN = /warning|off|full|remove|reset/i;

export const normalizeDialogButtons = (buttons) => {
  if (!Array.isArray(buttons) || buttons.length === 0) {
    return [{ text: 'OK', style: 'default' }];
  }

  return buttons.map((button) => ({
    ...button,
    text: String(button?.text || 'OK'),
    style: button?.style || 'default',
  }));
};

export const normalizeActiveDialogButtons = (dialog) => {
  if (!dialog) return [];
  return normalizeDialogButtons(dialog.buttons);
};

export const inferDialogVariant = (title, buttons, requestedVariant) => {
  if (requestedVariant) return requestedVariant;
  if (normalizeDialogButtons(buttons).some((button) => button.style === 'destructive')) {
    return 'danger';
  }
  if (ERROR_TITLE_PATTERN.test(String(title || ''))) return 'error';
  if (WARNING_TITLE_PATTERN.test(String(title || ''))) return 'warning';
  return 'info';
};
