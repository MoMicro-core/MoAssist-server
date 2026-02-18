'use strict';

module.exports = {
  defaultEuropa: {
    type: 'get',
    access: ['public'],
    protocols: ['http'],
    handler: async ({ fastify }) => {
      const holidays = fastify.config.holidays.europe;

      return { holidays };
    },
    schema: {
      tags: ['Calendar'],
      summary: 'Get European holidays',
      description:
        'Retrieve the list of default European holidays used for ' +
        'seasonal pricing rules. Includes major holidays like Christmas, ' +
        'Easter, New Year, etc. Public endpoint - no authentication ' +
        'required.',
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            holidays: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
    },
  },

  defaultArabic: {
    type: 'get',
    access: ['public'],
    protocols: ['http'],
    handler: async ({ fastify }) => {
      const holidays = fastify.config.holidays.arab;
      return { holidays };
    },
    schema: {
      tags: ['Calendar'],
      summary: 'Get Arabic holidays',
      description:
        'Retrieve the list of default Arabic/Islamic holidays used for ' +
        'seasonal pricing rules. Includes holidays like Eid al-Fitr, ' +
        'Eid al-Adha, etc. Public endpoint - no authentication required.',
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            holidays: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
    },
  },
};
