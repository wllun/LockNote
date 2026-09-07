import assert from 'node:assert/strict';
import test from 'node:test';

import { getNetworkAvailability } from '../src/utils/network-availability.mjs';

test('treats a disconnected or unreachable network as offline', () => {
  assert.equal(getNetworkAvailability({ isConnected: false, isInternetReachable: null }), false);
  assert.equal(getNetworkAvailability({ isConnected: true, isInternetReachable: false }), false);
});

test('treats a connected network as online and preserves an unknown initial state', () => {
  assert.equal(getNetworkAvailability({ isConnected: true, isInternetReachable: null }), true);
  assert.equal(getNetworkAvailability({ isConnected: true, isInternetReachable: true }), true);
  assert.equal(getNetworkAvailability({ isConnected: null, isInternetReachable: null }), null);
});
