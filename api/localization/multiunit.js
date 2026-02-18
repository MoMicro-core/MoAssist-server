'use strict';

module.exports = {
  edit: {
    access: ['host', 'admin'],
    type: 'post',
    handler: async (props) => {
      const { fastify, client, listingId, multiunitId, lang, content } = props;
      const listing = await fastify.mongodb.listings.findOne({
        id: listingId,
      });
      if (!listing) return { message: 'Listing not found' };
      if (
        listing.ownerUid !== client.session.uid &&
        !listing.managers.includes(client.session.uid) &&
        client.session.mode !== 'admin'
      ) {
        return { message: 'No permission', statusCode: 401 };
      }
      if (!listing.multiunit.some((u) => u.id === multiunitId)) {
        return { message: 'Multiunit not found', statusCode: 404 };
      }
      const multiunit = await fastify.mongodb.translationMultiunit.findOne({
        id: multiunitId,
      });
      if (!multiunit) {
        return { message: 'Multiunit not found', statusCode: 404 };
      }
      multiunit.languages = multiunit.languages.map((l) => {
        if (l.name === lang) {
          l.translation = content;
        }
        return l;
      });
      await multiunit.save();
      return { multiunit };
    },
    schema: {
      tags: ['Localization'],
      summary: 'Update multiunit translation',
      description:
        'Updates the translation content for a specific language on a ' +
        'multiunit. Requires host or admin access. Validates ownership ' +
        'and that the multiunit belongs to the specified listing.',
      body: {
        type: 'object',
        required: ['listingId', 'multiunitId', 'lang', 'content', 'token'],
        properties: {
          token: { type: 'string' },
          listingId: { type: 'string' },
          multiunitId: { type: 'string' },
          lang: { type: 'string' },
          content: { type: 'object', additionalProperties: true },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            multiunit: {
              type: 'object',
              additionalProperties: true,
            },
            message: { type: 'string' },
          },
        },
      },
    },
  },

  get: {
    access: ['host', 'admin'],
    type: 'post',
    handler: async (props) => {
      const { fastify, client, listingId, multiunitId } = props;
      const listing = await fastify.mongodb.listings.findOne({
        id: listingId,
      });
      if (!listing) return { message: 'Listing not found' };
      if (
        listing.ownerUid !== client.session.uid &&
        !listing.managers.includes(client.session.uid) &&
        client.session.mode !== 'admin'
      ) {
        return { message: 'No permission', statusCode: 401 };
      }
      if (!listing.multiunit.some((u) => u.id === multiunitId)) {
        return { message: 'Multiunit not found', statusCode: 404 };
      }
      const multiunit = await fastify.mongodb.translationMultiunit.findOne({
        id: multiunitId,
      });
      if (!multiunit) {
        return { message: 'MultiunitTranslation not found', statusCode: 404 };
      }
      return { multiunit };
    },
    schema: {
      tags: ['Localization'],
      summary: 'Retrieve multiunit translations',
      description:
        'Retrieves all available language translations for a specific ' +
        'multiunit within a listing. Requires host or admin access. ' +
        'Validates ownership and multiunit association.',
      body: {
        type: 'object',
        required: ['listingId', 'multiunitId', 'token'],
        properties: {
          token: { type: 'string' },
          listingId: { type: 'string' },
          multiunitId: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            multiunit: {
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
