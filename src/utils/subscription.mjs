export const FREE_PLAN_ID = 'free';

export const getActivePlan = (customerInfo, plans) => {
  const active = customerInfo?.entitlements?.active ?? {};

  // The highest tier wins if a store transition temporarily leaves both
  // entitlements active.
  return [...plans]
    .reverse()
    .find((plan) => active[plan.entitlementId]?.isActive)?.id ?? FREE_PLAN_ID;
};

export const getActiveEntitlement = (customerInfo, plans) => {
  const activePlanId = getActivePlan(customerInfo, plans);
  if (activePlanId === FREE_PLAN_ID) return null;
  const plan = plans.find((item) => item.id === activePlanId);
  return customerInfo?.entitlements?.active?.[plan?.entitlementId] ?? null;
};

export const getPlanPackages = (offering, plans) => {
  const available = offering?.availablePackages ?? [];
  return Object.fromEntries(
    plans.map((plan) => [
      plan.id,
      available.find((item) => item.identifier === plan.packageId) ?? null,
    ])
  );
};

export const isPurchaseCancelled = (error) =>
  Boolean(error?.userCancelled) || String(error?.code ?? '') === '1';

export const getPurchaseErrorMessage = (error) => {
  const code = String(error?.code ?? '');

  if (code === '3') return 'Purchases are not allowed on this device or store account.';
  if (code === '5') return 'This plan is not available from the store right now.';
  if (code === '10' || code === '35') {
    return 'Connect to the internet and try again.';
  }
  if (code === '15') return 'Another purchase is already in progress.';
  if (code === '20') {
    return 'The store is still processing this payment. Your plan will update after payment is confirmed.';
  }
  if (code === '23') {
    return 'Subscriptions are not configured correctly for this build.';
  }

  return 'The purchase could not be completed. Please try again.';
};

export const getRenewalCopy = (entitlement) => {
  if (!entitlement?.expirationDate) return 'Premium membership is active';
  const date = new Date(entitlement.expirationDate);
  if (Number.isNaN(date.getTime())) return 'Premium membership is active';

  const formatted = date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return entitlement.willRenew
    ? `Renews ${formatted}`
    : `Available until ${formatted}`;
};
