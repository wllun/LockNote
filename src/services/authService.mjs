import { AUTH_CONFIGURATION_ERROR } from '../utils/auth.mjs';

const assertConfigured = (configured) => {
  if (!configured) {
    const error = new Error('Supabase URL or anonymous key is missing or invalid.');
    error.code = AUTH_CONFIGURATION_ERROR;
    throw error;
  }
};

const unwrap = async (request) => {
  const result = await request;
  if (result.error) throw result.error;
  return result.data;
};

export const signIn = async (auth, configured, email, password) => {
  assertConfigured(configured);
  return await unwrap(auth.signInWithPassword({ email: email.trim(), password }));
};

export const signUp = async (auth, configured, email, password, emailRedirectTo) => {
  assertConfigured(configured);
  return await unwrap(auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo },
  }));
};

export const sendPasswordReset = async (auth, configured, email, redirectTo) => {
  assertConfigured(configured);
  return await unwrap(auth.resetPasswordForEmail(email.trim(), { redirectTo }));
};

export const updatePassword = async (auth, configured, password) => {
  assertConfigured(configured);
  return await unwrap(auth.updateUser({ password }));
};
