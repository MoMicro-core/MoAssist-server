'use strict';

module.exports = {
  manage: {
    access: ['admin'],
    type: 'post',
    handler: async ({ fastify, userUid, verified }) => {
      await fastify.mongodb.user.updateOne(
        { uid: userUid },
        { $set: { verified } },
      );
      await fastify.mongodb.sessions.updateMany(
        { uid: userUid },
        { $set: { verified } },
      );
      return { message: 'User verification status updated' };
    },
    schema: {
      summary: 'Manage user verification status',
      description:
        'Manually set a user verification status. When verified is set ' +
        'to true, the user gains access to verified-only features. ' +
        'Updates both user record and all active sessions. ' +
        'Admin access required.',
      tags: ['Verification'],
      body: {
        type: 'object',
        required: ['token', 'userUid', 'verified'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          userUid: { type: 'string', description: 'User unique identifier' },
          verified: { type: 'boolean', description: 'Verification status' },
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
