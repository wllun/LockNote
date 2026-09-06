import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FREE_PLAN_ID,
  getActiveEntitlement,
  getActivePlan,
  getPlanPackages,
  getPurchaseErrorMessage,
  isPurchaseCancelled,
} from '../src/utils/subscription.mjs';

const plans = [
  { id: 'plus', entitlementId: 'plus', packageId: 'plus_monthly' },
  { id: 'pro', entitlementId: 'pro', packageId: 'pro_monthly' },
];

test('uses Free when no paid entitlement is active', () => {
  assert.equal(getActivePlan(null, plans), FREE_PLAN_ID);
  assert.equal(getActivePlan({ entitlements: { active: {} } }, plans), FREE_PLAN_ID);
});

test('resolves the highest active subscription tier', () => {
  const plus = { identifier: 'plus', isActive: true };
  const pro = { identifier: 'pro', isActive: true };
  const customerInfo = { entitlements: { active: { plus, pro } } };

  assert.equal(getActivePlan(customerInfo, plans), 'pro');
  assert.equal(getActiveEntitlement(customerInfo, plans), pro);
});

test('matches plan cards to exact RevenueCat package identifiers', () => {
  const plusPackage = { identifier: 'plus_monthly' };
  const proPackage = { identifier: 'pro_monthly' };
  const unrelatedPackage = { identifier: '$rc_annual' };
  const packages = getPlanPackages({
    availablePackages: [unrelatedPackage, proPackage, plusPackage],
  }, plans);

  assert.equal(packages.plus, plusPackage);
  assert.equal(packages.pro, proPackage);
});

test('does not treat a missing package as a different purchasable plan', () => {
  const packages = getPlanPackages({
    availablePackages: [{ identifier: '$rc_monthly' }],
  }, plans);

  assert.equal(packages.plus, null);
  assert.equal(packages.pro, null);
});

test('recognizes store cancellation without showing a failure', () => {
  assert.equal(isPurchaseCancelled({ userCancelled: true }), true);
  assert.equal(isPurchaseCancelled({ code: '1' }), true);
  assert.equal(isPurchaseCancelled({ code: '10' }), false);
});

test('maps common payment failures to user-friendly messages', () => {
  assert.match(getPurchaseErrorMessage({ code: '10' }), /internet/i);
  assert.match(getPurchaseErrorMessage({ code: '20' }), /processing/i);
  assert.doesNotMatch(getPurchaseErrorMessage(new Error('private backend detail')), /private backend/i);
});
