'use strict';

module.exports = {
  changeStatus: {
    type: 'post',
    access: ['admin'],
    handler: async ({ fastify, userUid, status }) => {
      const user = await fastify.mongodb.user.findOneAndUpdate(
        { uid: userUid },
        { $set: { status } },
        { new: true },
      );
      return { user };
    },
    schema: {
      tags: ['Admin'],
      summary: 'Change user status',
      description:
        'Update a user account status to either active (allowing normal ' +
        'access) or blocked (preventing login and access). ' +
        'Admin access required.',
      body: {
        type: 'object',
        required: ['token', 'userUid', 'status'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          userUid: { type: 'string', description: 'User MongoDB id' },
          status: {
            type: 'string',
            description: 'Status',
            enum: ['active', 'blocked'],
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            user: { type: 'object', additionalProperties: true },
            message: { type: 'string' },
          },
        },
      },
    },
  },

  checkOnboardingStatus: {
    type: 'post',
    access: ['admin'],
    handler: async ({ fastify, userUid, stripeMode = 'sandbox' }) => {
      const user = await fastify.mongodb.user
        .findOne({ uid: userUid })
        .select('stripeAccountId');
      if (!user) return { message: 'User not found', statusCode: 404 };
      const stripeManager =
        stripeMode === 'live'
          ? fastify.stripeManagerLive
          : fastify.stripeManager;
      const checkOnBoarding = await stripeManager.checkOnboardingStatus(
        user.stripeAccountId,
      );
      return { checkOnBoarding };
    },
    schema: {
      tags: ['Admin'],
      summary: 'Check Stripe onboarding status',
      description:
        'Verify whether a user has completed their Stripe Connect ' +
        'onboarding process for receiving payouts. Returns true if ' +
        'onboarding is complete. Admin access required.',
      body: {
        type: 'object',
        required: ['token', 'userUid'],
        properties: {
          stripeMode: {
            type: 'string',
            enum: ['sandbox', 'live'],
            default: 'sandbox',
            description: 'Stripe mode',
          },
          token: { type: 'string', description: 'Session token' },
          userUid: { type: 'string', description: 'User MongoDB id' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            checkOnBoarding: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
    },
  },

  lastActivity: {
    type: 'post',
    access: ['admin'],
    handler: async ({ fastify, userUid }) => {
      const user = await fastify.mongodb.user
        .findOne({ uid: userUid })
        .select('lastActivity lastLogins');
      if (!user) return { message: 'User not found', statusCode: 404 };
      const bookings = await fastify.mongodb.bookings
        .find({ user: userUid })
        .sort({ createdAt: -1 })
        .limit(5);
      const listings = await fastify.mongodb.listings
        .find({ ownerUid: userUid })
        .sort({ createdAt: -1 })
        .limit(5);
      return { user, bookings, listings };
    },
    schema: {
      tags: ['Admin'],
      summary: 'Get user activity history',
      description:
        'Retrieve detailed activity information for a specific user ' +
        'including their last login timestamps, recent bookings (last 5), ' +
        'and recent listings (last 5). Admin access required.',
      body: {
        type: 'object',
        required: ['token', 'userUid'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          userUid: { type: 'string', description: 'User MongoDB id' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            user: { type: 'object', additionalProperties: true },
            bookings: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
            listings: {
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
