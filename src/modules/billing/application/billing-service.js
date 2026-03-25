'use strict';

const {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} = require('../../../shared/application/errors');
const {
  canManageOwnerResource,
} = require('../../../shared/application/permissions');
const {
  ACTIVE_PREMIUM_STATUSES,
  normalizePremiumState,
  hasPremiumAccess,
} = require('../../../shared/application/premium');

const DEFAULT_TRIAL_DAYS = 3;

class BillingService {
  constructor({
    userRepository,
    chatbotRepository,
    subscriptionRepository,
    stripeGateway,
    config,
  }) {
    this.userRepository = userRepository;
    this.chatbotRepository = chatbotRepository;
    this.subscriptionRepository = subscriptionRepository;
    this.stripeGateway = stripeGateway;
    this.config = config;
  }

  async ensureCustomer({ customerId, email, uid }) {
    const customer = await this.stripeGateway.ensureCustomer({
      customerId,
      email,
      uid,
    });
    return customer.id;
  }

  async getOwnedChatbot(actor, chatbotId) {
    if (!chatbotId) throw new BadRequestError('chatbotId is required');
    const chatbot = await this.chatbotRepository.findById(chatbotId);
    if (!chatbot) throw new NotFoundError('Chatbot not found');
    if (!canManageOwnerResource(actor, chatbot.ownerUid)) {
      throw new ForbiddenError('Chatbot is not accessible');
    }
    return this.normalizeChatbotPremium(chatbot);
  }

  async normalizeChatbotPremium(chatbot) {
    const normalized = normalizePremiumState(chatbot);
    const currentMs = chatbot.premiumCurrentPeriodEnd
      ? new Date(chatbot.premiumCurrentPeriodEnd).getTime()
      : 0;
    const nextMs = normalized.premiumCurrentPeriodEnd
      ? new Date(normalized.premiumCurrentPeriodEnd).getTime()
      : 0;
    const changed =
      chatbot.premiumStatus !== normalized.premiumStatus ||
      chatbot.premiumPlan !== normalized.premiumPlan ||
      currentMs !== nextMs;

    if (!changed) return chatbot;

    const updated = await this.chatbotRepository.updateById(chatbot.id, {
      $set: normalized,
    });

    return updated || { ...chatbot, ...normalized };
  }

  async getSummary(actor, payload = {}) {
    const user = await this.userRepository.findByUid(actor.uid);
    if (!user) throw new NotFoundError('User not found');

    if (payload.chatbotId) {
      const chatbot = await this.getOwnedChatbot(actor, payload.chatbotId);
      const subscriptions = await this.subscriptionRepository.listByChatbot(
        chatbot.id,
      );
      return {
        customerId: user.stripeCustomerId,
        chatbotId: chatbot.id,
        premiumStatus: chatbot.premiumStatus,
        premiumPlan: chatbot.premiumPlan,
        premiumCurrentPeriodEnd: chatbot.premiumCurrentPeriodEnd,
        subscriptions,
      };
    }

    const chatbots = await this.chatbotRepository.listByOwner(actor.uid);
    const chatbotSummaries = await Promise.all(
      chatbots.map(async (chatbot) => {
        const normalized = await this.normalizeChatbotPremium(chatbot);
        const subscriptions = await this.subscriptionRepository.listByChatbot(
          normalized.id,
        );
        return {
          chatbotId: normalized.id,
          premiumStatus: normalized.premiumStatus,
          premiumPlan: normalized.premiumPlan,
          premiumCurrentPeriodEnd: normalized.premiumCurrentPeriodEnd,
          subscriptions,
        };
      }),
    );

    return {
      customerId: user.stripeCustomerId,
      chatbots: chatbotSummaries,
    };
  }

  async createCheckoutSession(actor, payload = {}) {
    const chatbot = await this.getOwnedChatbot(actor, payload.chatbotId);
    const owner = await this.userRepository.findByUid(chatbot.ownerUid);
    if (!owner) throw new NotFoundError('User not found');

    const priceId = payload.priceId || this.config.stripe.premiumPriceId || '';

    if (!priceId) {
      throw new BadRequestError('Stripe premium price id is not configured');
    }

    const subscriptions = await this.subscriptionRepository.listByChatbot(
      chatbot.id,
    );
    const activeSubscription = subscriptions.find((item) =>
      ACTIVE_PREMIUM_STATUSES.has(item.status),
    );

    if (activeSubscription) {
      throw new BadRequestError(
        'This chatbot already has an active subscription',
      );
    }

    const baseUrl = this.config.environment.appUrl || 'http://localhost:8080';
    const successUrl =
      payload.successUrl || `${baseUrl}/static/auth.html?billing=success`;
    const cancelUrl =
      payload.cancelUrl || `${baseUrl}/static/auth.html?billing=cancel`;

    return this.stripeGateway.createCheckoutSession({
      customerId: owner.stripeCustomerId,
      priceId,
      successUrl,
      cancelUrl,
      uid: owner.uid,
      chatbotId: chatbot.id,
    });
  }

