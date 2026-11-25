export type PlanTier = 'free' | 'pro' | 'proPlus';

export interface Plan {
  tier: PlanTier;
  label: string;
  monthlyPrice: number;
  yearlyPrice: number;
  // Each line of "What's included": a key in src/i18n, and the number it
  // shows ({{n}}), if any.
  features: { key: string; n?: number }[];
}

export const PLANS: Plan[] = [
  {
    tier: 'free',
    label: 'Free',
    monthlyPrice: 0,
    yearlyPrice: 0,
    features: [
      { key: 'MOBILE.PLANS.EVENTS_PER_MONTH', n: 10 },
      { key: 'MOBILE.PLANS.TASKS_PER_MONTH', n: 10 },
      { key: 'MOBILE.PLANS.ONE_ON_ONE_ONLY' },
      { key: 'MOBILE.PLANS.SOLO_ONLY' },
      { key: 'MOBILE.PLANS.BOOKING_PAGE' },
    ],
  },
  {
    tier: 'pro',
    label: 'Pro',
    monthlyPrice: 8,
    yearlyPrice: 88,
    features: [
      { key: 'MOBILE.PLANS.EVENTS_PER_MONTH', n: 100 },
      { key: 'MOBILE.PLANS.TASKS_PER_MONTH', n: 100 },
      { key: 'MOBILE.PLANS.UP_TO_TEAMS', n: 5 },
      { key: 'MOBILE.PLANS.MEMBERS_PER_TEAM', n: 10 },
      { key: 'MOBILE.PLANS.PRO_MEETING_TYPES' },
    ],
  },
  {
    tier: 'proPlus',
    label: 'Pro+',
    monthlyPrice: 15,
    yearlyPrice: 109,
    features: [
      { key: 'MOBILE.PLANS.EVENTS_PER_MONTH', n: 1000 },
      { key: 'MOBILE.PLANS.TASKS_PER_MONTH', n: 1000 },
      { key: 'MOBILE.PLANS.UP_TO_TEAMS', n: 50 },
      { key: 'MOBILE.PLANS.MEMBERS_PER_TEAM', n: 50 },
      { key: 'MOBILE.PLANS.MULTI_HOST' },
    ],
  },
];

// Mirrors UpgradePlanComponent.getPlanTier(): the backend reports the
// subscription by its Stripe price name, or 'Free'.
const TIER_BY_PLAN_NAME: Record<string, PlanTier> = {
  price_pro_monthly: 'pro',
  price_pro_yearly: 'pro',
  price_team_monthly: 'proPlus',
  price_team_yearly: 'proPlus',
};

export function tierForPlanName(planName: string | null | undefined): PlanTier {
  return (planName && TIER_BY_PLAN_NAME[planName]) || 'free';
}

export function billingForPlanName(
  planName: string | null | undefined,
): 'monthly' | 'yearly' | null {
  if (planName?.endsWith('_monthly')) return 'monthly';
  if (planName?.endsWith('_yearly')) return 'yearly';
  return null;
}
