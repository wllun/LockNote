import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampDragScrollOffset,
  getDragAutoScrollVelocity,
  getEffectiveDragTranslation,
} from '../src/utils/drag-auto-scroll.mjs';

test('auto-scrolls only inside the top and bottom edge zones', () => {
  const viewport = { viewportTop: 100, viewportHeight: 500, edgeSize: 80, maxSpeed: 800 };
  assert.equal(getDragAutoScrollVelocity({ pointerY: 300, ...viewport }), 0);
  assert.ok(getDragAutoScrollVelocity({ pointerY: 110, ...viewport }) < 0);
  assert.ok(getDragAutoScrollVelocity({ pointerY: 590, ...viewport }) > 0);
});

test('ramps auto-scroll speed as the pointer approaches an edge', () => {
  const options = { viewportTop: 0, viewportHeight: 500, edgeSize: 100, maxSpeed: 800 };
  const nearThreshold = Math.abs(getDragAutoScrollVelocity({ pointerY: 80, ...options }));
  const nearEdge = Math.abs(getDragAutoScrollVelocity({ pointerY: 10, ...options }));
  assert.ok(nearEdge > nearThreshold);
  assert.equal(getDragAutoScrollVelocity({ pointerY: -20, ...options }), -800);
});

test('adds auto-scroll distance to the gesture translation', () => {
  assert.equal(getEffectiveDragTranslation(120, 460, 200), 380);
  assert.equal(getEffectiveDragTranslation(-80, 120, 300), -260);
});

test('clamps scrolling to the available content range', () => {
  assert.equal(clampDragScrollOffset(-50, 1000, 400), 0);
  assert.equal(clampDragScrollOffset(250, 1000, 400), 250);
  assert.equal(clampDragScrollOffset(900, 1000, 400), 600);
});
