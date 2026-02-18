'use strict';

module.exports = {
  add: {
    type: 'post',
    access: ['admin'],
    handler: async ({ fastify, discount }) => {
      if (discount < 1 || discount > 50) {
        return { message: 'Discount must be between 0 and 50' };
      }
      const promo = await fastify.mongodb.promo.create({
        discount,
      });
      if (!promo) return { message: 'Promo not created' };
      return { promo };
    },
    schema: {
      tags: ['Promo', 'Admin'],
      summary: 'Create a new promo code',
      description:
        'Generate a new promotional discount code for bookings. Discount ' +
        'percentage must be between 1 and 50. The code is auto-generated ' +
        'and returned in the response. Admin access required.',
      body: {
        type: 'object',
        required: ['token', 'discount'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          discount: { type: 'number', description: 'Promo discount' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            promo: { type: 'object', additionalProperties: true },
            message: { type: 'string', example: 'Promo created' },
          },
        },
      },
    },
  },

  delete: {
    type: 'post',
    access: ['admin'],
    handler: async ({ fastify, code }) => {
      await fastify.mongodb.promo.deleteOne({ code });
      return { message: 'Promo deleted' };
    },
    schema: {
      tags: ['Promo', 'Admin'],
      summary: 'Delete a promo code',
      description:
        'Permanently remove a promotional code from the system. Once ' +
        'deleted, the code can no longer be used for discounts. ' +
        'Admin access required.',
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
            message: { type: 'string', example: 'Promo deleted' },
          },
        },
      },
    },
  },

  edit: {
    type: 'post',
    access: ['admin'],
    handler: async ({ fastify, code, discount }) => {
      if (discount < 1 || discount > 50) {
        return { message: 'Discount must be between 0 and 50' };
      }
      await fastify.mongodb.promo.updateOne({ code }, { $set: { discount } });
      return { message: 'Promo updated' };
    },
    schema: {
      tags: ['Promo', 'Admin'],
      summary: 'Update a promo code',
      description:
        'Modify the discount percentage for an existing promotional code. ' +
        'New discount must be between 1 and 50 percent. ' +
        'Admin access required.',
      body: {
        type: 'object',
        required: ['token', 'code', 'discount'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          code: { type: 'string', description: 'Promo code' },
          discount: { type: 'number', description: 'Promo discount' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'Promo updated' },
          },
        },
      },
    },
  },

  get: {
    type: 'post',
    access: ['admin'],
    handler: async ({ fastify }) => {
      const promos = await fastify.mongodb.promo.find();
      return { promos };
    },
    schema: {
      tags: ['Promo', 'Admin'],
      summary: 'Get all promo codes',
      description:
        'Retrieve a list of all promotional codes in the system with ' +
        'their discount values and usage statistics. Admin access required.',
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', description: 'Session token' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            promos: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
            message: { type: 'string' },
          },
        },
      },
    },
  },
};
