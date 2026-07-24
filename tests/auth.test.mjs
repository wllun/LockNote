import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTH_CONFIGURATION_ERROR,
  getAuthErrorMessage,
  normalizeEmail,
  parseAuthCallback,
  validateEmail,
  validatePassword,
  validatePasswordConfirmation,
} from '../src/utils/auth.mjs';
import {
  sendPasswordReset,
  signIn,
  signUp,
  updatePassword,
} from '../src/services/authService.mjs';

test('maps network and common Supabase failures to friendly messages', () => {
  assert.equal(
    getAuthErrorMessage(new TypeError('Network request failed')),
    'Unable to connect. Check your internet connection and try again.'
  );
  assert.equal(
    getAuthErrorMessage({ code: 'invalid_credentials', message: 'technical details' }),
    'Email or password is incorrect.'
  );
  assert.equal(
    getAuthErrorMessage({ code: 'over_email_send_rate_limit', message: 'technical details' }),
    'Too many attempts. Wait a moment and try again.'
  );
  assert.equal(
    getAuthErrorMessage({ code: AUTH_CONFIGURATION_ERROR }),
    'Account services are not configured correctly. Please contact support.'
  );
});

test('does not expose unexpected technical errors', () => {
  assert.equal(
    getAuthErrorMessage(new Error('Internal GoTrue stack detail'), 'Please try again.'),
    'Please try again.'
  );
});

test('trims and lowercases email addresses', () => {
  assert.equal(normalizeEmail('  Person@Example.COM '), 'person@example.com');
});

test('rejects invalid email formats before authentication requests', () => {
  assert.equal(validateEmail('not-an-email'), 'Enter a valid email address');
  assert.equal(validateEmail('person@example.com'), '');
});

test('requires passwords with at least 8 characters', () => {
  assert.equal(validatePassword('short'), 'Password must be at least 8 characters');
  assert.equal(validatePassword('long-enough'), '');
});

test('rejects missing or mismatched password confirmation', () => {
  assert.equal(validatePasswordConfirmation('secret', ''), 'Confirm your password');
  assert.equal(validatePasswordConfirmation('secret', 'different'), 'Passwords do not match');
  assert.equal(validatePasswordConfirmation('secret', 'secret'), '');
});

test('parses implicit password-recovery callback tokens', () => {
  assert.deepEqual(
    parseAuthCallback('locknote://reset-password#access_token=access&refresh_token=refresh&type=recovery'),
    {
      type: 'recovery',
      accessToken: 'access',
      refreshToken: 'refresh',
      code: null,
    }
  );
});

test('parses PKCE callbacks and confirmation callbacks', () => {
  assert.deepEqual(
    parseAuthCallback('locknote://auth-confirm?code=pkce-code&type=signup'),
    {
      type: 'signup',
      accessToken: null,
      refreshToken: null,
      code: 'pkce-code',
    }
  );
});

test('returns friendly callback errors for expired links', () => {
  const callback = parseAuthCallback(
    'locknote://reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
  );
  assert.equal(
    getAuthErrorMessage(callback.error),
    'This email link is invalid or has expired. Request a new one.'
  );
});

test('ignores unrelated deep links and rejects malformed callback URLs', () => {
  assert.equal(parseAuthCallback('locknote://folder/123'), null);
  assert.equal(parseAuthCallback(null), null);
  assert.equal(parseAuthCallback('not a valid url').error.code, 'invalid_callback_url');
});

test('sign in trims email and delegates to Supabase auth', async () => {
  let received;
  const auth = {
    signInWithPassword: async (payload) => {
      received = payload;
      return { data: { session: { id: 'session' } }, error: null };
    },
  };

  const data = await signIn(auth, true, '  Person@Example.COM ', 'secret');
  assert.deepEqual(received, { email: 'person@example.com', password: 'secret' });
  assert.equal(data.session.id, 'session');
});

test('sign up includes the email-confirmation app redirect', async () => {
  let received;
  const auth = {
    signUp: async (payload) => {
      received = payload;
      return { data: { session: null }, error: null };
    },
  };

  await signUp(auth, true, 'Person@Example.COM', 'password', 'locknote://auth-confirm');
  assert.equal(received.email, 'person@example.com');
  assert.equal(received.options.emailRedirectTo, 'locknote://auth-confirm');
});

test('password reset and update use the expected Supabase methods', async () => {
  const calls = [];
  const auth = {
    resetPasswordForEmail: async (...args) => {
      calls.push(['reset', ...args]);
      return { data: {}, error: null };
    },
    updateUser: async (...args) => {
      calls.push(['update', ...args]);
      return { data: {}, error: null };
    },
  };

  await sendPasswordReset(auth, true, ' Person@Example.COM ', 'locknote://reset-password');
  await updatePassword(auth, true, 'new-secret');

  assert.deepEqual(calls, [
    ['reset', 'person@example.com', { redirectTo: 'locknote://reset-password' }],
    ['update', { password: 'new-secret' }],
  ]);
});

test('service rejects missing configuration before making a request', async () => {
  let called = false;
  const auth = {
    signInWithPassword: async () => {
      called = true;
      return { data: {}, error: null };
    },
  };

  await assert.rejects(
    signIn(auth, false, 'person@example.com', 'secret'),
    (error) => error.code === AUTH_CONFIGURATION_ERROR
  );
  assert.equal(called, false);
});

test('service rejects invalid email before contacting Supabase', async () => {
  let called = false;
  const auth = {
    signInWithPassword: async () => {
      called = true;
      return { data: {}, error: null };
    },
  };

  await assert.rejects(
    signIn(auth, true, 'invalid-email', 'password'),
    { message: 'Enter a valid email address' }
  );
  assert.equal(called, false);
});

test('service rejects short new passwords before contacting Supabase', async () => {
  let called = false;
  const auth = {
    signUp: async () => {
      called = true;
      return { data: {}, error: null };
    },
  };

  await assert.rejects(
    signUp(auth, true, 'person@example.com', 'short', 'locknote://auth-confirm'),
    { message: 'Password must be at least 8 characters' }
  );
  assert.equal(called, false);
});

test('service propagates Supabase errors for friendly mapping', async () => {
  const sourceError = { code: 'invalid_credentials', message: 'Invalid login credentials' };
  const auth = {
    signInWithPassword: async () => ({ data: null, error: sourceError }),
  };

  await assert.rejects(
    signIn(auth, true, 'person@example.com', 'wrong'),
    (error) => error === sourceError
  );
});