  async createPortalSession(actor, payload = {}) {
    let customerId = '';
    if (payload.chatbotId) {
      const chatbot = await this.getOwnedChatbot(actor, payload.chatbotId);
      const owner = await this.userRepository.findByUid(chatbot.ownerUid);
      if (!owner) throw new NotFoundError('User not found');
      customerId = owner.stripeCustomerId;
    } else {
      const user = await this.userRepository.findByUid(actor.uid);
      if (!user) throw new NotFoundError('User not found');
      customerId = user.stripeCustomerId;
    }

    const returnUrl =
      payload.returnUrl ||
      `${this.config.environment.appUrl || 'http://localhost:8080'}/static/auth.html`;

    return this.stripeGateway.createPortalSession({
      customerId,
      returnUrl,
    });
  }

  async startTrial(actor, payload = {}) {
    const chatbot = await this.getOwnedChatbot(actor, payload.chatbotId);
    const subscriptions = await this.subscriptionRepository.listByChatbot(
      chatbot.id,
    );

    if (chatbot.trialUsedAt || subscriptions.length > 0) {
      throw new BadRequestError(
        'Trial is not available for this chatbot anymore',
      );
    }

    if (hasPremiumAccess(chatbot)) {
      throw new BadRequestError(
        'This chatbot already has an active premium or trial access',
      );
    }

    const trialDays = DEFAULT_TRIAL_DAYS;
    const now = new Date();
    const premiumCurrentPeriodEnd = new Date(
      now.getTime() + trialDays * 24 * 60 * 60 * 1000,
    );

    const updated = await this.chatbotRepository.updateById(chatbot.id, {
      $set: {
        premiumStatus: 'trialing',
        premiumPlan: 'trial',
        premiumCurrentPeriodEnd,
        trialUsedAt: now,
      },
    });

    return {
      chatbotId: chatbot.id,
      premiumStatus: updated?.premiumStatus || 'trialing',
      premiumPlan: updated?.premiumPlan || 'trial',
      premiumCurrentPeriodEnd:
        updated?.premiumCurrentPeriodEnd || premiumCurrentPeriodEnd,
    };
  }

  async handleWebhook(rawBody, signature) {
    const event = this.stripeGateway.constructWebhookEvent(rawBody, signature);

    if (!event.type.startsWith('customer.subscription.')) {
      return { received: true, ignored: true };
    }

    const subscription = event.data.object;
    const customerId = subscription.customer;
    const metadataUserUid = subscription.metadata?.uid || '';
    const userByMetadata = metadataUserUid
      ? await this.userRepository.findByUid(metadataUserUid)
      : null;
    const userByCustomer =
      await this.userRepository.findByStripeCustomerId(customerId);
    const user = userByMetadata || userByCustomer;

    if (!user) return { received: true, ignored: true };

    const metadataChatbotId = subscription.metadata?.chatbotId || '';
    const existing = await this.subscriptionRepository.findById(
      subscription.id,
    );
    const chatbotId = metadataChatbotId || existing?.chatbotId || '';
    if (!chatbotId) return { received: true, ignored: true };

    const chatbot = await this.chatbotRepository.findById(chatbotId);
    if (!chatbot || chatbot.ownerUid !== user.uid) {
      return { received: true, ignored: true };
    }

    await this.subscriptionRepository.upsertFromStripe(
      user.uid,
      chatbotId,
      subscription,
    );
    await this.syncPremiumState(chatbotId);

    return { received: true };
  }

  async syncPremiumState(chatbotId) {
    const subscriptions =
      await this.subscriptionRepository.listByChatbot(chatbotId);
    const active = subscriptions.find((item) =>
      ACTIVE_PREMIUM_STATUSES.has(item.status),
    );
    const premiumStatus = active ? active.status : 'free';
    const premiumPlan = active?.priceId || 'free';
    const premiumCurrentPeriodEnd = active?.currentPeriodEnd || null;

    await this.chatbotRepository.updateById(chatbotId, {
      $set: {
        premiumStatus,
        premiumPlan,
        premiumCurrentPeriodEnd,
      },
    });
  }
}

module.exports = { BillingService };
