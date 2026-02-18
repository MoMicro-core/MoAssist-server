'use strict';

module.exports = {
  write: {
    type: 'post',
    access: ['guest', 'admin'],
    handler: async ({ fastify, id, reason, client }) => {
      const listing = await fastify.mongodb.listings.findOne({ id });
      if (!listing) return { message: 'Listing not found', statusCode: 404 };
      await fastify.mongodb.reports.create({
        listingId: listing.id,
        reason,
        userId: client.session.uid,
      });
      return { listing };
    },
    schema: {
      tags: ['Listing'],
      summary: 'Report listing',
      description:
        'Submits a report for a listing that violates policies or ' +
        'guidelines. Requires guest or admin access. Reports are stored ' +
        'with the reporter\'s user ID for review.',
      body: {
        type: 'object',
        required: ['token', 'id', 'reason'],
        properties: {
          reason: { type: 'string', description: 'Reason for report' },
          token: { type: 'string', description: 'Session token' },
          id: { type: 'string', description: 'Listing ID (id)' },
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

  getMy: {
    type: 'get',
    access: ['host', 'admin'],
    handler: async ({ fastify, client }) => {
      const reports = await fastify.mongodb.reports.find({
        userId: client.session.uid,
      });
      return { reports };
    },
    schema: {
      tags: ['Listing'],
      summary: 'Get my reports',
      description:
        'Retrieves all reports submitted by the authenticated user. ' +
        'Requires host or admin access. Returns report details including ' +
        'listing ID and reason.',
      response: {
        200: {
          type: 'object',
          properties: {
            reports: {
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
