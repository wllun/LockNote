import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { PREMIUM_PLANS } from '../config/premiumPlans';
import { subscriptionService } from '../services/subscriptionService';
import { premiumAccessService } from '../services/premiumAccessService';
import {
  FREE_PLAN_ID,
  getActiveEntitlement,
  getActivePlan,
} from '../utils/subscription.mjs';
import { useAuth } from './AuthContext';

const SubscriptionContext = createContext(null);

const emptyPackages = Object.fromEntries(PREMIUM_PLANS.map((plan) => [plan.id, null]));

export const SubscriptionProvider = ({ children }) => {
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user?.id ?? null;
  const currentUserId = useRef(userId);
  currentUserId.current = userId;
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [customerInfo, setCustomerInfo] = useState(null);
  const [packagesByPlan, setPackagesByPlan] = useState(emptyPackages);
  const [activePlanId, setActivePlanId] = useState(FREE_PLAN_ID);
  const [activeEntitlement, setActiveEntitlement] = useState(null);
  const [purchasingPlanId, setPurchasingPlanId] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [cloudAccess, setCloudAccess] = useState(null);

  const applyCustomerInfo = useCallback((nextCustomerInfo) => {
    premiumAccessService.setCustomerInfo(nextCustomerInfo);
    setCustomerInfo(nextCustomerInfo);
    setActivePlanId(premiumAccessService.getPlan());
    setActiveEntitlement(getActiveEntitlement(nextCustomerInfo, PREMIUM_PLANS));
  }, []);

  const refresh = useCallback(async (includeUsage = false) => {
    if (!userId) return null;
    await premiumAccessService.refresh(includeUsage).catch(() => {});
    if (currentUserId.current !== userId) return null;
    setCloudAccess(premiumAccessService.getServerAccess());
    setActivePlanId(premiumAccessService.getPlan());
    if (!configured) return null;
    try {
      const result = await subscriptionService.load();
      if (currentUserId.current !== userId) return null;
      applyCustomerInfo(result.customerInfo);
      setPackagesByPlan(result.packagesByPlan);
      setMessage(result.offering ? '' : 'No subscription plans are available from the store.');
      return result;
    } catch (error) {
      setMessage('Subscriptions could not be refreshed. Check your connection and try again.');
      throw error;
    }
  }, [applyCustomerInfo, configured, userId]);

  useEffect(() => {
    if (authLoading) return undefined;
    let active = true;
    let removeCustomerInfoListener = null;

    premiumAccessService.setIdentity(userId);
    setCloudAccess(null);
    applyCustomerInfo(null);
    premiumAccessService.refresh().then((plan) => {
      if (active) { setActivePlanId(plan); setCloudAccess(premiumAccessService.getServerAccess()); }
    }).catch(() => {});

    setLoading(true);
    subscriptionService.configure(userId)
      .then(async (result) => {
        if (!active) return;
        setConfigured(result.configured);
        setMessage(result.message);
        if (!result.configured || !userId) {
          applyCustomerInfo(null);
          setPackagesByPlan(emptyPackages);
          return;
        }

        removeCustomerInfoListener = subscriptionService.addCustomerInfoListener((info) => {
          if (active) applyCustomerInfo(info);
        });
        try {
          const loaded = await subscriptionService.load();
          if (!active) return;
          applyCustomerInfo(loaded.customerInfo);
          setPackagesByPlan(loaded.packagesByPlan);
          setMessage(loaded.offering ? '' : 'No subscription plans are available from the store.');
        } catch (error) {
          console.warn('Failed to load subscriptions:', error);
          if (active) {
            setMessage('Subscriptions could not be loaded. Check your connection and try again.');
          }
        }
      })
      .catch((error) => {
        console.warn('Failed to initialize subscriptions:', error);
        if (active) {
          setConfigured(false);
          setMessage('Subscriptions could not be loaded. Please try again.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      removeCustomerInfoListener?.();
    };
  }, [applyCustomerInfo, authLoading, userId]);

  useEffect(() => {
    if (!userId) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh().catch(() => {});
    });
    return () => subscription.remove();
  }, [refresh, userId]);

  useEffect(() => {
    // Re-evaluate cached expiry even if the app stays open across the paid end.
    const timer = setInterval(() => setActivePlanId(premiumAccessService.getPlan()), 30000);
    return () => clearInterval(timer);
  }, []);

  const purchase = useCallback(async (planId) => {
    if (!userId) throw new Error('Sign in before subscribing.');
    setPurchasingPlanId(planId);
    try {
      const info = await subscriptionService.purchase(planId, packagesByPlan, {
        currentPlanId: activePlanId,
        currentProductIdentifier: activeEntitlement?.productIdentifier,
        currentStore: activeEntitlement?.store,
      });
      if (currentUserId.current !== userId) throw new Error('Your account changed. Sign in to the purchase account and restore purchases.');
      applyCustomerInfo(info);
      return getActivePlan(info, PREMIUM_PLANS);
    } finally {
      setPurchasingPlanId(null);
    }
  }, [activeEntitlement, activePlanId, applyCustomerInfo, packagesByPlan, userId]);

  const restore = useCallback(async () => {
    if (!userId) throw new Error('Sign in before restoring purchases.');
    setRestoring(true);
    try {
      const info = await subscriptionService.restore();
      if (currentUserId.current !== userId) throw new Error('Your account changed. Restore purchases from the correct account.');
      applyCustomerInfo(info);
      return getActivePlan(info, PREMIUM_PLANS);
    } finally {
      setRestoring(false);
    }
  }, [applyCustomerInfo, userId]);

  const manage = useCallback(() => subscriptionService.openManagement(customerInfo), [customerInfo]);

  const value = useMemo(() => ({
    configured,
    cloudAccess,
    loading: authLoading || loading,
    message,
    customerInfo,
    packagesByPlan,
    activePlanId,
    activeEntitlement,
    purchasingPlanId,
    restoring,
    refresh,
    purchase,
    restore,
    manage,
  }), [
    activeEntitlement,
    activePlanId,
    authLoading,
    configured,
    cloudAccess,
    customerInfo,
    loading,
    manage,
    message,
    packagesByPlan,
    purchase,
    purchasingPlanId,
    refresh,
    restore,
    restoring,
  ]);

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
};

export const useSubscription = () => useContext(SubscriptionContext) ?? {
  configured: false,
  cloudAccess: null,
  loading: false,
  message: '',
  customerInfo: null,
  packagesByPlan: emptyPackages,
  activePlanId: FREE_PLAN_ID,
  activeEntitlement: null,
  purchasingPlanId: null,
  restoring: false,
  refresh: async () => null,
  purchase: async () => FREE_PLAN_ID,
  restore: async () => FREE_PLAN_ID,
  manage: async () => {},
};
