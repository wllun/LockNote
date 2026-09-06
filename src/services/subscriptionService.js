import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { PREMIUM_PLANS } from '../config/premiumPlans';
import {
  getActiveEntitlement,
  getActivePlan,
  getAndroidUpgradeInfo,
  getPlanPackages,
} from '../utils/subscription.mjs';

const extra = Constants.expoConfig?.extra ?? {};
let configured = false;

const usableKey = (value) => {
  const key = typeof value === 'string' ? value.trim() : '';
  return key && !key.includes('your-public') ? key : null;
};

const getApiKey = () => {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return usableKey(extra.revenueCatTestApiKey);
  }
  if (Platform.OS === 'ios') return usableKey(extra.revenueCatIosApiKey);
  if (Platform.OS === 'android') return usableKey(extra.revenueCatAndroidApiKey);
  if (Platform.OS === 'web') return usableKey(extra.revenueCatWebApiKey);
  return null;
};

const getConfigurationMessage = () => {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return 'Add a RevenueCat Test Store key to test subscriptions in Expo Go.';
  }
  return 'Subscriptions are not configured for this build.';
};

const syncCustomerIdentity = async (userId) => {
  const activeUserId = await Purchases.getAppUserID();
  if (userId && activeUserId !== userId) {
    return (await Purchases.logIn(userId)).customerInfo;
  }
  if (!userId && !activeUserId.startsWith('$RCAnonymousID:')) {
    return Purchases.logOut();
  }
  return null;
};

const configure = async (userId) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { configured: false, message: getConfigurationMessage() };
  }

  const sdkConfigured = await Purchases.isConfigured();
  if (!userId && !sdkConfigured) {
    // LockNote requires an account before purchase, so do not create an
    // anonymous RevenueCat customer merely by opening the app.
    return { configured: true, message: '' };
  }
  if (!sdkConfigured) {
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
    Purchases.configure({ apiKey, appUserID: userId });
    configured = true;
  } else {
    configured = true;
    await syncCustomerIdentity(userId);
  }

  return { configured: true, message: '' };
};

const load = async () => {
  if (!configured) throw new Error('Subscriptions are not configured.');
  const [customerInfo, offerings] = await Promise.all([
    Purchases.getCustomerInfo(),
    Purchases.getOfferings(),
  ]);
  const offering = offerings.current;
  return {
    customerInfo,
    offering,
    packagesByPlan: getPlanPackages(offering, PREMIUM_PLANS),
    activePlanId: getActivePlan(customerInfo, PREMIUM_PLANS),
    activeEntitlement: getActiveEntitlement(customerInfo, PREMIUM_PLANS),
  };
};

const purchase = async (
  planId,
  packagesByPlan,
  { currentPlanId, currentProductIdentifier, currentStore } = {}
) => {
  const selectedPackage = packagesByPlan?.[planId];
  if (!selectedPackage) throw Object.assign(new Error('Plan unavailable'), { code: '5' });
  const productChangeInfo = getAndroidUpgradeInfo({
    platform: Platform.OS,
    currentPlanId,
    targetPlanId: planId,
    currentProductIdentifier,
    currentStore,
  });
  const { customerInfo } = await Purchases.purchasePackage(
    selectedPackage,
    null,
    productChangeInfo
  );
  return customerInfo;
};

const restore = async () => {
  if (Platform.OS === 'web') return Purchases.getCustomerInfo();
  return Purchases.restorePurchases();
};

const openManagement = async (customerInfo) => {
  const latest = customerInfo ?? await Purchases.getCustomerInfo();
  if (!latest?.managementURL) {
    throw new Error('No active subscription is available to manage.');
  }
  await Linking.openURL(latest.managementURL);
};

const addCustomerInfoListener = (listener) => {
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => Purchases.removeCustomerInfoUpdateListener(listener);
};

export const subscriptionService = {
  configure,
  load,
  purchase,
  restore,
  openManagement,
  addCustomerInfoListener,
};
