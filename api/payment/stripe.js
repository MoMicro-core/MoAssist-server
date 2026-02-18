'use strict';
const PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY;
const PUBLISHABLE_KEY_LIVE = process.env.STRIPE_PUBLISHABLE_KEY_LIVE;

module.exports = {
  'publishableKey/:type': {
    type: 'get',
    access: ['public', 'unregistered'],
    handler: async ({ request }) => {
      const { type } = request.params;
      if (!type || type === 'sandbox') {
        return { publishableKey: PUBLISHABLE_KEY };
      } else {
        return { publishableKey: PUBLISHABLE_KEY_LIVE };
      }
    },
    schema: {
      tags: ['Payment'],
      summary: 'Get Stripe public key',
      description:
        'Returns the Stripe publishable key required for client-side ' +
        'payment integration. This key is safe to expose publicly and is ' +
        'used to initialize Stripe.js on the frontend.',
      response: {
        200: {
          type: 'object',
          properties: {
            publishableKey: { type: 'string' },
          },
        },
      },
    },
  },
};
