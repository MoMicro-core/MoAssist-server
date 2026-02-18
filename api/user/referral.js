'use strict';

module.exports = {
  getLink: {
    type: 'post',
    access: ['all'],
    handler: async ({ client }) => ({
      link: `https://rstays.com/?referral_id=${client.session.uid}`,
    }),
    schema: {
      summary: 'Get referral link',
      description:
        'Generates a unique referral URL for the authenticated user. ' +
        'New users who register through this link are tracked as ' +
        'referrals.',
      tags: ['User'],
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
            link: { type: 'string' },
          },
        },
      },
    },
  },

  statistics: {
    type: 'post',
    access: ['all'],
    handler: async ({ client, fastify }) => {
      const me = await fastify.mongodb.user
        .findOne({
          uid: client.session.uid,
        })
        .select('referrals');
      const referrals = await fastify.mongodb.user.find({
        uid: { $in: me.referrals },
      });
      const allBookings = await fastify.mongodb.bookings.find({
        user: { $in: me.referrals },
      });
      const result = [];
      for (const referral of referrals) {
        const bookings = allBookings.filter(
          (booking) => booking.user === referral.uid,
        );
        for (const booking of bookings) {
          result.push({
            user: referral.name,
            status: booking.status,
            amount: booking.totalPrice * fastify.config.stripe.referralFee,
          });
        }
      }
      return { result };
    },
    schema: {
      summary: 'Get referral statistics',
      description:
        'Retrieves detailed referral program statistics including ' +
        'referred users, their booking activity, and potential earnings ' +
        'based on the referral fee percentage.',
      tags: ['User'],
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
            result: {
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
};
