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
} = require('../../../shared/application/premium');

const DEFAULT_TRIAL_DAYS = 7;

class BillingService {
  constructor({
    userRepository,
    chatbotRepository,
    subscriptionRepository,
    stripeGateway,
    config,
    tierCatalog,
    log = () => null,
  }) {
    this.userRepository = userRepository;
    this.chatbotRepository = chatbotRepository;
    this.subscriptionRepository = subscriptionRepository;
    this.stripeGateway = stripeGateway;
    this.config = config;
    this.tierCatalog = tierCatalog;
    this.log = log;
    // Bounded in-process replay guard. Stripe retries within minutes, so a
    // small recent-id window covers the realistic duplicate case without a new
    // collection. The staleness check below is the durable backstop.
    this.processedEvents = new Set();
    this.processedEventOrder = [];
  }

  rememberEvent(eventId) {
    if (!eventId || this.processedEvents.has(eventId)) return;
    this.processedEvents.add(eventId);
    this.processedEventOrder.push(eventId);
    if (this.processedEventOrder.length > 500) {
      this.processedEvents.delete(this.processedEventOrder.shift());
    }
  }

  // A webhook we cannot apply may mean a customer paid and got nothing, so it
  // must never disappear silently the way it used to.
  ignoreWebhook(event, reason) {
    this.log(
      `stripe webhook ignored (${reason}) for event ${event?.id || 'unknown'}`,
    );
    return { received: true, ignored: true, reason };
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
    const resolvedTier = this.tierCatalog.resolveForState(normalized);
    normalized.premiumPlan =
      normalized.premiumStatus === 'free' ? 'free' : resolvedTier.id;
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
    // ownerUid lets the connector admin read another user's billing summary;
    // it is rejected for everyone else (docs/momicro-connector-prd.md §5).
    const ownerUid = String(payload.ownerUid || '').trim();
    if (ownerUid && actor.role !== 'admin') {
      throw new ForbiddenError('ownerUid filter requires an admin');
    }
    const targetUid = ownerUid || actor.uid;

    const user = await this.userRepository.findByUid(targetUid);
    if (!user) throw new NotFoundError('User not found');
    const availableTiers = this.tierCatalog.list();

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
        currentTier: this.tierCatalog.resolveForState(chatbot).toSummary(),
        availableTiers,
        subscriptions,
      };
    }

    const chatbots = await this.chatbotRepository.listByOwner(targetUid);
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
          currentTier: this.tierCatalog.resolveForState(normalized).toSummary(),
          subscriptions,
        };
      }),
    );

    return {
      customerId: user.stripeCustomerId,
      availableTiers,
      chatbots: chatbotSummaries,
    };
  }

  async createCheckoutSession(actor, payload = {}) {
    const prepared = await this.prepareCheckout(actor, payload, {
      trial: false,
    });

    return this.stripeGateway.createCheckoutSession(prepared);
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
    const trialDays = this.resolveTrialDays(payload.trialDays);
    const prepared = await this.prepareCheckout(actor, payload, {
      trial: true,
      trialDays,
    });

    return this.stripeGateway.createCheckoutSession(prepared);
  }

  async handleWebhook(rawBody, signature) {
    const event = this.stripeGateway.constructWebhookEvent(rawBody, signature);

    if (!event.type.startsWith('customer.subscription.')) {
      return { received: true, ignored: true };
    }

    // Stripe retries on failure and does not guarantee ordering, so a delayed
    // `deleted` retry could land after a successful resubscription and revoke a
    // paying customer. Drop anything we have already applied, or that is older
    // than the state we already hold.
    if (this.processedEvents.has(event.id)) {
      return { received: true, ignored: true, reason: 'duplicate_event' };
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

    if (!user) return this.ignoreWebhook(event, 'user_not_found');

    const metadataChatbotId = subscription.metadata?.chatbotId || '';
    const existing = await this.subscriptionRepository.findById(
      subscription.id,
    );
    const chatbotId = metadataChatbotId || existing?.chatbotId || '';
    if (!chatbotId) return this.ignoreWebhook(event, 'chatbot_id_missing');

    const chatbot = await this.chatbotRepository.findById(chatbotId);
    if (!chatbot || chatbot.ownerUid !== user.uid) {
      return this.ignoreWebhook(
        event,
        chatbot ? 'owner_mismatch' : 'chatbot_not_found',
      );
    }

    const existingUpdatedAt = existing?.stripeUpdatedAt
      ? new Date(existing.stripeUpdatedAt).getTime()
      : 0;
    const eventCreatedAt = Number(event.created || 0) * 1000;
    if (
      eventCreatedAt &&
      existingUpdatedAt &&
      eventCreatedAt < existingUpdatedAt
    ) {
      return this.ignoreWebhook(event, 'stale_event');
    }

    await this.subscriptionRepository.upsertFromStripe(
      user.uid,
      chatbotId,
      subscription,
    );
    await this.syncPremiumState(chatbotId, chatbot);
    this.rememberEvent(event.id);

    return { received: true };
  }

  async syncPremiumState(chatbotId, chatbot = null) {
    let currentChatbot = chatbot;
    if (!currentChatbot) {
      currentChatbot = await this.chatbotRepository.findById(chatbotId);
    }
    if (!currentChatbot) return;
    const subscriptions =
      await this.subscriptionRepository.listByChatbot(chatbotId);
    const active = subscriptions.find((item) =>
      ACTIVE_PREMIUM_STATUSES.has(item.status),
    );
    const premiumStatus = active ? active.status : 'free';
    let premiumPlan = 'free';
    if (active) {
      premiumPlan = (
        this.tierCatalog.get(active.raw?.metadata?.tierId) ||
        this.tierCatalog.resolveByPriceId(active.priceId) ||
        this.tierCatalog.resolveForState({
          premiumStatus: active.status,
          premiumPlan: active.priceId,
          premiumCurrentPeriodEnd: active.currentPeriodEnd,
        })
      ).id;
    }
    const premiumCurrentPeriodEnd = active?.currentPeriodEnd || null;
    let trialUsedAt = currentChatbot.trialUsedAt || null;
    if (!trialUsedAt && active?.status === 'trialing') {
      trialUsedAt = active?.raw?.trial_start
        ? new Date(active.raw.trial_start * 1000)
        : new Date();
    }

    const nextState = {
      premiumStatus,
      premiumPlan,
      premiumCurrentPeriodEnd,
    };

    if (trialUsedAt && !currentChatbot.trialUsedAt) {
      nextState.trialUsedAt = trialUsedAt;
    }

    await this.chatbotRepository.updateById(chatbotId, {
      $set: nextState,
    });
  }

  resolveTrialDays(trialDays) {
    const configured = Number(this.config.trialDays || DEFAULT_TRIAL_DAYS);
    const fallback = Number.isFinite(configured)
      ? Math.min(30, Math.max(1, Math.trunc(configured)))
      : DEFAULT_TRIAL_DAYS;
    const requested = Number(trialDays);
    if (!Number.isFinite(requested)) return fallback;
    return Math.min(30, Math.max(1, Math.trunc(requested)));
  }

  async prepareCheckout(
    actor,
    payload = {},
    { trial = false, trialDays = 0 } = {},
  ) {
    const chatbot = await this.getOwnedChatbot(actor, payload.chatbotId);
    const owner = await this.userRepository.findByUid(chatbot.ownerUid);
    if (!owner) throw new NotFoundError('User not found');

    const tier = trial
      ? this.tierCatalog.resolveTrialTier(payload)
      : this.tierCatalog.resolveCheckoutTier(payload);
    if (!tier) {
      throw new BadRequestError(
        trial
          ? 'Requested trial tier is not available'
          : 'Requested subscription tier is not available',
      );
    }
    if (!tier.stripePriceId) {
      throw new BadRequestError(
        `Stripe price id is not configured for tier "${tier.id}"`,
      );
    }

    const subscriptions = await this.subscriptionRepository.listByChatbot(
      chatbot.id,
    );
    const activeSubscription = subscriptions.find((item) =>
      ACTIVE_PREMIUM_STATUSES.has(item.status),
    );

    if (trial) {
      if (chatbot.trialUsedAt || subscriptions.length > 0) {
        throw new BadRequestError(
          'Trial is not available for this chatbot anymore',
        );
      }

      if (ACTIVE_PREMIUM_STATUSES.has(chatbot.premiumStatus)) {
        throw new BadRequestError(
          'This chatbot already has an active premium or trial access',
        );
      }
    } else if (activeSubscription) {
      throw new BadRequestError(
        'This chatbot already has an active subscription',
      );
    }

    // Was hardcoded to production, so a staging or local checkout returned the
    // visitor to the live site.
    const baseUrl = this.config?.environment?.appUrl || 'https://momicro.com';
    const encodedChatbotId = encodeURIComponent(chatbot.id);
    const successUrl =
      payload.successUrl ||
      `${baseUrl}/billing/success?chatbotId=${encodedChatbotId}`;
    const cancelUrl =
      payload.cancelUrl ||
      `${baseUrl}/billing/failure?chatbotId=${encodedChatbotId}`;

    return {
      customerId: owner.stripeCustomerId,
      priceId: tier.stripePriceId,
      successUrl,
      cancelUrl,
      uid: owner.uid,
      chatbotId: chatbot.id,
      tierId: tier.id,
      trialDays: trial ? trialDays : 0,
    };
  }
}

module.exports = { BillingService };
