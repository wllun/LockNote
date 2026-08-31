import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCK_PASSWORD_MIN_LENGTH,
  validateLockPassword,
} from '../src/utils/lock-password.mjs';

test('requires six characters for a new LockNote password', () => {
  assert.equal(LOCK_PASSWORD_MIN_LENGTH, 6);
  assert.equal(
    validateLockPassword('12345'),
    'LockNote password must be at least 6 characters.'
  );
  assert.equal(validateLockPassword('123456'), '');
});

test('requires a LockNote password value', () => {
  assert.equal(validateLockPassword(''), 'Enter your LockNote password.');
});
