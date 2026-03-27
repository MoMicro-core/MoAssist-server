import type { PremiumStatus } from '../../types';
import type {
  BillingTierCapability,
  BillingTierConfig,
  BillingTierSummary,
} from '../../types';

export const ACTIVE_PREMIUM_STATUSES: ReadonlySet<'active' | 'trialing'>;
export const TIER_CAPABILITIES: Readonly<{
  AUTHENTICATED_WIDGET: 'authenticated_widget';
  AI_RESPONDER: 'ai_responder';
  KNOWLEDGE_FILES: 'knowledge_files';
}>;

export class TierPolicy {
  id: string;
  name: string;
  monthlyPriceUsd: number;
  checkoutEnabled: boolean;
  stripePriceId: string;
  capabilities: BillingTierCapability[];
  limits: Record<string, number>;
  metadata: Record<string, unknown>;

  constructor(definition?: BillingTierConfig);
  hasCapability(capability: BillingTierCapability): boolean;
  assertCapability(capability: BillingTierCapability, message?: string): void;
  toSummary(): BillingTierSummary;
}

export class CapabilityTierPolicy extends TierPolicy {}

export class TierPolicyFactory {
  create(definition?: BillingTierConfig): CapabilityTierPolicy;
}

export class TierCatalog {
  constructor(
    config?: {
      tiers?: BillingTierConfig[];
      trialTierId?: string;
      defaultCheckoutTierId?: string;
    },
    factory?: TierPolicyFactory,
  );

  freePolicy: TierPolicy;
  list(): BillingTierSummary[];
  listCheckout(): BillingTierSummary[];
  get(id: string): TierPolicy | null;
  resolveByPriceId(priceId: string): TierPolicy | null;
  resolveForState(value?: {
    premiumStatus?: PremiumStatus;
    premiumPlan?: string;
    premiumCurrentPeriodEnd?: Date | null;
  }): TierPolicy;
  resolveCheckoutTier(payload?: {
    tierId?: string;
    priceId?: string;
  }): TierPolicy | null;
  hasCapability(
    value: {
      premiumStatus?: PremiumStatus;
      premiumPlan?: string;
      premiumCurrentPeriodEnd?: Date | null;
    },
    capability: BillingTierCapability,
  ): boolean;
}

export function normalizePremiumState(value?: {
  premiumStatus?: PremiumStatus;
  premiumPlan?: string;
  premiumCurrentPeriodEnd?: Date | null;
}): {
  premiumStatus: PremiumStatus;
  premiumPlan: string;
  premiumCurrentPeriodEnd: Date | null;
};

export function createTierCatalog(config?: {
  tiers?: BillingTierConfig[];
  trialTierId?: string;
  defaultCheckoutTierId?: string;
}): TierCatalog;

export function hasPremiumAccess(value?: {
  premiumStatus?: PremiumStatus;
  premiumPlan?: string;
  premiumCurrentPeriodEnd?: Date | null;
}, tierCatalog?: TierCatalog): boolean;
