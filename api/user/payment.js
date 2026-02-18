'use strict';

module.exports = {
  getOnboardingLink: {
    type: 'post',
    access: ['host'],
    handler: async ({ fastify, client, stripeMode = 'sandbox' }) => {
      const user = await fastify.mongodb.user.findOne({
        uid: client.session.uid,
      });
      if (!user) return { message: 'User not found', statusCode: 404 };
      const stripeAccountId =
        stripeMode === 'live'
          ? user.stripeLive.stripeAccountId
          : user.stripeAccountId;

      const stripeManager =
        stripeMode === 'live'
          ? fastify.stripeManagerLive
          : fastify.stripeManager;
      const link = await stripeManager.getOnboardingLink(stripeAccountId);
      // const dashBoardLink = await fastify.stripe.accounts.createLoginLink(
      //   user.stripeAccountId,
      // );
      return { link };
    },
    schema: {
      tags: ['User'],
      summary: 'Get Stripe onboarding link',
      description:
        'Generates a Stripe Connect onboarding URL for the authenticated ' +
        'host. Required for setting up payment receiving capabilities ' +
        'before accepting bookings.',
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          stripeMode: {
            type: 'string',
            enum: ['sandbox', 'live'],
            default: 'sandbox',
          },
          token: { type: 'string', description: 'Session token' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            link: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  },

  getDashBoardLink: {
    type: 'post',
    access: ['host'],
    handler: async ({ fastify, client, stripeMode = 'sandbox' }) => {
      const user = await fastify.mongodb.user
        .findOne({
          uid: client.session.uid,
        })
        .select('id stripeAccountId');
      if (!user) return { message: 'User not found', statusCode: 404 };
      const stripeAccountId =
        stripeMode === 'live'
          ? user.stripeLive.stripeAccountId
          : user.stripeAccountId;

      const stripe =
        stripeMode === 'live' ? fastify.stripe : fastify.stripeLive;

      const dashBoardLink =
        await stripe.accounts.createLoginLink(stripeAccountId);
      return { dashBoardLink: dashBoardLink.url };
    },
    schema: {
      tags: ['User'],
      summary: 'Get Stripe dashboard link',
      description:
        'Generates a secure login link to the Stripe Express dashboard. ' +
        'Allows hosts to view earnings, manage payouts, and update ' +
        'payment settings.',
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          stripeMode: {
            type: 'string',
            enum: ['sandbox', 'live'],
            default: 'sandbox',
          },
          token: { type: 'string', description: 'Session token' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            dashBoardLink: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  },
  // updatePaymentInfo: {
  //   type: 'post',
  //   access: ['host'],
  //   handler: async ({ fastify, client, paymentInfo }) => {
  //     await fastify.stripeManager.updatePaymentInfo(
  //       client.session.stripeId,
  //       paymentInfo,
  //     );
  //   },
  //
  //   schema: {
  //     tags: ['User'],
  //     summary: 'Get a user by their UID',
  //     description: 'Get a user by their UID',
  //     body: {
  //       type: 'object',
  //       required: ['token'],
  //       properties: {
  //         token: { type: 'string', description: 'Session token' },
  //       },
  //       additionalProperties: true,
  //     },
  //     response: {
  //       200: {
  //         type: 'object',
  //         properties: {
  //           link: { type: 'string' },
  //           message: { type: 'string' },
  //         },
  //       },
  //     },
  //   },
  // },
};
