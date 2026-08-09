import test from 'node:test';
import assert from 'node:assert/strict';
import { requestConfirmation } from '../src/utils/confirmation.mjs';

test('runs the confirmed action in a browser', () => {
  let confirmationPrompt;
  let confirmationCount = 0;

  requestConfirmation({
    isWeb: true,
    webConfirm: (prompt) => {
      confirmationPrompt = prompt;
      return true;
    },
    nativeAlert: () => assert.fail('native alert should not run on web'),
    title: 'Reset paid status?',
    message: 'All monthly bills will be marked as unpaid.',
    confirmLabel: 'Reset',
    onConfirm: () => {
      confirmationCount += 1;
    },
  });

  assert.equal(
    confirmationPrompt,
    'Reset paid status?\n\nAll monthly bills will be marked as unpaid.'
  );
  assert.equal(confirmationCount, 1);
});

test('does not run the action when browser confirmation is cancelled', () => {
  let confirmationCount = 0;

  requestConfirmation({
    isWeb: true,
    webConfirm: () => false,
    nativeAlert: () => assert.fail('native alert should not run on web'),
    title: 'Reset paid status?',
    message: 'All monthly bills will be marked as unpaid.',
    confirmLabel: 'Reset',
    onConfirm: () => {
      confirmationCount += 1;
    },
  });

  assert.equal(confirmationCount, 0);
});

test('uses the native alert buttons outside the browser', () => {
  let alertArguments;
  let confirmationCount = 0;

  requestConfirmation({
    isWeb: false,
    webConfirm: () => assert.fail('browser confirmation should not run natively'),
    nativeAlert: (...args) => {
      alertArguments = args;
    },
    title: 'Reset paid status?',
    message: 'All monthly bills will be marked as unpaid.',
    confirmLabel: 'Reset',
    onConfirm: () => {
      confirmationCount += 1;
    },
  });

  assert.equal(alertArguments[0], 'Reset paid status?');
  assert.equal(alertArguments[1], 'All monthly bills will be marked as unpaid.');
  assert.deepEqual(alertArguments[2][0], { text: 'Cancel', style: 'cancel' });
  assert.equal(alertArguments[2][1].text, 'Reset');
  assert.equal(alertArguments[2][1].style, 'destructive');

  alertArguments[2][1].onPress();
  assert.equal(confirmationCount, 1);
});
