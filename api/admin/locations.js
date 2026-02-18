'use strict';

module.exports = {
  edit: {
    type: 'post',
    access: ['admin'],
    handler: async ({ fastify, locationId, newSignature }) => {
      const location = await fastify.mongodb.locations.findOneAndUpdate(
        { id: locationId },
        { $set: { signature: newSignature } },
        { new: true },
      );
      return { location };
    },
    schema: {
      tags: ['Admin'],
      summary: 'Edit location signature',
      description:
        'Update the signature/description for a geographic location entry. ' +
        'The signature is used for display and search purposes. ' +
        'Admin access required.',
      consumes: ['application/json'],
      body: {
        type: 'object',
        required: ['token', 'locationId', 'newSignature'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          locationId: { type: 'string', description: 'Location MongoDB id' },
          newSignature: { type: 'string', description: 'New signature' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            location: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
  },
  get: {
    type: 'post',
    access: ['admin'],
    handler: async ({ fastify, page, pageSize, ids = [] }) => {
      const query = ids.length ? { id: { $in: ids } } : {};
      const location = await fastify.mongodb.locations
        .find(query)
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean();
      return { location };
    },
    schema: {
      tags: ['Admin'],
      summary: 'Get locations',
      description:
        'Retrieve geographic locations with pagination. Optionally filter ' +
        'by specific location IDs. Used for managing searchable ' +
        'destinations and location data. Admin access required.',
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          page: {
            type: 'integer',
            minimum: 1,
            default: 1,
            description: 'Page number for pagination',
          },
          pageSize: {
            type: 'integer',
            minimum: 1,
            default: 10,
            description: 'Number of items per page',
          },
          ids: { type: 'array', items: { type: 'string' }, default: [] },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            location: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
    },
  },
};
