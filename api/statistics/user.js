'use strict';

module.exports = {
  getTransactions: {
    type: 'post',
    access: ['all', 'admin'],
    handler: async ({ fastify, client, size, stripeMode = 'sandbox' }) => {
      const stripeManager =
        stripeMode === 'live'
          ? fastify.stripeManagerLive
          : fastify.stripeManager;
      const transactions = await stripeManager.getEarnings(
        stripeMode === 'live'
          ? client.session.stripeLive.stripeId
          : client.session.stripeId,
        size,
      );
      if (!transactions) {
        return { message: 'transactions not found', statusCode: 404 };
      }
      return { transactions };
    },
    schema: {
      tags: ['Statistics'],
      summary: 'Get payment transactions',
      description:
        'Retrieves the authenticated users Stripe transaction history. ' +
        'Returns paginated list of transactions associated with the ' +
        'users Stripe account. Requires valid Stripe account ' +
        'connection.',
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          size: {
            type: 'number',
            description: 'Page size',
            default: 10,
            minimum: 1,
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            transactions: {
              type: 'object',
              additionalProperties: true,
            },
          },
        },
      },
    },
  },

  getEarnings: {
    type: 'post',
    access: ['host', 'admin'],
    handler: async ({ fastify, ...props }) => {
      // const { , client, fromDate, toDate } = props;
      // const { listingId = null } = props;
      const res = await fastify.statistics.getEarnings(props);
      return { ...res };
    },
    schema: {
      tags: ['Statistics'],
      summary: 'Get earnings overview',
      description:
        'Retrieves comprehensive earnings statistics for a host ' +
        'including total nights, occupancy rate, listing views, reserved ' +
        'nights, net earnings, payouts, and upcoming earnings. Supports ' +
        'optional date range and listing filters. Requires host or admin ' +
        'access.',
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          fromDate: {
            type: 'string',
            format: 'date',
            description: 'From date',
          },
          toDate: { type: 'string', format: 'date', description: 'To date' },
          listingId: { type: 'string', description: 'Listing ID (id)' },
          stripeMode: {
            type: 'string',
            description: 'Stripe mode: sandbox or live',
            enum: ['sandbox', 'live'],
            default: 'sandbox',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            earnings: {
              type: 'object',
              additionalProperties: true,
            },
            accuracy: { type: 'number' },
            totalNights: { type: 'number' },
            occupancy: { type: 'number' },
            views: { type: 'number' },
            reserved: { type: 'number' },
            upcomingEarnings: {
              type: 'object',
              additionalProperties: true,
            },
          },
          additionalProperties: true,
        },
      },
    },
  },
};
