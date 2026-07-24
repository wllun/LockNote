import {
  AUTH_CONFIGURATION_ERROR,
  AUTH_VALIDATION_ERROR,
  normalizeEmail,
  validateEmail,
  validatePassword,
} from '../utils/auth.mjs';

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

const assertValid = (message) => {
  if (message) {
    const error = new Error(message);
    error.code = AUTH_VALIDATION_ERROR;
    throw error;
  }
};

export const signIn = async (auth, configured, email, password) => {
  assertConfigured(configured);
  assertValid(validateEmail(email));
  return await unwrap(auth.signInWithPassword({ email: normalizeEmail(email), password }));
};

export const signUp = async (auth, configured, email, password, emailRedirectTo) => {
  assertConfigured(configured);
  assertValid(validateEmail(email));
  assertValid(validatePassword(password));
  return await unwrap(auth.signUp({
    email: normalizeEmail(email),
    password,
    options: { emailRedirectTo },
  }));
};

export const sendPasswordReset = async (auth, configured, email, redirectTo) => {
  assertConfigured(configured);
  assertValid(validateEmail(email));
  return await unwrap(auth.resetPasswordForEmail(normalizeEmail(email), { redirectTo }));
};

export const updatePassword = async (auth, configured, password) => {
  assertConfigured(configured);
  assertValid(validatePassword(password));
  return await unwrap(auth.updateUser({ password }));
};
