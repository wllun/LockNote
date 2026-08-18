import { Alert } from 'react-native';

let appAlertHandler = null;

export const registerAppAlertHandler = (handler) => {
  appAlertHandler = handler;
  return () => {
    if (appAlertHandler === handler) appAlertHandler = null;
  };
};

export const showAppAlert = (title, message, buttons, options = {}) => {
  if (appAlertHandler) {
    appAlertHandler({ title, message, buttons, options });
    return;
  }

  const {
    details: _details,
    variant: _variant,
    iconName: _iconName,
    ...nativeOptions
  } = options || {};
  Alert.alert(title, message, buttons, nativeOptions);
};

export const AppAlert = {
  alert: showAppAlert,
};
