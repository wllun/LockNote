import test from 'node:test';
import assert from 'node:assert/strict';

import { registerDoubleTap } from '../src/utils/double-tap.mjs';

test('recognizes two taps on the same preview within the allowed delay', () => {
  const first = registerDoubleTap(null, { targetId: 'body', timestamp: 1_000 });
  const second = registerDoubleTap(first.nextTap, { targetId: 'body', timestamp: 1_350 });

  assert.equal(first.isDoubleTap, false);
  assert.equal(second.isDoubleTap, true);
  assert.equal(second.nextTap, null);
});

test('does not combine taps from different preview text blocks', () => {
  const first = registerDoubleTap(null, { targetId: 'block-1', timestamp: 1_000 });
  const second = registerDoubleTap(first.nextTap, { targetId: 'block-2', timestamp: 1_200 });

  assert.equal(second.isDoubleTap, false);
  assert.deepEqual(second.nextTap, { targetId: 'block-2', timestamp: 1_200 });
});

test('does not treat slow or out-of-order taps as a double tap', () => {
  const first = { targetId: 'body', timestamp: 1_000 };

  assert.equal(registerDoubleTap(first, { targetId: 'body', timestamp: 1_401 }).isDoubleTap, false);
  assert.equal(registerDoubleTap(first, { targetId: 'body', timestamp: 999 }).isDoubleTap, false);
});
