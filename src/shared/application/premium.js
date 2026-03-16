'use strict';

const ACTIVE_PREMIUM_STATUSES = new Set(['active', 'trialing']);

const isTrialExpired = (status, premiumCurrentPeriodEnd) => {
  if (status !== 'trialing' || !premiumCurrentPeriodEnd) return false;
  return new Date(premiumCurrentPeriodEnd).getTime() <= Date.now();
};

const normalizePremiumState = ({
  premiumStatus = 'free',
  premiumPlan = 'free',
  premiumCurrentPeriodEnd = null,
} = {}) => {
  if (isTrialExpired(premiumStatus, premiumCurrentPeriodEnd)) {
    return {
      premiumStatus: 'free',
      premiumPlan: 'free',
      premiumCurrentPeriodEnd: null,
    };
  }

  return {
    premiumStatus,
    premiumPlan,
    premiumCurrentPeriodEnd: premiumCurrentPeriodEnd
      ? new Date(premiumCurrentPeriodEnd)
      : null,
  };
};

const hasPremiumAccess = (value = {}) => {
  const normalized = normalizePremiumState(value);
  return ACTIVE_PREMIUM_STATUSES.has(normalized.premiumStatus);
};

module.exports = {
  ACTIVE_PREMIUM_STATUSES,
  normalizePremiumState,
  hasPremiumAccess,
};
