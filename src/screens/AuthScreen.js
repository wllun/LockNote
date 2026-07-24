import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import {
  sendPasswordReset,
  signIn,
  signUp,
  updatePassword,
} from '../services/authService.mjs';
import { useAuth } from '../context/AuthContext';
import { getAuthErrorMessage } from '../utils/auth.mjs';
import { radius, shadow, useTheme } from '../theme';

const AuthScreen = () => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {
    recoveringPassword,
    finishPasswordRecovery,
    authLinkError,
    clearAuthLinkError,
  } = useAuth();

  const [mode, setMode] = useState('signIn'); // 'signIn' | 'signUp' | 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isSignUp = mode === 'signUp';
  const isForgot = mode === 'forgot';

  const resetMessages = () => {
    setError('');
    setInfo('');
    clearAuthLinkError();
  };

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Enter your email and password');
      return;
    }
    setSubmitting(true);
    setError('');
    setInfo('');
    try {
      if (isSignUp) {
        const data = await signUp(
          supabase.auth,
          isSupabaseConfigured,
          email,
          password,
          Linking.createURL('auth-confirm')
        );
        // No session back means email confirmation is required before sign-in works.
        // If a session came back, the auth listener will flip to the Profile screen on its own.
        if (!data.session) {
          setInfo('Account created. Check your email to confirm, then sign in.');
          setMode('signIn');
        }
      } else {
        await signIn(supabase.auth, isSupabaseConfigured, email, password);
      }
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Enter your email address');
      return;
    }
    setSubmitting(true);
    resetMessages();
    try {
      await sendPasswordReset(
        supabase.auth,
        isSupabaseConfigured,
        email,
        Linking.createURL('reset-password')
      );
      setInfo('Check your email for a password reset link.');
    } catch (err) {
      setError(getAuthErrorMessage(err, 'Unable to send the reset email. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!password) {
      setError('Enter a new password');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    resetMessages();
    try {
      await updatePassword(supabase.auth, isSupabaseConfigured, password);
      setPassword('');
      setConfirmPassword('');
      finishPasswordRecovery();
    } catch (err) {
      setError(getAuthErrorMessage(err, 'Unable to update your password. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const title = recoveringPassword
    ? 'Choose New Password'
    : isForgot
      ? 'Reset Password'
      : isSignUp
        ? 'Create Account'
        : 'Welcome Back';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.iconCircle}>
          <Ionicons name="person-circle-outline" size={40} color={colors.primary} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          {recoveringPassword
            ? 'Enter the new password you want to use'
            : isForgot
              ? 'We will email you a secure reset link'
              : isSignUp
                ? 'Sign up to sync your notes across devices'
                : 'Sign in to sync your notes across devices'}
        </Text>

        {!recoveringPassword && <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.textTertiary}
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            setError('');
          }}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />}
        {!isForgot && <TextInput
          style={styles.input}
          placeholder={recoveringPassword ? 'New password' : 'Password'}
          placeholderTextColor={colors.textTertiary}
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            setError('');
          }}
          secureTextEntry
          autoComplete={isSignUp || recoveringPassword ? 'new-password' : 'password'}
        />}
        {recoveringPassword && <TextInput
          style={styles.input}
          placeholder="Confirm new password"
          placeholderTextColor={colors.textTertiary}
          value={confirmPassword}
          onChangeText={(t) => {
            setConfirmPassword(t);
            setError('');
          }}
          secureTextEntry
          autoComplete="new-password"
        />}

        {!recoveringPassword && !isSignUp && !isForgot && (
          <TouchableOpacity
            onPress={() => {
              setMode('forgot');
              resetMessages();
            }}
            activeOpacity={0.7}
            style={styles.forgotButton}
          >
            <Text style={styles.switchModeText}>Forgot password?</Text>
          </TouchableOpacity>
        )}

        {error || authLinkError
          ? <Text selectable style={styles.error}>{error || authLinkError}</Text>
          : null}
        {info ? <Text selectable style={styles.info}>{info}</Text> : null}

        <TouchableOpacity
          style={styles.submitButton}
          onPress={recoveringPassword ? handleUpdatePassword : isForgot ? handleForgotPassword : handleSubmit}
          disabled={submitting}
          accessibilityState={{ disabled: submitting }}
          activeOpacity={0.8}
        >
          <Text style={styles.submitButtonText}>
            {submitting
              ? 'Please wait...'
              : recoveringPassword
                ? 'Update Password'
                : isForgot
                  ? 'Send Reset Link'
                  : isSignUp
                    ? 'Sign Up'
                    : 'Sign In'}
          </Text>
        </TouchableOpacity>

        {!recoveringPassword && <TouchableOpacity
          onPress={() => {
            setMode(isSignUp || isForgot ? 'signIn' : 'signUp');
            resetMessages();
          }}
          activeOpacity={0.7}
          style={styles.switchModeButton}
        >
          <Text style={styles.switchModeText}>
            {isSignUp || isForgot ? 'Back to sign in' : "Don't have an account? Sign up"}
          </Text>
        </TouchableOpacity>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const makeStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    iconCircle: {
      width: 76,
      height: 76,
      borderRadius: radius.full,
      backgroundColor: colors.primarySoft,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 6,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 24,
      textAlign: 'center',
    },
    input: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      padding: 14,
      marginBottom: 12,
      fontSize: 16,
      color: colors.text,
      alignSelf: 'stretch',
      ...shadow.card,
    },
    error: {
      color: colors.danger,
      fontSize: 14,
      marginBottom: 8,
      textAlign: 'center',
      alignSelf: 'stretch',
    },
    info: {
      color: colors.primary,
      fontSize: 14,
      marginBottom: 8,
      textAlign: 'center',
      alignSelf: 'stretch',
    },
    submitButton: {
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      padding: 16,
      alignItems: 'center',
      alignSelf: 'stretch',
      marginTop: 8,
    },
    submitButtonText: {
      color: colors.card,
      fontSize: 16,
      fontWeight: '600',
    },
    switchModeButton: {
      marginTop: 18,
    },
    forgotButton: {
      alignSelf: 'flex-end',
      marginBottom: 4,
    },
    switchModeText: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '600',
    },
  });

export default AuthScreen;
