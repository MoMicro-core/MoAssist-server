import type { Actor, AppConfig, PremiumStatus, StripeGateway, Subscription } from '../../../types';
import type { UserRepository } from '../../auth/infrastructure/user-repository';
import type { SubscriptionRepository } from '../infrastructure/subscription-repository';

export const ACTIVE_STATUSES: ReadonlySet<'active' | 'trialing'>;

export class BillingService {
  constructor(args: {
    userRepository: UserRepository;
    subscriptionRepository: SubscriptionRepository;
    stripeGateway: StripeGateway;
    config: AppConfig;
  });

  ensureCustomer(args: {
    customerId: string;
    email: string;
    uid: string;
  }): Promise<string>;

  getSummary(actor: Actor): Promise<{
    customerId: string;
    premiumStatus: PremiumStatus;
    premiumPlan: string;
    premiumCurrentPeriodEnd: Date | null;
    subscriptions: Subscription[];
  }>;

  createCheckoutSession(
    actor: Actor,
    payload?: {
      priceId?: string;
      successUrl?: string;
      cancelUrl?: string;
    },
  ): Promise<{ id: string; url: string | null }>;

  createPortalSession(
    actor: Actor,
    payload?: { returnUrl?: string },
  ): Promise<{ url: string | null }>;

  handleWebhook(
    rawBody: Buffer | string,
    signature: string,
  ): Promise<{ received: true; ignored?: true }>;

  syncPremiumState(userUid: string): Promise<void>;
}
