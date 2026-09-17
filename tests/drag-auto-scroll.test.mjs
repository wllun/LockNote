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

test('row edges cannot scroll while the finger is outside the edge zones', () => {
  const viewport = { viewportTop: 100, viewportHeight: 500, edgeSize: 120, maxSpeed: 900 };
  assert.equal(getDragAutoScrollVelocity({
    pointerY: 250,
    draggedTopY: 180,
    draggedBottomY: 240,
    ...viewport,
  }), 0);
  assert.equal(getDragAutoScrollVelocity({
    pointerY: 450,
    draggedTopY: 430,
    draggedBottomY: 540,
    ...viewport,
  }), 0);
});

test('a tall row cannot force downward scrolling when the finger is at the top', () => {
  assert.ok(getDragAutoScrollVelocity({
    pointerY: 130,
    draggedTopY: 110,
    draggedBottomY: 900,
    viewportTop: 100,
    viewportHeight: 500,
  }) < 0);
});

test('does not scroll without a pointer or a measured viewport', () => {
  assert.equal(getDragAutoScrollVelocity({
    draggedTopY: 100,
    draggedBottomY: 600,
    viewportTop: 100,
    viewportHeight: 500,
  }), 0);
  assert.equal(getDragAutoScrollVelocity({
    pointerY: 590,
    viewportTop: Number.NaN,
    viewportHeight: 500,
  }), 0);
});

test('provides useful speed shortly after entering an edge zone', () => {
  const velocity = Math.abs(getDragAutoScrollVelocity({
    pointerY: 208,
    viewportTop: 100,
    viewportHeight: 500,
    edgeSize: 120,
    maxSpeed: 900,
    minSpeed: 140,
  }));
  assert.ok(velocity >= 140);
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
