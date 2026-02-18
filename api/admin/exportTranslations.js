'use strict';

module.exports = {
  unit: {
    type: 'post',
    access: ['admin'],
    protocols: ['http'],
    handler: async ({ fastify }) => {
      const units = await fastify.mongodb.translationUnit.find().lean();
      const headers = {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="units.json"',
      };
      return { file: JSON.stringify(units), headers };
    },
    schema: {
      tags: ['Admin'],
      summary: 'Export unit translations',
      description:
        'Download all unit translations as a JSON file. Useful for ' +
        'backup, migration, or external translation management. Returns ' +
        'a downloadable JSON file attachment. Admin access required.',
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', description: 'Session token' },
        },
      },
      response: {
        200: {
          type: 'string',
          content: {
            'application/json': {
              schema: {
                type: 'string',
                format: 'binary',
              },
            },
          },
        },
      },
    },
  },

  listings: {
    type: 'post',
    access: ['admin'],
    protocols: ['http'],
    handler: async ({ fastify }) => {
      const units = await fastify.mongodb.translationListing.find().lean();
      const headers = {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="listings.json"',
      };
      return { file: JSON.stringify(units), headers };
    },
    schema: {
      tags: ['Admin'],
      summary: 'Export listing translations',
      description:
        'Download all listing translations as a JSON file. Useful for ' +
        'backup, migration, or external translation management. Returns ' +
        'a downloadable JSON file attachment. Admin access required.',
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', description: 'Session token' },
        },
      },
      response: {
        200: {
          type: 'string',
          content: {
            'application/json': {
              schema: {
                type: 'string',
                format: 'binary',
              },
            },
          },
        },
      },
    },
  },

  multiunits: {
    type: 'post',
    access: ['admin'],
    protocols: ['http'],
    handler: async ({ fastify }) => {
      const units = await fastify.mongodb.translationMultiunit.find().lean();
      const headers = {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="multiunits.json"',
      };
      return { file: JSON.stringify(units), headers };
    },
    schema: {
      tags: ['Admin'],
      summary: 'Export multiunit translations',
      description:
        'Download all multiunit property translations as a JSON file. ' +
        'Useful for backup, migration, or external translation ' +
        'management. Returns a downloadable JSON file attachment. ' +
        'Admin access required.',
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', description: 'Session token' },
        },
      },
      response: {
        200: {
          type: 'string',
          content: {
            'application/json': {
              schema: {
                type: 'string',
                format: 'binary',
              },
            },
          },
        },
      },
    },
  },
};
