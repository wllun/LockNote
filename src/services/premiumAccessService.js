import { isSupabaseConfigured, supabase } from './supabaseClient';
import { canUsePremiumFeature, getUnexpiredPlan, premiumAccessError } from '../utils/premium-access.mjs';

let identity = null;
let customerInfo = null;
let serverSubscription = null;
export const premiumAccessService = {
  setIdentity(userId) {
    if (identity !== userId) { customerInfo = null; serverSubscription = null; }
    identity = userId;
  },
  setCustomerInfo(info) { customerInfo = info; },
  getServerAccess() { return serverSubscription; },
  getPlan() {
    if (!identity) return 'free';
    const storePlan = getUnexpiredPlan(customerInfo);
    if (storePlan !== 'free') return storePlan;
    if (serverSubscription?.expires_at && new Date(serverSubscription.expires_at).getTime() > Date.now()) {
      return serverSubscription.plan;
    }
    return 'free';
  },
  async refresh(includeUsage = false) {
    const requestedIdentity = identity;
    if (!requestedIdentity || !isSupabaseConfigured) return 'free';
    const { data, error } = await supabase.rpc('get_subscription_access', { p_include_usage: includeUsage });
    if (error) throw error;
    if (identity === requestedIdentity) serverSubscription = { ...data,
      used_bytes: includeUsage ? data?.used_bytes : serverSubscription?.used_bytes ?? null,
    };
    return this.getPlan();
  },
  async require(feature) {
    if (!canUsePremiumFeature(this.getPlan(), feature)) {
      // Web and devices without a store SDK can use the server-verified plan.
      await this.refresh().catch(() => {});
    }
    if (!canUsePremiumFeature(this.getPlan(), feature)) throw premiumAccessError(feature);
  },
};
