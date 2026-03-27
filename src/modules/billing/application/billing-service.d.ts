import type {
  Actor,
  AppConfig,
  BillingTierSummary,
  PremiumStatus,
  StripeGateway,
  Subscription,
} from '../../../types';
import type { ChatbotRepository } from '../../chatbots/infrastructure/chatbot-repository';
import type { UserRepository } from '../../auth/infrastructure/user-repository';
import type { SubscriptionRepository } from '../infrastructure/subscription-repository';
import type { TierCatalog } from '../../../shared/application/premium';

export class BillingService {
  constructor(args: {
    userRepository: UserRepository;
    chatbotRepository: ChatbotRepository;
    subscriptionRepository: SubscriptionRepository;
    stripeGateway: StripeGateway;
    config: AppConfig;
    tierCatalog: TierCatalog;
  });

  ensureCustomer(args: {
    customerId: string;
    email: string;
    uid: string;
  }): Promise<string>;

  getSummary(
    actor: Actor,
    payload?: { chatbotId?: string },
  ): Promise<
    | {
        customerId: string;
        chatbotId: string;
        premiumStatus: PremiumStatus;
        premiumPlan: string;
        premiumCurrentPeriodEnd: Date | null;
        currentTier: BillingTierSummary;
        availableTiers: BillingTierSummary[];
        subscriptions: Subscription[];
      }
    | {
        customerId: string;
        availableTiers: BillingTierSummary[];
        chatbots: Array<{
          chatbotId: string;
          premiumStatus: PremiumStatus;
          premiumPlan: string;
          premiumCurrentPeriodEnd: Date | null;
          currentTier: BillingTierSummary;
          subscriptions: Subscription[];
        }>;
      }
  >;

  createCheckoutSession(
    actor: Actor,
    payload?: {
      chatbotId?: string;
      tierId?: string;
      priceId?: string;
      successUrl?: string;
      cancelUrl?: string;
    },
  ): Promise<{ id: string; url: string | null }>;

  createPortalSession(
    actor: Actor,
    payload?: { chatbotId?: string; returnUrl?: string },
  ): Promise<{ url: string | null }>;

  startTrial(
    actor: Actor,
    payload?: { chatbotId?: string; trialDays?: number },
  ): Promise<{
    chatbotId: string;
    premiumStatus: PremiumStatus;
    premiumPlan: string;
    premiumCurrentPeriodEnd: Date | null;
  }>;

  handleWebhook(
    rawBody: Buffer | string,
    signature: string,
  ): Promise<{ received: true; ignored?: true }>;

  syncPremiumState(chatbotId: string): Promise<void>;
}
