import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEmailCooldownError,
  EMAIL_SEND_COOLDOWN_ERROR,
  EMAIL_SEND_COOLDOWN_SECONDS,
  getEmailCooldownSeconds,
} from '../src/utils/email-rate-limit.mjs';

test('uses a 120-second authentication email cooldown', () => {
  assert.equal(EMAIL_SEND_COOLDOWN_SECONDS, 120);
  assert.equal(getEmailCooldownSeconds(1_000, 1_000), 120);
  assert.equal(getEmailCooldownSeconds(1_000, 120_001), 1);
  assert.equal(getEmailCooldownSeconds(1_000, 121_000), 0);
});

test('ignores missing, malformed, and expired cooldown timestamps', () => {
  assert.equal(getEmailCooldownSeconds(null, 5_000), 0);
  assert.equal(getEmailCooldownSeconds('invalid', 5_000), 0);
  assert.equal(getEmailCooldownSeconds(1_000, 500_000), 0);
});

test('creates a friendly cooldown error with retry metadata', () => {
  const error = createEmailCooldownError(42);
  assert.equal(error.code, EMAIL_SEND_COOLDOWN_ERROR);
  assert.equal(error.retryAfterSeconds, 42);
  assert.equal(error.message, 'Please wait 42 seconds before sending another email.');
});

