'use strict';

const { ForbiddenError } = require('./errors');

const ACTIVE_PREMIUM_STATUSES = new Set(['active', 'trialing']);
const TIER_CAPABILITIES = Object.freeze({
  AUTHENTICATED_WIDGET: 'authenticated_widget',
  AI_RESPONDER: 'ai_responder',
  KNOWLEDGE_FILES: 'knowledge_files',
});

const toPlainObject = (value = {}) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};

const normalizeStringArray = (value = []) => [
  ...new Set(
    (Array.isArray(value) ? value : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean),
  ),
];

const normalizeLimits = (value = {}) =>
  Object.fromEntries(
    Object.entries(toPlainObject(value)).filter(([, item]) =>
      Number.isFinite(item),
    ),
  );

const normalizeMetadata = (value = {}) => ({ ...toPlainObject(value) });

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
    premiumPlan: String(premiumPlan || 'free').trim() || 'free',
    premiumCurrentPeriodEnd: premiumCurrentPeriodEnd
      ? new Date(premiumCurrentPeriodEnd)
      : null,
  };
};

class TierPolicy {
  constructor(definition = {}) {
    this.id = String(definition.id || '')
      .trim()
      .toLowerCase();
    this.name = String(definition.name || this.id).trim() || this.id;
    this.monthlyPriceUsd = Number.isFinite(definition.monthlyPriceUsd)
      ? Number(definition.monthlyPriceUsd)
      : 0;
    this.checkoutEnabled = definition.checkoutEnabled === true;
    this.stripePriceId = String(definition.stripePriceId || '').trim();
    this.capabilities = normalizeStringArray(definition.capabilities);
    this.limits = normalizeLimits(definition.limits);
    this.metadata = normalizeMetadata(definition.metadata);
  }

  hasCapability(capability) {
    return this.capabilities.includes(String(capability || '').trim());
  }

  assertCapability(capability, message) {
    if (this.hasCapability(capability)) return;
    throw new ForbiddenError(
      message || `Tier "${this.id}" does not allow "${capability}"`,
    );
  }

  toSummary() {
    return {
      id: this.id,
      name: this.name,
      monthlyPriceUsd: this.monthlyPriceUsd,
      checkoutEnabled: this.checkoutEnabled,
      stripePriceConfigured: Boolean(this.stripePriceId),
      capabilities: [...this.capabilities],
      limits: { ...this.limits },
      metadata: { ...this.metadata },
    };
  }
}

class CapabilityTierPolicy extends TierPolicy {}

class TierPolicyFactory {
  create(definition = {}) {
    return new CapabilityTierPolicy(definition);
  }
}

class TierCatalog {
  constructor(config = {}, factory = new TierPolicyFactory()) {
    this.factory = factory;
    this.trialTierId = String(config.trialTierId || 'full')
      .trim()
      .toLowerCase();
    this.defaultCheckoutTierId = String(config.defaultCheckoutTierId || 'full')
      .trim()
      .toLowerCase();

    const definitions = Array.isArray(config.tiers) ? config.tiers : [];
    this.policies = definitions
      .map((definition) => this.factory.create(definition))
      .filter((policy) => policy.id);
    this.policiesById = new Map(
      this.policies.map((policy) => [policy.id, policy]),
    );
    this.policiesByPriceId = new Map(
      this.policies
        .filter((policy) => policy.stripePriceId)
        .map((policy) => [policy.stripePriceId, policy]),
    );
    this.freePolicy =
      this.get('free') ||
      this.policies.find((policy) => policy.monthlyPriceUsd === 0) ||
      new CapabilityTierPolicy({
        id: 'free',
        name: 'Free',
        monthlyPriceUsd: 0,
        checkoutEnabled: false,
      });
  }

  list() {
    return this.policies.map((policy) => policy.toSummary());
  }

  listCheckout() {
    return this.policies
      .filter((policy) => policy.checkoutEnabled)
      .map((policy) => policy.toSummary());
  }

  get(id = '') {
    return (
      this.policiesById.get(
        String(id || '')
          .trim()
          .toLowerCase(),
      ) || null
    );
  }

  resolveByPriceId(priceId = '') {
    return this.policiesByPriceId.get(String(priceId || '').trim()) || null;
  }

  resolvePaidFallback() {
    return (
      this.get(this.defaultCheckoutTierId) ||
      this.policies
        .filter((policy) => policy.id !== this.freePolicy.id)
        .sort(
          (left, right) => right.monthlyPriceUsd - left.monthlyPriceUsd,
        )[0] ||
      this.freePolicy
    );
  }

  resolveForState(value = {}) {
    const normalized = normalizePremiumState(value);
    if (!ACTIVE_PREMIUM_STATUSES.has(normalized.premiumStatus)) {
      return this.freePolicy;
    }

    if (normalized.premiumStatus === 'trialing') {
      return this.get(this.trialTierId) || this.resolvePaidFallback();
    }

    const direct =
      this.get(normalized.premiumPlan) ||
      this.resolveByPriceId(normalized.premiumPlan);
    return direct || this.freePolicy;
  }

  resolveCheckoutTier({ tierId = '', priceId = '' } = {}) {
    if (tierId) {
      const tier = this.get(tierId);
      if (!tier || !tier.checkoutEnabled) return null;
      if (priceId && tier.stripePriceId && tier.stripePriceId !== priceId) {
        return null;
      }
      return tier;
    }

    if (priceId) {
      const tier = this.resolveByPriceId(priceId);
      return tier && tier.checkoutEnabled ? tier : null;
    }

    const fallback = this.get(this.defaultCheckoutTierId);
    return fallback && fallback.checkoutEnabled ? fallback : null;
  }

  hasCapability(value = {}, capability) {
    return this.resolveForState(value).hasCapability(capability);
  }
}

const createTierCatalog = (config = {}) => new TierCatalog(config);

const hasPremiumAccess = (value = {}, tierCatalog = null) => {
  const catalog =
    tierCatalog ||
    createTierCatalog({
      tiers: [
        {
          id: 'free',
          name: 'Free',
          monthlyPriceUsd: 0,
          checkoutEnabled: false,
        },
        {
          id: 'full',
          name: 'Full',
          monthlyPriceUsd: 50,
          checkoutEnabled: true,
          capabilities: Object.values(TIER_CAPABILITIES),
        },
      ],
      trialTierId: 'full',
      defaultCheckoutTierId: 'full',
    });
  return catalog.resolveForState(value).id !== catalog.freePolicy.id;
};

module.exports = {
  ACTIVE_PREMIUM_STATUSES,
  TIER_CAPABILITIES,
  TierPolicy,
  CapabilityTierPolicy,
  TierPolicyFactory,
  TierCatalog,
  normalizePremiumState,
  createTierCatalog,
  hasPremiumAccess,
};
