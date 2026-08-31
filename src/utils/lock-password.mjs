export const LOCK_PASSWORD_MIN_LENGTH = 6;

export const validateLockPassword = (password) => {
  if (!password) return 'Enter your LockNote password.';
  if (password.length < LOCK_PASSWORD_MIN_LENGTH) {
    return `LockNote password must be at least ${LOCK_PASSWORD_MIN_LENGTH} characters.`;
  }
  return '';
};
