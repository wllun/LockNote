import React, { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FREE_FEATURES, PREMIUM_PLANS } from '../config/premiumPlans';
import { radius, shadow, useTheme } from '../theme';
import { AppAlert as Alert } from '../utils/app-alert';

const PremiumScreen = () => {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const useWideLayout = width >= 760;

  const showComingSoon = (action) => {
    Alert.alert(
      'Subscriptions coming soon',
      `${action} will be available after LockNote subscriptions are connected.`
    );
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
            Compare the planned tiers while LockNote prepares subscriptions.
          </Text>
          <View style={styles.previewNotice}>
            <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
            <Text style={styles.previewNoticeText}>Purchases are not connected yet.</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>CURRENT PLAN</Text>
        <View style={styles.currentCard}>
          <View style={styles.currentIcon}>
            <Ionicons name="checkmark" size={21} color={colors.primary} />
          </View>
          <View style={styles.currentCopy}>
            <Text style={styles.currentTitle}>Free</Text>
            <Text style={styles.currentText}>Core offline features · RM 0</Text>
          </View>
          <View style={styles.currentBadge}>
            <Text style={styles.currentBadgeText}>Current</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>PLANS</Text>
        <View style={[styles.planGrid, useWideLayout && styles.planGridWide]}>
          {PREMIUM_PLANS.map((plan) => (
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
                  <Text style={styles.price}>{plan.price}</Text>
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
                accessibilityLabel={`Choose ${plan.name}`}
                accessibilityHint="Shows information about subscription availability"
                onPress={() => showComingSoon(`${plan.name} upgrades`)}
                style={({ pressed }) => [
                  styles.planButton,
                  plan.id === 'premium-1' ? styles.planButtonPrimary : styles.planButtonSecondary,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={
                    plan.id === 'premium-1'
                      ? styles.planButtonPrimaryText
                      : styles.planButtonSecondaryText
                  }
                >
                  Coming soon
                </Text>
              </Pressable>
            </View>
          ))}
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

        <View style={styles.subscriptionActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Restore purchases"
            onPress={() => showComingSoon('Restore purchases')}
            style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
          >
            <Ionicons name="refresh-outline" size={20} color={colors.primary} />
            <Text style={styles.actionText}>Restore purchases</Text>
          </Pressable>
          <View style={styles.actionDivider} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Manage subscription"
            onPress={() => showComingSoon('Manage subscription')}
            style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
          >
            <Ionicons name="card-outline" size={20} color={colors.primary} />
            <Text style={styles.actionText}>Manage subscription</Text>
          </Pressable>
        </View>

        <Text style={styles.footerText}>
          Prices and included features are proposals and may change before launch.
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
