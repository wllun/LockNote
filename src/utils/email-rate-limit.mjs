export const EMAIL_SEND_COOLDOWN_SECONDS = 120;
export const EMAIL_SEND_COOLDOWN_MS = EMAIL_SEND_COOLDOWN_SECONDS * 1000;
export const EMAIL_SEND_COOLDOWN_ERROR = 'EMAIL_SEND_COOLDOWN';

export const getEmailCooldownSeconds = (lastSentAt, now = Date.now()) => {
  const sentAt = Number(lastSentAt);
  if (!Number.isFinite(sentAt) || sentAt <= 0) return 0;
  return Math.max(0, Math.ceil((sentAt + EMAIL_SEND_COOLDOWN_MS - now) / 1000));
};

export const createEmailCooldownError = (seconds) => {
  const remaining = Math.max(1, Math.ceil(Number(seconds) || 0));
  const error = new Error(`Please wait ${remaining} seconds before sending another email.`);
  error.code = EMAIL_SEND_COOLDOWN_ERROR;
  error.retryAfterSeconds = remaining;
  return error;
};

