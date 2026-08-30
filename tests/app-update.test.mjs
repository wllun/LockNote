import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_UPDATE_CACHE_MAX_AGE_MS,
  evaluateAppUpdate,
  normalizeAppUpdateConfig,
  parseBuildVersion,
} from '../src/utils/app-update-policy.mjs';

const config = {
  platform: 'android',
  latest_version_code: 5,
  minimum_version_code: 4,
  force_update_enabled: true,
  update_url: 'https://play.google.com/store/apps/details?id=com.locknote.app',
  message: 'Install the latest LockNote release.',
};

test('parses only positive integer Android build versions', () => {
  assert.equal(parseBuildVersion('42'), 42);
  assert.equal(parseBuildVersion(7), 7);
  assert.equal(parseBuildVersion('2.1'), null);
  assert.equal(parseBuildVersion('2beta'), null);
  assert.equal(parseBuildVersion(0), null);
});

test('requires an update when an enabled minimum exceeds the installed build', () => {
  const result = evaluateAppUpdate({ currentBuildVersion: '3', config });
  assert.equal(result.required, true);
  assert.equal(result.updateAvailable, true);
  assert.equal(result.minimumVersionCode, 4);
  assert.equal(result.reason, 'below-minimum');
});

test('keeps the update optional while the remote kill switch is off', () => {
  const result = evaluateAppUpdate({
    currentBuildVersion: 3,
    config: { ...config, force_update_enabled: false },
  });
  assert.equal(result.required, false);
  assert.equal(result.updateAvailable, true);
  assert.equal(result.reason, 'update-available');
});

test('honors a recent cached force policy but fails open when it becomes stale', () => {
  const now = Date.parse('2026-08-30T12:00:00.000Z');
  const recent = evaluateAppUpdate({
    currentBuildVersion: 3,
    config,
    source: 'cache',
    fetchedAt: new Date(now - APP_UPDATE_CACHE_MAX_AGE_MS + 1000).toISOString(),
    now,
  });
  assert.equal(recent.required, true);

  const stale = evaluateAppUpdate({
    currentBuildVersion: 3,
    config,
    source: 'cache',
    fetchedAt: new Date(now - APP_UPDATE_CACHE_MAX_AGE_MS - 1).toISOString(),
    now,
  });
  assert.equal(stale.required, false);
  assert.equal(stale.reason, 'stale-cache');
});

test('rejects unsafe links and inconsistent version configuration', () => {
  assert.equal(normalizeAppUpdateConfig({
    ...config,
    update_url: 'http://example.com/locknote.apk',
  }), null);
  assert.equal(normalizeAppUpdateConfig({
    ...config,
    latest_version_code: 3,
    minimum_version_code: 4,
  }), null);
});
