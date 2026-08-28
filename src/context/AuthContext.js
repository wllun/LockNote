import React, { createContext, useContext, useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import { supabase } from '../services/supabaseClient';
import { getAuthErrorMessage, parseAuthCallback } from '../utils/auth.mjs';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recoveringPassword, setRecoveringPassword] = useState(false);
  const [recoveringLockPassword, setRecoveringLockPassword] = useState(false);
  const [authLinkError, setAuthLinkError] = useState('');

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data, error }) => {
        setSession(data?.session ?? null);
        if (error) setAuthLinkError(getAuthErrorMessage(error));
      })
      .catch((error) => setAuthLinkError(getAuthErrorMessage(error)))
      .finally(() => setLoading(false));

    const { data: subscription } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === 'PASSWORD_RECOVERY') setRecoveringPassword(true);
      if (event === 'SIGNED_OUT') {
        setRecoveringPassword(false);
        setRecoveringLockPassword(false);
      }
    });

    const handleAuthUrl = async (url) => {
      const callback = parseAuthCallback(url);
      if (!callback) return;

      setAuthLinkError('');
      if (callback.error) {
        setRecoveringPassword(false);
        if (callback.intent === 'lock-password-recovery') {
          setRecoveringLockPassword(false);
        }
        setAuthLinkError(getAuthErrorMessage(callback.error));
        return;
      }

      const isAccountRecovery = callback.type === 'recovery';
      const isLockRecovery = callback.intent === 'lock-password-recovery';
      if (isAccountRecovery) setRecoveringPassword(true);

      try {
        if (callback.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(callback.code);
          if (error) throw error;
        } else if (callback.accessToken && callback.refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: callback.accessToken,
            refresh_token: callback.refreshToken,
          });
          if (error) throw error;
        } else {
          throw new Error('The authentication link is incomplete.');
        }
        if (isLockRecovery) setRecoveringLockPassword(true);
      } catch (error) {
        if (isAccountRecovery) setRecoveringPassword(false);
        if (isLockRecovery) setRecoveringLockPassword(false);
        setAuthLinkError(getAuthErrorMessage(error));
      }
    };

    Linking.getInitialURL()
      .then(handleAuthUrl)
      .catch((error) => setAuthLinkError(getAuthErrorMessage(error)));
    const linkingSubscription = Linking.addEventListener('url', ({ url }) => {
      handleAuthUrl(url);
    });

    return () => {
      subscription.subscription.unsubscribe();
      linkingSubscription.remove();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        recoveringPassword,
        finishPasswordRecovery: () => setRecoveringPassword(false),
        recoveringLockPassword,
        finishLockPasswordRecovery: () => setRecoveringLockPassword(false),
        authLinkError,
        clearAuthLinkError: () => setAuthLinkError(''),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext) ?? {
  session: null,
  loading: false,
  recoveringPassword: false,
  finishPasswordRecovery: () => {},
  recoveringLockPassword: false,
  finishLockPasswordRecovery: () => {},
  authLinkError: '',
  clearAuthLinkError: () => {},
};
