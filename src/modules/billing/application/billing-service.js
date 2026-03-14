'use strict';

const {
  BadRequestError,
  NotFoundError,
} = require('../../../shared/application/errors');

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

class BillingService {
  constructor({
    userRepository,
    subscriptionRepository,
    stripeGateway,
    config,
  }) {
    this.userRepository = userRepository;
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

  async getSummary(actor) {
    const user = await this.userRepository.findByUid(actor.uid);
    if (!user) throw new NotFoundError('User not found');
    const subscriptions = await this.subscriptionRepository.listByUser(
      actor.uid,
    );

    return {
      customerId: user.stripeCustomerId,
      premiumStatus: user.premiumStatus,
      premiumPlan: user.premiumPlan,
      premiumCurrentPeriodEnd: user.premiumCurrentPeriodEnd,
      subscriptions,
    };
  }

  async createCheckoutSession(actor, payload = {}) {
    const user = await this.userRepository.findByUid(actor.uid);
    if (!user) throw new NotFoundError('User not found');

    const priceId = payload.priceId || this.config.stripe.premiumPriceId || '';

    if (!priceId) {
      throw new BadRequestError('Stripe premium price id is not configured');
    }

    const baseUrl = this.config.environment.appUrl || 'http://localhost:8080';
    const successUrl =
      payload.successUrl || `${baseUrl}/static/auth.html?billing=success`;
    const cancelUrl =
      payload.cancelUrl || `${baseUrl}/static/auth.html?billing=cancel`;

    return this.stripeGateway.createCheckoutSession({
      customerId: user.stripeCustomerId,
      priceId,
      successUrl,
      cancelUrl,
      uid: user.uid,
    });
  }

  async createPortalSession(actor, payload = {}) {
    const user = await this.userRepository.findByUid(actor.uid);
    if (!user) throw new NotFoundError('User not found');

    const returnUrl =
      payload.returnUrl ||
      `${this.config.environment.appUrl || 'http://localhost:8080'}/static/auth.html`;

    return this.stripeGateway.createPortalSession({
      customerId: user.stripeCustomerId,
      returnUrl,
    });
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

    await this.subscriptionRepository.upsertFromStripe(user.uid, subscription);
    await this.syncPremiumState(user.uid);

    return { received: true };
  }

  async syncPremiumState(userUid) {
    const subscriptions = await this.subscriptionRepository.listByUser(userUid);
    const active = subscriptions.find((item) =>
      ACTIVE_STATUSES.has(item.status),
    );
    const premiumStatus = active ? active.status : 'free';
    const premiumPlan = active?.priceId || 'free';
    const premiumCurrentPeriodEnd = active?.currentPeriodEnd || null;

    await this.userRepository.updateByUid(userUid, {
      $set: {
        premiumStatus,
        premiumPlan,
        premiumCurrentPeriodEnd,
      },
    });
  }
}

module.exports = { BillingService, ACTIVE_STATUSES };
