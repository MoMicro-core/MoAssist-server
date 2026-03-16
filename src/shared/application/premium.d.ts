import type { PremiumStatus } from '../../types';

export const ACTIVE_PREMIUM_STATUSES: ReadonlySet<'active' | 'trialing'>;

export function normalizePremiumState(value?: {
  premiumStatus?: PremiumStatus;
  premiumPlan?: string;
  premiumCurrentPeriodEnd?: Date | null;
}): {
  premiumStatus: PremiumStatus;
  premiumPlan: string;
  premiumCurrentPeriodEnd: Date | null;
};

export function hasPremiumAccess(value?: {
  premiumStatus?: PremiumStatus;
  premiumCurrentPeriodEnd?: Date | null;
}): boolean;
