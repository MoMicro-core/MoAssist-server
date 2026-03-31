'use strict';

module.exports = ({ services }) => [
  {
    method: 'GET',
    url: '/v1/subscription',
    access: ['user', 'admin'],
    schema: {
      tags: ['Billing'],
      summary: 'Read premium subscription summary',
      querystring: {
        type: 'object',
        properties: {
          chatbotId: { type: 'string' },
        },
      },
    },
    handler: async (request) =>
      services.billingService.getSummary(
        request.appSession,
        request.query || {},
      ),
  },
  {
    method: 'POST',
    url: '/v1/subscription/checkout',
    access: ['user', 'admin'],
    schema: {
      tags: ['Billing'],
      summary: 'Create a Stripe checkout session',
      body: {
        type: 'object',
        required: ['chatbotId'],
        properties: {
          chatbotId: { type: 'string' },
          successUrl: { type: 'string' },
          cancelUrl: { type: 'string' },
          tierId: { type: 'string' },
          priceId: { type: 'string' },
        },
      },
    },
    handler: async (request) =>
      services.billingService.createCheckoutSession(
        request.appSession,
        request.body || {},
      ),
  },
  {
    method: 'POST',
    url: '/v1/subscription/portal',
    access: ['user', 'admin'],
    schema: {
      tags: ['Billing'],
      summary: 'Create a Stripe billing portal session',
      body: {
        type: 'object',
        properties: {
          chatbotId: { type: 'string' },
          returnUrl: { type: 'string' },
        },
      },
    },
    handler: async (request) =>
      services.billingService.createPortalSession(
        request.appSession,
        request.body || {},
      ),
  },
  {
    method: 'POST',
    url: '/v1/subscription/trial',
    access: ['user', 'admin'],
    schema: {
      tags: ['Billing'],
      summary: 'Start premium trial for a chatbot',
      body: {
        type: 'object',
        required: ['chatbotId'],
        properties: {
          chatbotId: { type: 'string' },
          successUrl: { type: 'string' },
          cancelUrl: { type: 'string' },
          tierId: { type: 'string' },
          priceId: { type: 'string' },
          trialDays: { type: 'integer', minimum: 1, maximum: 30 },
        },
      },
    },
    handler: async (request) =>
      services.billingService.startTrial(
        request.appSession,
        request.body || {},
      ),
  },
  {
    method: 'POST',
    url: '/v1/stripe/webhook',
    access: ['public'],
    config: { rawBody: true },
    schema: {
      tags: ['Billing'],
      summary: 'Handle Stripe webhooks',
    },
    handler: async (request) =>
      services.billingService.handleWebhook(
        request.rawBody,
        request.headers['stripe-signature'],
      ),
  },
];
