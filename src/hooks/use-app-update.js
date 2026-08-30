import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { checkForAppUpdate } from '../services/app-update-service';

const FOREGROUND_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const initialState = {
  checked: false,
  checking: true,
  required: false,
  updateAvailable: false,
};

export const useAppUpdate = () => {
  const [state, setState] = useState(initialState);
  const mountedRef = useRef(true);
  const inFlightRef = useRef(null);
  const lastCheckAtRef = useRef(0);

  const refresh = useCallback(async ({ force = false } = {}) => {
    if (!force && Date.now() - lastCheckAtRef.current < FOREGROUND_CHECK_INTERVAL_MS) {
      return inFlightRef.current;
    }
    if (inFlightRef.current) return inFlightRef.current;

    if (mountedRef.current) {
      setState((current) => ({ ...current, checking: true }));
    }

    const request = checkForAppUpdate()
      .then((result) => {
        lastCheckAtRef.current = Date.now();
        if (mountedRef.current) setState({ ...result, checking: false });
        return result;
      })
      .catch(() => {
        const result = {
          checked: true,
          checking: false,
          supported: false,
          required: false,
          updateAvailable: false,
          reason: 'unavailable',
        };
        if (mountedRef.current) setState(result);
        return result;
      })
      .finally(() => {
        inFlightRef.current = null;
      });

    inFlightRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh({ force: true });

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') refresh();
    });

    return () => {
      mountedRef.current = false;
      subscription.remove();
    };
  }, [refresh]);

  return { ...state, refresh };
};
