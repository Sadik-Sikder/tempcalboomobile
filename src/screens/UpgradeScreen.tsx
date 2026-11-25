import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { makeStyles, useTheme } from '../theme/ThemeContext';
import { DashboardTabs, type DashboardTab } from '../components/DashboardTabs';
import { TopBarActions } from '../components/TopBarActions';
import { refreshUserInfo, useUserInfo } from '../api/profile';
import {
  PLANS,
  billingForPlanName,
  tierForPlanName,
  type Plan,
} from '../constants/plans';
import { useRefreshOnFocus } from '../navigation/useRefreshOnFocus';
import i18n from '../i18n';
import { formatDate as formatLocalDate } from '../utils/calendarGrid';

interface Props {
  onBack: () => void;
  onLoggedOut: () => void;
  onNavigate: (tab: DashboardTab) => void;
  onOpenProfile: () => void;
}

type Billing = 'monthly' | 'yearly';

// The web marks a paid plan as expiring soon inside its last 7 days
// (UpgradePlanComponent's expireFlag).
const EXPIRING_SOON_DAYS = 7;

function formatDate(iso: string): string {
  return formatLocalDate(new Date(iso), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// "Free" is a word to translate; "Pro" and "Pro+" are names.
function displayLabel(plan: Plan | undefined): string {
  return !plan || plan.tier === 'free'
    ? i18n.t('UPGRADE_PLAN.FREE_LABEL')
    : plan.label;
}

function planLabel(planName: string | null | undefined): string {
  const tier = tierForPlanName(planName);
  return displayLabel(PLANS.find(p => p.tier === tier));
}

// Mobile port of calbook's upgrade-plan page, without checkout for now:
// selling a digital subscription inside an Android app distributed on
// Google Play has to go through Play Billing, so the card/PromptPay
// payment flow (POST /create-payment) isn't carried over. The screen
// shows the current plan and what each tier includes; purchases happen on
// the web.
export function UpgradeScreen({
  onBack,
  onLoggedOut,
  onNavigate,
  onOpenProfile,
}: Props) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const userInfo = useUserInfo();
  const subscription = userInfo?.subscription;
  const currentTier = tierForPlanName(subscription?.plan_name);
  const [billing, setBilling] = useState<Billing>('monthly');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshError(null);
    try {
      await refreshUserInfo();
    } catch (err: any) {
      setRefreshError(err?.message ?? t('MOBILE.UPGRADE.LOAD_FAILED'));
    }
  }, [t]);

  // The cached user info can predate a purchase made on the web.
  useEffect(() => {
    refresh();
  }, [refresh]);

  useRefreshOnFocus(refresh);

  // Once the subscription loads, start on the billing period it uses.
  const currentBilling = billingForPlanName(subscription?.plan_name);
  useEffect(() => {
    if (currentBilling) setBilling(currentBilling);
  }, [currentBilling]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable onPress={onBack} style={styles.back} hitSlop={8}>
          <Text style={styles.backText}>
            {'‹'} {t('MOBILE.COMMON.BACK')}
          </Text>
        </Pressable>
        <TopBarActions
          onOpenProfile={onOpenProfile}
          onLoggedOut={onLoggedOut}
          onOpenNotifications={() => onNavigate('notifications')}
        />
      </View>

      <View style={styles.tabsRow}>
        <DashboardTabs active="upgrade" onChange={onNavigate} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <Text style={styles.headerTitle}>{t('NAV.UPGRADE_PLAN')}</Text>

        {!subscription ? (
          <View style={styles.loading}>
            {refreshError ? (
              <Text style={styles.error}>{refreshError}</Text>
            ) : (
              <ActivityIndicator color={colors.primaryText} />
            )}
          </View>
        ) : (
          <>
            <CurrentPlanCard subscription={subscription} />

            <View style={styles.billingToggle}>
              {(['monthly', 'yearly'] as const).map(option => {
                const selected = billing === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setBilling(option)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    style={[
                      styles.billingOption,
                      selected && styles.billingOptionSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.billingText,
                        selected && styles.billingTextSelected,
                      ]}
                    >
                      {option === 'monthly'
                        ? t('SHELL.MONTHLY')
                        : t('SHELL.YEARLY')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {PLANS.map(plan => (
              <PlanCard
                key={plan.tier}
                plan={plan}
                billing={billing}
                current={plan.tier === currentTier}
              />
            ))}

            <Text style={styles.footnote}>{t('MOBILE.UPGRADE.FOOTNOTE')}</Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function CurrentPlanCard({
  subscription,
}: {
  subscription: NonNullable<ReturnType<typeof useUserInfo>>['subscription'];
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const tier = tierForPlanName(subscription.plan_name);
  const billing = billingForPlanName(subscription.plan_name);
  const expiresAt = tier !== 'free' ? subscription.expires_at : null;
  const daysLeft = expiresAt
    ? (new Date(expiresAt).getTime() - Date.now()) / 86_400_000
    : null;
  const expiringSoon = daysLeft !== null && daysLeft <= EXPIRING_SOON_DAYS;
  const upcoming = subscription.upcoming_subscription;

  return (
    <View style={styles.currentCard}>
      <Text style={styles.currentLabel}>{t('MOBILE.UPGRADE.YOUR_PLAN')}</Text>
      <Text style={styles.currentName}>
        {planLabel(subscription.plan_name)}
        {billing && (
          <Text style={styles.currentBilling}>
            {'  '}
            {billing === 'monthly' ? t('SHELL.MONTHLY') : t('SHELL.YEARLY')}
          </Text>
        )}
      </Text>
      {expiresAt && (
        <Text style={[styles.expiry, expiringSoon && styles.expiringSoon]}>
          {t(
            expiringSoon
              ? 'MOBILE.UPGRADE.EXPIRES_SOON'
              : 'UPGRADE_PLAN.EXPIRES_ON',
            { date: formatDate(expiresAt) },
          )}
        </Text>
      )}
      {upcoming && (
        <Text style={styles.upcoming}>
          {t('MOBILE.UPGRADE.NEXT_PLAN', {
            plan: planLabel(upcoming.plan_name),
            starts: formatDate(upcoming.starts_at),
            ends: formatDate(upcoming.ends_at),
          })}
        </Text>
      )}
    </View>
  );
}

function PlanCard({
  plan,
  billing,
  current,
}: {
  plan: Plan;
  billing: Billing;
  current: boolean;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const free = plan.tier === 'free';
  const price = billing === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
  // Yearly against twelve months of the monthly price.
  const yearlySaving =
    !free && billing === 'yearly'
      ? Math.round((1 - plan.yearlyPrice / (plan.monthlyPrice * 12)) * 100)
      : 0;
  const badge = current
    ? t('UPGRADE_PLAN.CURRENT_PLAN')
    : plan.tier === 'pro'
    ? t('UPGRADE_PLAN.MOST_POPULAR')
    : null;

  return (
    <View style={[styles.planCard, current && styles.planCardCurrent]}>
      <View style={styles.planTop}>
        <Text style={styles.planName}>{displayLabel(plan)}</Text>
        {badge && (
          <View style={[styles.badge, current && styles.badgeCurrent]}>
            <Text
              style={[styles.badgeText, current && styles.badgeTextCurrent]}
            >
              {badge}
            </Text>
          </View>
        )}
      </View>

      <Text style={styles.price}>
        ${price}
        <Text style={styles.period}>
          {'  '}
          {free
            ? t('UPGRADE_PLAN.FOREVER')
            : billing === 'monthly'
            ? t('UPGRADE_PLAN.PER_MONTH')
            : t('UPGRADE_PLAN.PER_YEAR')}
        </Text>
      </Text>
      {yearlySaving > 0 && (
        <Text style={styles.saving}>
          {t('MOBILE.UPGRADE.YEARLY_SAVING', { percent: yearlySaving })}
        </Text>
      )}

      <Text style={styles.includedTitle}>
        {t('UPGRADE_PLAN.WHATS_INCLUDED')}
      </Text>
      {plan.features.map(feature => (
        <View key={feature.key} style={styles.featureRow}>
          <Text style={styles.check}>✓</Text>
          <Text style={styles.feature}>{t(feature.key, { n: feature.n })}</Text>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles(c => ({
  container: {
    flex: 1,
    backgroundColor: c.surface,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  back: {
    alignSelf: 'center',
  },
  backText: {
    color: c.primaryText,
    fontWeight: '600',
  },
  tabsRow: {
    marginTop: 8,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: c.text,
    marginBottom: 12,
  },
  loading: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  error: {
    color: c.danger,
    fontSize: 13.5,
  },
  currentCard: {
    backgroundColor: c.purpleTint,
    borderRadius: 14,
    padding: 16,
  },
  currentLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: c.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  currentName: {
    fontSize: 20,
    fontWeight: '700',
    color: c.text,
    marginTop: 4,
  },
  currentBilling: {
    fontSize: 13,
    fontWeight: '600',
    color: c.primaryText,
  },
  expiry: {
    fontSize: 13,
    color: c.text,
    marginTop: 6,
  },
  expiringSoon: {
    color: c.danger,
    fontWeight: '600',
  },
  upcoming: {
    fontSize: 13,
    color: c.textMuted,
    marginTop: 4,
  },
  billingToggle: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: c.disabledSurface,
    borderRadius: 999,
    padding: 4,
    marginTop: 20,
    marginBottom: 16,
  },
  billingOption: {
    paddingVertical: 7,
    paddingHorizontal: 22,
    borderRadius: 999,
  },
  billingOptionSelected: {
    backgroundColor: c.surface,
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  billingText: {
    fontSize: 13,
    fontWeight: '600',
    color: c.textMuted,
  },
  billingTextSelected: {
    color: c.text,
  },
  planCard: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.borderSoft,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  planCardCurrent: {
    borderColor: c.primary,
    borderWidth: 1.5,
  },
  planTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  planName: {
    fontSize: 17,
    fontWeight: '700',
    color: c.text,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: c.purpleTintStrong,
  },
  badgeCurrent: {
    backgroundColor: c.primary,
  },
  badgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: c.primaryText,
  },
  badgeTextCurrent: {
    color: c.onPrimary,
  },
  price: {
    fontSize: 28,
    fontWeight: '800',
    color: c.text,
    marginTop: 8,
  },
  period: {
    fontSize: 13,
    fontWeight: '500',
    color: c.textMuted,
  },
  saving: {
    fontSize: 12.5,
    fontWeight: '600',
    color: c.success,
    marginTop: 2,
  },
  includedTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: c.text,
    marginTop: 14,
    marginBottom: 6,
  },
  featureRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 3,
  },
  check: {
    color: c.primaryText,
    fontWeight: '700',
    fontSize: 13,
  },
  feature: {
    flex: 1,
    fontSize: 13,
    color: c.text,
    lineHeight: 18,
  },
  footnote: {
    fontSize: 12.5,
    color: c.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 8,
    paddingHorizontal: 12,
  },
}));
