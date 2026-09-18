export const PLAN_LIMITS = Object.freeze({ free: 25 * 1024 * 1024, plus: 75 * 1024 * 1024, pro: 750 * 1024 * 1024 });
export const FEATURE_PLANS = Object.freeze({ export: 'plus', sharing: 'plus', automaticSync: 'plus', attachments: 'pro', backgrounds: 'pro', nesting: 'pro' });
const ranks = { free: 0, plus: 1, pro: 2 };
export const canUsePremiumFeature = (plan, feature) =>
  feature in FEATURE_PLANS && (ranks[plan] ?? 0) >= ranks[FEATURE_PLANS[feature]];
export const premiumAccessError = (feature) => {
  const names = { export: 'PDF and image export', sharing: 'Sharing notes', automaticSync: 'Automatic sync', attachments: 'Adding images', backgrounds: 'Changing note backgrounds', nesting: 'Creating or moving nested folders' };
  const error = new Error(`${names[feature] ?? 'This feature'} requires LockNote ${FEATURE_PLANS[feature] === 'pro' ? 'Pro' : 'Plus or Pro'}. Your existing notes stay available. See Premium for plans.`);
  error.code = 'PREMIUM_REQUIRED';
  return error;
};
// Cached store info must not grant new paid actions beyond its verified expiry.
export const getUnexpiredPlan = (info, now = Date.now()) => {
  for (const plan of ['pro', 'plus']) {
    const entitlement = info?.entitlements?.active?.[plan];
    if (!entitlement?.isActive) continue;
    const expiry = entitlement.expirationDate;
    if (expiry == null || new Date(expiry).getTime() > now) return plan;
  }
  return 'free';
};
