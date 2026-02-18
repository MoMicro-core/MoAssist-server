'use strict';

module.exports = {
  check: {
    type: 'post',
    access: ['guest'],
    handler: async ({ fastify, code }) => {
      const promo = await fastify.mongodb.promo
        .findOne({
          code,
        })
        .lean();
      if (!promo) return { message: 'No such code', statusCode: 404 };
      return { promo };
    },
    schema: {
      tags: ['Booking'],
      summary: 'Validate promo code',
      description:
        'Check if a promotional discount code is valid and retrieve its ' +
        'discount percentage. Use before checkout to show guests the ' +
        'applicable discount. Returns 404 if code does not exist.',
      body: {
        type: 'object',
        required: ['token', 'code'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          code: { type: 'string', description: 'Promo code' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            promo: {
              type: 'object',
              additionalProperties: true,
              properties: {
                code: { type: 'string' },
                discount: { type: 'number' },
              },
            },
            message: { type: 'string' },
          },
        },
      },
    },
  },
};
