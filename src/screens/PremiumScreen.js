import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  EXPIRED_PLAN_BEHAVIOR,
  FREE_FEATURES,
  PREMIUM_PLANS,
} from '../config/premiumPlans';
import { radius, shadow, useTheme } from '../theme';
import { AppAlert as Alert } from '../utils/app-alert';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import {
  FREE_PLAN_ID,
  getPurchaseErrorMessage,
  getRenewalCopy,
  isPurchaseCancelled,
} from '../utils/subscription.mjs';

const PremiumScreen = ({ navigation }) => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const useWideLayout = width >= 760;
  const { session } = useAuth();
  const {
    activeEntitlement,
    activePlanId,
    configured,
    loading,
    manage,
    message,
    packagesByPlan,
    purchase,
    purchasingPlanId,
    refresh,
    restore,
    restoring,
  } = useSubscription();
  const [refreshing, setRefreshing] = useState(false);
  const activePlan = PREMIUM_PLANS.find((plan) => plan.id === activePlanId);
  const isPremium = activePlanId !== FREE_PLAN_ID;

  const openProfile = () => {
    navigation.getParent()?.navigate('Profile');
  };

  const requireAccount = () => {
    Alert.alert(
      'Sign in to subscribe',
      'Use a free LockNote account so your subscription can be restored on your other devices.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign In', onPress: openProfile },
      ]
    );
  };

  const handlePlanPress = async (plan) => {
    if (!session) {
      requireAccount();
      return;
    }
    const isUpgrade = activePlanId === 'plus' && plan.id === 'pro';
    if (isPremium && !isUpgrade) {
      if (activePlanId !== plan.id) await handleManage();
      return;
    }
    if (!configured || !packagesByPlan[plan.id]) {
      Alert.alert('Plan unavailable', message || 'This plan is not available from the store right now.');
      return;
    }

    try {
      const purchasedPlanId = await purchase(plan.id);
      if (purchasedPlanId === plan.id) {
        Alert.alert(
          isUpgrade ? 'Upgrade complete' : 'Welcome to LockNote Premium',
          `Your ${plan.name} subscription is now active.`
        );
      } else {
        Alert.alert(
          'Payment is being confirmed',
          'The store accepted the purchase, but the subscription is not active yet. Use Restore purchases after the store finishes processing it.'
        );
      }
    } catch (error) {
      if (!isPurchaseCancelled(error)) {
        Alert.alert('Purchase not completed', getPurchaseErrorMessage(error));
      }
    }
  };

  const handleRestore = async () => {
    if (!session) {
      requireAccount();
      return;
    }
    if (!configured) {
      Alert.alert('Restore unavailable', message || 'Subscriptions are not configured for this build.');
      return;
    }

    try {
      const restoredPlanId = await restore();
      const restoredPlan = PREMIUM_PLANS.find((plan) => plan.id === restoredPlanId);
      Alert.alert(
        restoredPlan ? 'Purchase restored' : 'No purchase found',
        restoredPlan
          ? `Your ${restoredPlan.name} subscription is active.`
          : 'No active subscription was found for this LockNote and store account.'
      );
    } catch (error) {
      Alert.alert('Restore failed', getPurchaseErrorMessage(error));
    }
  };

  const handleManage = async () => {
    if (!isPremium) {
      Alert.alert('No active subscription', 'Choose a plan before managing a subscription.');
      return;
    }
    try {
      await manage();
    } catch (error) {
      const noSubscription = error?.message === 'No active subscription is available to manage.';
      Alert.alert(
        'Unable to manage subscription',
        noSubscription ? error.message : 'The subscription page could not be opened. Please try again.'
      );
    }
  };

  const handleRetry = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refresh();
    } catch {
      Alert.alert('Still unable to load plans', 'Check your connection and try again.');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={[styles.content, useWideLayout && styles.contentWide]}>
        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons name="diamond-outline" size={28} color={colors.primary} />
          </View>
          <Text style={styles.eyebrow}>LOCKNOTE PREMIUM</Text>
          <Text style={styles.heroTitle}>Choose what fits you</Text>
          <Text style={styles.heroText}>
            Your notes stay yours. Premium plans add cloud services and storage.
          </Text>
          <View style={styles.previewNotice}>
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons
                name={message ? 'information-circle-outline' : 'shield-checkmark-outline'}
                size={18}
                color={colors.primary}
              />
            )}
            <Text accessibilityLiveRegion="polite" style={styles.previewNoticeText}>
              {loading
                ? 'Checking your subscription…'
                : message || 'Payment is completed by the provider shown at checkout.'}
            </Text>
          </View>
          {message && configured && session && !loading ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry loading subscription plans"
              accessibilityState={{ busy: refreshing, disabled: refreshing }}
              disabled={refreshing}
              onPress={handleRetry}
              style={({ pressed }) => [
                styles.retryButton,
                refreshing && styles.buttonDisabled,
                pressed && styles.pressed,
              ]}
            >
              {refreshing ? <ActivityIndicator size="small" color={colors.primary} /> : null}
              <Text style={styles.retryButtonText}>
                {refreshing ? 'Trying again…' : 'Try again'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.sectionLabel}>CURRENT PLAN</Text>
        <View style={styles.currentCard}>
          <View style={styles.currentIcon}>
            <Ionicons name={isPremium ? 'diamond' : 'checkmark'} size={21} color={colors.primary} />
          </View>
          <View style={styles.currentCopy}>
            <Text style={styles.currentTitle}>{activePlan?.name ?? 'Free'}</Text>
            <Text style={styles.currentText}>
              {isPremium
                ? getRenewalCopy(activeEntitlement)
                : 'Offline features, account access and backup · RM 0'}
            </Text>
          </View>
          <View style={styles.currentBadge}>
            <Text style={styles.currentBadgeText}>{isPremium ? 'Premium' : 'Current'}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>PLANS</Text>
        <View style={[styles.planGrid, useWideLayout && styles.planGridWide]}>
          {PREMIUM_PLANS.map((plan) => {
            const storePackage = packagesByPlan[plan.id];
            const isCurrent = activePlanId === plan.id;
            const isUpgrade = activePlanId === 'plus' && plan.id === 'pro';
            const isBusy = purchasingPlanId === plan.id;
            const isOtherPurchaseBusy = Boolean(purchasingPlanId) && !isBusy;
            const requiresPurchase = !isPremium || isUpgrade;
            const planUnavailable = Boolean(session) && requiresPurchase && (!configured || !storePackage);
            const disabled = loading || restoring || isCurrent || isOtherPurchaseBusy || planUnavailable;
            const buttonLabel = isCurrent
              ? 'Current plan'
              : isUpgrade
                ? 'Upgrade to Pro'
              : isPremium
                ? 'Manage plan'
                : !session
                  ? 'Sign in to subscribe'
                  : !configured || !storePackage
                    ? 'Unavailable'
                    : 'Subscribe';

            return (
            <View
              key={plan.id}
              style={[styles.planCard, useWideLayout && styles.planCardWide]}
            >
              <View style={styles.planHeader}>
                <View style={styles.planNameRow}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  {plan.badge ? (
                    <View style={styles.recommendedBadge}>
                      <Ionicons name="sparkles" size={13} color={colors.primary} />
                      <Text style={styles.recommendedText}>{plan.badge}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.priceRow}>
                  <Text style={styles.price}>{storePackage?.product?.priceString ?? plan.price}</Text>
                  <Text style={styles.period}>{plan.period}</Text>
                </View>
                <Text style={styles.planDescription}>{plan.description}</Text>
              </View>

              <View style={styles.featureList}>
                {plan.features.map((feature) => (
                  <View key={feature} style={styles.featureRow}>
                    <View style={styles.featureIcon}>
                      <Ionicons name="checkmark" size={14} color={colors.primary} />
                    </View>
                    <Text style={styles.featureText}>{feature}</Text>
                  </View>
                ))}
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${buttonLabel}: ${plan.name}`}
                accessibilityHint={isUpgrade
                  ? 'Starts the secure store upgrade process'
                  : isPremium && !isCurrent
                    ? 'Opens subscription management to change plans'
                    : 'Starts the secure store subscription process'}
                accessibilityState={{ busy: isBusy, disabled }}
                disabled={disabled}
                onPress={() => handlePlanPress(plan)}
                style={({ pressed }) => [
                  styles.planButton,
                  plan.id === 'plus' ? styles.planButtonPrimary : styles.planButtonSecondary,
                  disabled && styles.buttonDisabled,
                  pressed && styles.pressed,
                ]}
              >
                {isBusy ? (
                  <View style={styles.buttonBusyContent}>
                    <ActivityIndicator
                      size="small"
                      color={plan.id === 'plus' ? colors.card : colors.primary}
                    />
                    <Text style={plan.id === 'plus'
                      ? styles.planButtonPrimaryText
                      : styles.planButtonSecondaryText}
                    >
                      Completing purchase…
                    </Text>
                  </View>
                ) : (
                  <Text style={plan.id === 'plus'
                    ? styles.planButtonPrimaryText
                    : styles.planButtonSecondaryText}
                  >
                    {buttonLabel}
                  </Text>
                )}
              </Pressable>
            </View>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>ALWAYS FREE</Text>
        <View style={styles.freeCard}>
          {FREE_FEATURES.map((feature) => (
            <View key={feature} style={styles.featureRow}>
              <View style={styles.freeFeatureIcon}>
                <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              </View>
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>IF YOUR PLAN ENDS</Text>
        <View style={styles.expiryCard}>
          <View style={styles.expiryHeadingRow}>
            <View style={styles.expiryIcon}>
              <Ionicons name="shield-checkmark-outline" size={22} color={colors.primary} />
            </View>
            <View style={styles.expiryHeadingCopy}>
              <Text style={styles.expiryTitle}>Your notes are not deleted</Text>
              <Text style={styles.expiryText}>
                Your account returns to Free after the paid period ends.
              </Text>
            </View>
          </View>
          <View style={styles.expiryList}>
            {EXPIRED_PLAN_BEHAVIOR.map((item) => (
              <View key={item} style={styles.expiryRow}>
                <Ionicons name="checkmark-circle-outline" size={19} color={colors.primary} />
                <Text style={styles.expiryItemText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.subscriptionActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Restore purchases"
            accessibilityState={{ busy: restoring, disabled: loading || Boolean(purchasingPlanId) }}
            disabled={loading || Boolean(purchasingPlanId)}
            onPress={handleRestore}
            style={({ pressed }) => [
              styles.actionButton,
              (loading || Boolean(purchasingPlanId)) && styles.buttonDisabled,
              pressed && styles.pressed,
            ]}
          >
            {restoring
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Ionicons name="refresh-outline" size={20} color={colors.primary} />}
            <Text style={styles.actionText}>
              {restoring ? 'Restoring purchases…' : 'Restore purchases'}
            </Text>
          </Pressable>
          <View style={styles.actionDivider} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Manage subscription"
            accessibilityState={{ disabled: !isPremium }}
            disabled={!isPremium}
            onPress={handleManage}
            style={({ pressed }) => [
              styles.actionButton,
              !isPremium && styles.buttonDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="card-outline" size={20} color={colors.primary} />
            <Text style={styles.actionText}>Manage subscription</Text>
          </Pressable>
        </View>

        <Text style={styles.footerText}>
          Subscriptions renew automatically until cancelled. The payment provider confirms
          the final price and billing period before payment.
        </Text>
      </View>
    </ScrollView>
  );
};

const makeStyles = (colors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  content: {
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  contentWide: {
    paddingHorizontal: 24,
  },
  heroCard: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    ...shadow.card,
  },
  heroIcon: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
    marginBottom: 12,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 26,
    lineHeight: 34,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 5,
  },
  heroText: {
    maxWidth: 520,
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 7,
  },
  previewNotice: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 14,
    marginTop: 16,
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
  },
  previewNoticeText: {
    flexShrink: 1,
    color: colors.primary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 6,
  },
  retryButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  sectionLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginTop: 24,
    marginBottom: 8,
    marginLeft: 4,
  },
  currentCard: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    ...shadow.card,
  },
  currentIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
    marginRight: 12,
  },
  currentCopy: {
    flex: 1,
    minWidth: 0,
  },
  currentTitle: {
    color: colors.text,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '800',
  },
  currentText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 2,
  },
  currentBadge: {
    minHeight: 30,
    justifyContent: 'center',
    paddingHorizontal: 11,
    marginLeft: 8,
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
  },
  currentBadgeText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  planGrid: {
    gap: 12,
  },
  planGridWide: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  planCard: {
    padding: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    ...shadow.card,
  },
  planCardWide: {
    flex: 1,
  },
  planHeader: {
    minHeight: 132,
  },
  planNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  planName: {
    color: colors.text,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800',
  },
  recommendedBadge: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
  },
  recommendedText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  price: {
    color: colors.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  period: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  planDescription: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  featureList: {
    flex: 1,
    gap: 10,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  featureRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  featureIcon: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
    marginRight: 9,
  },
  freeFeatureIcon: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  featureText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  planButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginTop: 18,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  planButtonPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  planButtonSecondary: {
    backgroundColor: colors.card,
    borderColor: colors.primary,
  },
  planButtonPrimaryText: {
    color: colors.card,
    fontSize: 15,
    fontWeight: '800',
  },
  planButtonSecondaryText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '800',
  },
  buttonBusyContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.72,
  },
  freeCard: {
    gap: 10,
    padding: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  expiryCard: {
    padding: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  expiryHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  expiryIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
    marginRight: 12,
  },
  expiryHeadingCopy: {
    flex: 1,
    minWidth: 0,
  },
  expiryTitle: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
  },
  expiryText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 2,
  },
  expiryList: {
    gap: 10,
    paddingTop: 16,
    marginTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  expiryRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  expiryItemText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  subscriptionActions: {
    overflow: 'hidden',
    marginTop: 24,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  actionButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 16,
  },
  actionText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  actionDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 47,
    backgroundColor: colors.border,
  },
  footerText: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 14,
    paddingHorizontal: 16,
  },
});

export default PremiumScreen;
