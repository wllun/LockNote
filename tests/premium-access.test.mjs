import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAN_LIMITS, FEATURE_PLANS, canUsePremiumFeature, getUnexpiredPlan, premiumAccessError } from '../src/utils/premium-access.mjs';
import { verifiedSubscription, webhookAccountIds } from '../supabase/functions/revenuecat-webhook/entitlements.mjs';

test('Proposal 2 feature matrix and quotas', () => {
  assert.deepEqual(Object.values(PLAN_LIMITS).map((bytes) => bytes / 1024 / 1024), [25, 75, 750]);
  for (const feature of Object.keys(FEATURE_PLANS)) {
    assert.equal(canUsePremiumFeature('free', feature), false);
    assert.equal(canUsePremiumFeature('plus', feature), ['export', 'sharing'].includes(feature));
    assert.equal(canUsePremiumFeature('pro', feature), true);
  }
  assert.equal(canUsePremiumFeature('unknown', 'export'), false);
  assert.equal(canUsePremiumFeature('pro', 'unknown'), false);
  assert.equal(premiumAccessError('nesting').code, 'PREMIUM_REQUIRED');
});
test('cached entitlements expire and highest unexpired tier wins', () => {
  const now = Date.parse('2026-09-17');
  const active = { plus: { isActive: true, expirationDate: '2026-10-17' }, pro: { isActive: true, expirationDate: '2026-09-16' } };
  assert.equal(getUnexpiredPlan({ entitlements: { active } }, now), 'plus');
  active.plus.expirationDate = 'invalid';
  assert.equal(getUnexpiredPlan({ entitlements: { active } }, now), 'free');
  active.pro.expirationDate = null;
  assert.equal(getUnexpiredPlan({ entitlements: { active } }, now), 'pro');
});
test('canonical subscription honors paid period and billing grace', () => {
  const now = Date.parse('2026-09-17');
  const subscriber = { entitlements: { pro: { expires_date: '2026-09-16', product_identifier: 'pro_product' } }, subscriptions: { pro_product: { grace_period_expires_date: '2026-09-20' } } };
  assert.equal(verifiedSubscription(subscriber, now).plan, 'pro');
  assert.equal(verifiedSubscription(subscriber, Date.parse('2026-09-21')).plan, 'free');
  subscriber.entitlements.plus = { expires_date: '2026-10-17', product_identifier: 'plus_product' };
  assert.equal(verifiedSubscription(subscriber, Date.parse('2026-09-21')).plan, 'plus');
});
test('canonical subscription supports lifetime and missing entitlements', () => {
  assert.equal(verifiedSubscription({ entitlements: { pro: { expires_date: null } } }).plan, 'pro');
  assert.equal(verifiedSubscription(null).plan, 'free');
});
test('production ignores sandbox entitlements unless explicitly enabled', () => {
  const subscriber = { entitlements: { pro: { expires_date: null, product_identifier: 'test-pro' } }, subscriptions: { 'test-pro': { is_sandbox: true } } };
  assert.equal(verifiedSubscription(subscriber).plan, 'free');
  assert.equal(verifiedSubscription(subscriber, Date.now(), true).plan, 'pro');
});
test('transfer refreshes both UUID identities and ignores anonymous aliases', () => {
  const a = '00000000-0000-0000-0000-000000000001';
  const b = '00000000-0000-0000-0000-000000000002';
  assert.deepEqual(webhookAccountIds({ app_user_id: a, aliases: [a, '$RCAnonymousID:x'], transferred_from: [a], transferred_to: [b] }), [a, b]);
});
