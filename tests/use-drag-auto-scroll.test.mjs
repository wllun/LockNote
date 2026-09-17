import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { renderToString } from 'react-dom/server';
import * as scrollUtils from '../src/utils/drag-auto-scroll.mjs';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const source = readFileSync(new URL('../src/utils/use-drag-auto-scroll.js', import.meta.url), 'utf8');
const { code } = transformSync(source, {
  configFile: false,
  babelrc: false,
  plugins: ['@babel/plugin-transform-modules-commonjs'],
});

// Exercise the real hook with deterministic animation frames and host measurements.
const setup = (viewportNode) => {
  const frames = new Map();
  const commands = [];
  const updates = [];
  let frameId = 0;
  const exports = {};
  runInNewContext(code, {
    exports,
    require: (name) => name === './drag-auto-scroll.mjs' ? scrollUtils : require(name),
    requestAnimationFrame: (callback) => {
      frames.set(++frameId, callback);
      return frameId;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  });
  let api;
  const scrollRef = { current: {
    getNativeScrollRef: () => viewportNode,
    scrollToOffset: ({ offset }) => commands.push(offset),
  } };
  const Harness = () => {
    api = exports.useDragAutoScroll({
      scrollRef,
      mode: 'flat-list',
      onAutoScroll: (update) => updates.push(update),
    });
    return null;
  };
  renderToString(React.createElement(Harness));
  api.handleViewportLayout({ nativeEvent: { layout: { height: 500 } } });
  api.handleContentSizeChange(320, 5000);
  api.handleScroll({ nativeEvent: { contentOffset: { y: 1000 } } });
  return {
    api, commands, updates, frames,
    frame: (timestamp) => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(timestamp));
    },
  };
};

test('measures the FlatList host rather than assuming the screen starts at zero', () => {
  const harness = setup({ measureInWindow: (callback) => callback(0, 200, 320, 500) });
  harness.api.startAutoScroll();
  harness.api.updateAutoScrollPointer(500);
  for (let time = 0; time <= 500; time += 16) harness.frame(time);
  assert.equal(harness.commands.length, 0, 'finger is in the middle of the actual viewport');
  harness.api.stopAutoScroll();
});

test('waits for native measurement and a deliberate edge hold before scrolling', () => {
  let measure;
  const harness = setup({ measureInWindow: (callback) => { measure = callback; } });
  harness.api.startAutoScroll();
  harness.api.updateAutoScrollPointer(690);
  for (let time = 0; time <= 200; time += 16) harness.frame(time);
  assert.equal(harness.commands.length, 0);
  measure(0, 200, 320, 500);
  harness.frame(216);
  harness.frame(320);
  assert.equal(harness.commands.length, 0);
  harness.frame(384);
  assert.ok(harness.commands.at(-1) > 1000);
  assert.ok(harness.commands.at(-1) - 1000 < 17, 'a frame cannot jump to the last row');
  harness.api.stopAutoScroll();
});

test('web dragging stops in the middle and reverses upward after scrolling downward', () => {
  const harness = setup({ getBoundingClientRect: () => ({ top: 200, height: 500 }) });
  harness.api.startAutoScroll();
  harness.api.updateAutoScrollPointer(690);
  for (let time = 0; time <= 400; time += 16) harness.frame(time);
  const downwardOffset = harness.commands.at(-1);
  assert.ok(downwardOffset > 1000);
  harness.api.updateAutoScrollPointer(450);
  const count = harness.commands.length;
  harness.frame(416);
  harness.frame(432);
  assert.equal(harness.commands.length, count);
  harness.api.updateAutoScrollPointer(210);
  for (let time = 448; time <= 800; time += 16) harness.frame(time);
  assert.ok(harness.commands.at(-1) < downwardOffset);
  assert.equal(harness.api.getEffectiveTranslation(-100),
    -100 + harness.commands.at(-1) - 1000);
  harness.api.stopAutoScroll();
  assert.equal(harness.frames.size, 0);
});

test('blocked delete hover stops scrolling and cancels the edge hold', () => {
  const harness = setup({ measureInWindow: (callback) => callback(0, 200, 320, 500) });
  harness.api.startAutoScroll();
  harness.api.updateAutoScrollPointer(690, { blocked: true });
  for (let time = 0; time <= 400; time += 16) harness.frame(time);
  assert.equal(harness.commands.length, 0);
  harness.api.updateAutoScrollPointer(690);
  harness.frame(416);
  harness.frame(448);
  assert.equal(harness.commands.length, 0);
  harness.frame(592);
  assert.ok(harness.commands.length > 0);
  harness.api.stopAutoScroll();
});
