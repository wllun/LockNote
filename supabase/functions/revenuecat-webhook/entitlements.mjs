export const verifiedSubscription = (subscriber, now = Date.now(), allowSandbox = false) => {
  for (const plan of ['pro', 'plus']) {
    const entitlement = subscriber?.entitlements?.[plan];
    if (!entitlement) continue;
    const subscription = subscriber?.subscriptions?.[entitlement.product_identifier];
    if (subscription?.is_sandbox && !allowSandbox) continue;
    const expires = entitlement.expires_date;
    const grace = subscription?.grace_period_expires_date;
    const expiration = expires == null ? '9999-12-31T23:59:59Z'
      : new Date(Math.max(new Date(expires).getTime(), grace ? new Date(grace).getTime() || 0 : 0)).toISOString();
    if (new Date(expiration).getTime() > now) return { plan, expires_at: expiration };
  }
  return { plan: 'free', expires_at: null };
};
export const webhookAccountIds = (event) => [...new Set([
  event?.app_user_id, event?.original_app_user_id, ...(event?.aliases ?? []),
  ...(event?.transferred_from ?? []), ...(event?.transferred_to ?? []),
].filter((id) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))];
