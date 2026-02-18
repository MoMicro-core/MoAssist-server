'use strict';

module.exports = {
  request: {
    type: 'post',
    access: ['public'],
    handler: async ({ fastify, email }) => {
      const existing = await fastify.mongodb.earlyEmails.findOne({ email });
      if (existing) {
        return { message: 'Email already requested' };
      }

      await fastify.mongodb.earlyEmails.insertOne({ email });
      return { message: 'Email accepted' };
    },
    schema: {
      tags: ['Admin'],
      summary: 'Request early access',
      description:
        'Submit an email address to join the early access waitlist. ' +
        'Returns a message indicating whether the email was accepted ' +
        'or was already registered.',
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string' },
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

  get: {
    type: 'post',
    access: ['admin'],
    handler: async ({ fastify }) => {
      const emails = await fastify.mongodb.earlyEmails.find();
      return { emails };
    },
    schema: {
      tags: ['Admin'],
      summary: 'Get early access requests',
      description:
        'Retrieve the list of all email addresses that have requested ' +
        'early access to the platform. Admin access required.',
      response: {
        200: {
          type: 'object',
          properties: {
            emails: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  },
};
