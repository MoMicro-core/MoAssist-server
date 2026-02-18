'use strict';

module.exports = {
  toggleAdmin: {
    type: 'post',
    access: ['admin', 'all'],
    handler: async ({ client, fastify }) => {
      if (client.session.role !== 'admin') {
        return { message: 'Not admin', statusCode: 403 };
      }
      client.session.mode = client.session.mode === 'admin' ? 'host' : 'admin';
      await fastify.mongodb.sessions.findOneAndUpdate(
        { token: client.session.token },
        { $set: { mode: client.session.mode } },
      );
      return { mode: client.session.mode };
    },
    schema: {
      tags: ['Admin'],
      summary: 'Toggle between admin and host mode',
      description:
        'Switch the current session between admin mode (for platform ' +
        'management) and host mode (for property management). Only ' +
        'available to users with admin role.',
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', description: 'Session token' },
        },
      },
      consumes: ['application/json'],
      response: {
        200: {
          type: 'object',
          properties: {
            mode: {
              type: 'string',
              example: 'guest',
            },
            message: { type: 'string' },
          },
        },
      },
    },
  },
};
