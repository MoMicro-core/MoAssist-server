'use strict';

module.exports = {
  get: {
    type: 'post',
    access: ['admin'],
    handler: async ({ fastify, page = 1, size = 10 }) => {
      const payments = await fastify.mongodb.payments
        .find()
        .skip((page - 1) * size)
        .limit(size)
        .lean();
      const bookingIds = payments.map((p) => p.bookingId);
      const bookings = await fastify.mongodb.bookings.find({
        id: { $in: bookingIds },
      });
      const userIds = payments.map((b) => b.hostUid);
      const hosts = await fastify.mongodb.user.find({
        uid: { $in: userIds },
      });
      for (const p of payments) {
        p.booking = bookings.find((b) => b.id === p.bookingId);
        p.userHost = hosts.find((h) => h.uid === p.hostUid);
      }
      return { payments };
    },
    schema: {
      tags: ['Admin'],
      summary: 'Get all payments and payouts',
      description:
        'Retrieve a paginated list of all payment transactions including ' +
        'associated booking details and host information. Used for ' +
        'financial oversight and payout management. Admin access required.',
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          page: { type: 'number', default: 1 },
          size: { type: 'number', default: 10 },
          token: { type: 'string', description: 'Session token' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            payments: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: true,
              },
            },
          },
        },
      },
    },
  },

  editUserPayoutMethod: {
    type: 'post',
    access: ['admin'],
    handler: async ({ fastify, newPayoutMethod, userId }) => {
      await fastify.mongodb.user.updateOne(
        { uid: userId },
        { $set: { payoutInfo: newPayoutMethod } },
      );
      return { message: 'success' };
    },
    schema: {
      tags: ['Admin'],
      summary: 'Update host payout method',
      description:
        'Review and update a host payout method configuration including ' +
        'bank accounts (IBAN), cards, and their verification status. Used ' +
        'to approve or modify payout destinations. Admin access required.',
      body: {
        type: 'object',
        required: ['token', 'newPayoutMethod', 'userId'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          newPayoutMethod: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              ibans: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    number: { type: 'string' },
                    email: { type: 'string' },
                    name: { type: 'string' },
                    address: { type: 'string' },
                    bic: { type: 'string' },
                    status: {
                      type: 'string',
                      enum: ['active', 'pending', 'failed'],
                      default: 'pending',
                    },
                    preferred: { type: 'boolean', default: false },
                  },
                },
              },
              cards: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    status: {
                      type: 'string',
                      enum: ['active', 'pending', 'failed'],
                      default: 'pending',
                    },
                    cardNumber: { type: 'string' },
                    email: { type: 'string' },
                    name: { type: 'string' },
                    preferred: { type: 'boolean', default: false },
                  },
                },
              },
            },
          },
          userId: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
      },
    },
  },
};
