const NETWORK_PATTERNS = [
  'failed to fetch',
  'network request failed',
  'network error',
  'fetch failed',
  'timed out',
  'timeout',
  'offline',
];

const CONFIG_PATTERNS = [
  'invalid api key',
  'invalid supabase',
  'redirect url',
  'redirect_to',
];

export const AUTH_CONFIGURATION_ERROR = 'AUTH_CONFIGURATION_ERROR';

export const validatePasswordConfirmation = (password, confirmation) => {
  if (!confirmation) return 'Confirm your password';
  if (password !== confirmation) return 'Passwords do not match';
  return '';
};

export const getAuthErrorMessage = (error, fallback = 'Something went wrong. Please try again.') => {
  const code = String(error?.code ?? '').toLowerCase();
  const message = String(error?.message ?? '').toLowerCase();

  if (error?.code === AUTH_CONFIGURATION_ERROR || CONFIG_PATTERNS.some((x) => message.includes(x))) {
    return 'Account services are not configured correctly. Please contact support.';
  }
  if (NETWORK_PATTERNS.some((x) => message.includes(x))) {
    return 'Unable to connect. Check your internet connection and try again.';
  }
  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return 'Email or password is incorrect.';
  }
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return 'Confirm your email before signing in.';
  }
  if (code.includes('rate_limit') || message.includes('rate limit')) {
    return 'Too many attempts. Wait a moment and try again.';
  }
  if (message.includes('user already registered')) {
    return 'An account already exists for this email.';
  }
  if (message.includes('invalid email')) {
    return 'Enter a valid email address.';
  }
  if (message.includes('signup') && message.includes('disabled')) {
    return 'New account registration is currently unavailable.';
  }
  if (message.includes('password should be at least') || message.includes('weak password')) {
    return 'Choose a stronger password with at least 6 characters.';
  }
  if (message.includes('same password') || message.includes('different from the old password')) {
    return 'Choose a password different from your current password.';
  }
  if (
    code.includes('otp_expired')
    || message.includes('expired')
    || message.includes('invalid token')
    || message.includes('token has expired')
  ) {
    return 'This email link is invalid or has expired. Request a new one.';
  }

  return fallback;
};

export const parseAuthCallback = (url) => {
  if (!url || typeof url !== 'string') return null;

  try {
    const hashIndex = url.indexOf('#');
    const normalized = hashIndex === -1
      ? url
      : `${url.slice(0, hashIndex)}${url.includes('?') ? '&' : '?'}${url.slice(hashIndex + 1)}`;
    const parsed = new URL(normalized);
    const params = Object.fromEntries(parsed.searchParams.entries());

    if (params.error || params.error_code || params.error_description) {
      return {
        error: {
          code: params.error_code || params.error || 'auth_callback_error',
          message: params.error_description || params.error || 'The authentication link could not be opened.',
        },
      };
    }

    if (!params.type && !params.access_token && !params.code) return null;

    return {
      type: params.type || null,
      accessToken: params.access_token || null,
      refreshToken: params.refresh_token || null,
      code: params.code || null,
    };
  } catch {
    return {
      error: {
        code: 'invalid_callback_url',
        message: 'The authentication link is invalid.',
      },
    };
  }
};
