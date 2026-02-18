'use strict';

module.exports = {
  get: {
    access: ['host', 'admin'],
    type: 'post',
    handler: async ({ fastify, listingId }) => {
      const translation = await fastify.mongodb.translationListing.findOne({
        id: listingId,
      });
      if (!translation) {
        return { message: 'Listing not found', statusCode: 404 };
      }
      return { translation };
    },
    schema: {
      tags: ['Localization'],
      summary: 'Retrieve listing translations',
      description:
        'Retrieves all available language translations for a specific ' +
        'listing. Requires host or admin access. Returns the complete ' +
        'translation object including all supported languages.',
      body: {
        type: 'object',
        required: ['token', 'listingId'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          listingId: { type: 'string', description: 'Listing MongoDB id' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            translation: {
              type: 'object',
              additionalProperties: true,
            },
            message: { type: 'string' },
          },
        },
      },
    },
  },

  edit: {
    access: ['host', 'admin'],
    type: 'post',
    handler: async ({ fastify, client, listingId, lang, content }) => {
      const listing = await fastify.mongodb.listings.findOne({
        id: listingId,
      });
      if (
        listing.ownerUid !== client.session.uid &&
        !listing.managers.includes(client.session.uid) &&
        client.session.mode !== 'admin'
      ) {
        return { message: 'No permission', statusCode: 401 };
      }
      const translation = await fastify.mongodb.translationListing.findOne({
        id: listingId,
      });
      if (!translation) {
        return { message: 'Listing not found', statusCode: 404 };
      }
      translation.languages = translation.languages.map((l) => {
        if (l.name === lang) {
          l.translation = content;
        }
        return l;
      });
      await translation.save();
      return { translation };
    },
    schema: {
      tags: ['Localization'],
      summary: 'Update listing translation',
      description:
        'Updates the translation content for a specific language on a ' +
        'listing. Requires host or admin access. Only the listing owner ' +
        'or managers can modify translations.',
      body: {
        type: 'object',
        required: ['token', 'listingId', 'lang', 'content'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          listingId: { type: 'string', description: 'Listing MongoDB id' },
          lang: { type: 'string', description: 'Language' },
          content: {
            type: 'object',
            additionalProperties: true,
            description: 'Content',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            translation: {
              type: 'object',
              additionalProperties: true,
            },
            message: { type: 'string' },
          },
        },
      },
    },
  },
};
