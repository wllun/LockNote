import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../src/screens/SharedScreen.js', import.meta.url),
  'utf8'
);

test('logged-out Shared screen provides an accessible route to account sign-in', () => {
  assert.match(source, /navigation\.getParent\(\)\?\.navigate\('Profile'\)/);
  assert.match(source, /<Text style=\{styles\.emptyText\}>Sign in to your account\.<\/Text>/);
  assert.match(source, /accessibilityLabel="Sign in to LockNote"/);
  assert.match(source, /<Text style=\{styles\.signInButtonText\}>Sign in<\/Text>/);
});
