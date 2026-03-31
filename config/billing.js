'use strict';

const normalizeTrialDays = (value, fallback = 7) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(30, Math.max(1, Math.trunc(numeric)));
};

const DEFAULT_BILLING_TIERS = Object.freeze([
  {
    id: 'free',
    name: 'Free',
    monthlyPriceUsd: 0,
    checkoutEnabled: false,
    capabilities: [],
    limits: {},
    metadata: {
      description:
        'Live chat for website visitors without signed-in customer matching or AI automation.',
      audience: 'Small shops that need a simple support inbox.',
    },
  },
  {
    id: 'auth',
    name: 'Connected',
    monthlyPriceUsd: 20,
    checkoutEnabled: true,
    stripePriceId:
      process.env.STRIPE_AUTH_PRICE_ID || process.env.StripeAuthPriceId || '',
    capabilities: ['authenticated_widget'],
    limits: {},
    metadata: {
      description:
        'Connect signed-in website customers to the chat and keep support tied to customer accounts.',
      audience: 'Stores that need account-based support without AI replies.',
    },
  },
  {
    id: 'full',
    name: 'Full AI',
    monthlyPriceUsd: 50,
    checkoutEnabled: true,
    stripePriceId:
      process.env.STRIPE_FULL_PRICE_ID ||
      process.env.StripeFullPriceId ||
      process.env.STRIPE_PREMIUM_PRICE_ID ||
      process.env.StripePremiumPriceId ||
      '',
    capabilities: ['authenticated_widget', 'ai_responder', 'knowledge_files'],
    limits: {},
    metadata: {
      description:
        'Use signed-in customer support, AI answers, and knowledge uploads in one chatbot.',
      audience:
        'Businesses that want full automation plus a human support team.',
      featured: true,
    },
  },
]);

const toPlainObject = (value = {}) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};

const normalizeStringArray = (value = [], fallback = []) => {
  const source = Array.isArray(value) ? value : fallback;
  return [
    ...new Set(source.map((item) => String(item || '').trim()).filter(Boolean)),
  ];
};

const normalizeLimits = (value = {}, fallback = {}) => {
  const source = {
    ...toPlainObject(fallback),
    ...toPlainObject(value),
  };

  return Object.fromEntries(
    Object.entries(source).filter(([, item]) => Number.isFinite(item)),
  );
};

const normalizeMetadata = (value = {}, fallback = {}) => ({
  ...toPlainObject(fallback),
  ...toPlainObject(value),
});

const normalizeTierDefinition = (value = {}, fallback = {}) => {
  const id = String(value.id || fallback.id || '')
    .trim()
    .toLowerCase();
  const name = String(value.name || fallback.name || id).trim() || id;
  let monthlyPriceUsd = 0;
  if (Number.isFinite(value.monthlyPriceUsd)) {
    monthlyPriceUsd = Number(value.monthlyPriceUsd);
  } else if (Number.isFinite(fallback.monthlyPriceUsd)) {
    monthlyPriceUsd = Number(fallback.monthlyPriceUsd);
  }

  let checkoutEnabled = monthlyPriceUsd > 0;
  if (fallback.checkoutEnabled !== undefined) {
    checkoutEnabled = fallback.checkoutEnabled === true;
  }
  if (value.checkoutEnabled !== undefined) {
    checkoutEnabled = value.checkoutEnabled === true;
  }

  return {
    id,
    name,
    monthlyPriceUsd,
    checkoutEnabled,
    stripePriceId: String(
      value.stripePriceId || fallback.stripePriceId || '',
    ).trim(),
    capabilities: normalizeStringArray(
      value.capabilities || value.features,
      fallback.capabilities || fallback.features || [],
    ),
    limits: normalizeLimits(value.limits, fallback.limits),
    metadata: normalizeMetadata(value.metadata, fallback.metadata),
  };
};

const parseTierOverrides = (value = '') => {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const mergeTierDefinitions = (defaults, overrides = []) => {
  const merged = new Map(
    defaults.map((tier) => [tier.id, normalizeTierDefinition(tier)]),
  );

  for (const override of overrides) {
    const id = String(override?.id || '')
      .trim()
      .toLowerCase();
    if (!id) continue;
    const current = merged.get(id) || { id };
    merged.set(id, normalizeTierDefinition(override, current));
  }

  return [...merged.values()];
};

module.exports = {
  trialDays: normalizeTrialDays(process.env.BILLING_TRIAL_DAYS, 7),
  trialTierId: process.env.BILLING_TRIAL_TIER_ID || 'full',
  defaultCheckoutTierId: process.env.BILLING_DEFAULT_CHECKOUT_TIER_ID || 'full',
  tiers: mergeTierDefinitions(
    DEFAULT_BILLING_TIERS,
    parseTierOverrides(process.env.BILLING_TIER_DEFINITIONS),
  ),
};
