'use strict';

const fp = require('fastify-plugin');
const Stripe = require('stripe');
const { BadRequestError } = require('../src/shared/application/errors');

class StripeGateway {
  constructor(config) {
    this.config = config;
    this.client = config.secretKey ? new Stripe(config.secretKey) : null;
  }

  assertConfigured() {
    if (!this.client) throw new BadRequestError('Stripe is not configured');
  }

  async findCustomer(customerId) {
    if (!customerId) return null;

    try {
      const customer = await this.client.customers.retrieve(customerId);
      return customer.deleted ? null : customer;
    } catch {
      return null;
    }
  }

  async ensureCustomer({ customerId, email, uid }) {
    this.assertConfigured();
    const customer = await this.findCustomer(customerId);
    if (customer) return customer;

    return this.client.customers.create({
      email,
      metadata: { uid },
    });
  }

  async createCheckoutSession({
    customerId,
    priceId,
    successUrl,
    cancelUrl,
    uid,
    chatbotId,
    tierId,
    trialDays,
  }) {
    this.assertConfigured();
    const payload = {
      mode: 'subscription',
      customer: customerId,
    };
    payload['success_url'] = successUrl;
    payload['cancel_url'] = cancelUrl;
    payload['line_items'] = [
      {
        price: priceId,
        quantity: 1,
      },
    ];
    payload['subscription_data'] = {
      metadata: { uid, chatbotId, tierId },
    };
    if (Number.isFinite(trialDays) && trialDays > 0) {
      payload.subscription_data['trial_period_days'] = Math.trunc(trialDays);
    }
    payload['allow_promotion_codes'] = true;
    const session = await this.client.checkout.sessions.create(payload);

    return { id: session.id, url: session.url };
  }

  async createPortalSession({ customerId, returnUrl }) {
    this.assertConfigured();
    const payload = { customer: customerId };
    payload['return_url'] = returnUrl;
    const session = await this.client.billingPortal.sessions.create(payload);
    return { url: session.url };
  }

  constructWebhookEvent(rawBody, signature) {
    this.assertConfigured();
    return this.client.webhooks.constructEvent(
      rawBody,
      signature,
      this.config.webhookSecret,
    );
  }
}

const stripePlugin = async (fastify) => {
  fastify.decorate('stripe', new StripeGateway(fastify.config.stripe));
};

module.exports = fp(stripePlugin, {
  fastify: '5.x',
});
