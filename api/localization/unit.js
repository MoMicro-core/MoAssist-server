'use strict';

module.exports = {
  edit: {
    access: ['host', 'admin'],
    type: 'post',
    handler: async (props) => {
      const { fastify, client, listingId, lang, content } = props;
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
      const unit = await fastify.mongodb.translationUnit.findOne({
        id: listing.unit,
      });
      if (!unit) {
        return { message: 'Multiunit not found', statusCode: 404 };
      }
      unit.languages = unit.languages.map((l) => {
        if (l.name === lang) {
          l.translation = content;
        }
        return l;
      });
      await unit.save();
      return { unit };
    },
    schema: {
      tags: ['Localization'],
      summary: 'Update unit translation',
      description:
        'Updates the translation content for a specific language on a ' +
        'unit. Requires host or admin access. Only the listing owner or ' +
        'managers can modify translations.',
      body: {
        type: 'object',
        required: ['listingId', 'lang', 'content', 'token'],
        properties: {
          token: { type: 'string' },
          listingId: { type: 'string' },
          lang: { type: 'string' },
          content: { type: 'object', additionalProperties: true },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            unit: {
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
      const { fastify, client, listingId } = props;
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
      const unit = await fastify.mongodb.translationUnit.findOne({
        id: listing.unit,
      });
      if (!unit) {
        return { message: 'UnitTranslation not found', statusCode: 404 };
      }
      return { unit };
    },
    schema: {
      tags: ['Localization'],
      summary: 'Retrieve unit translations',
      description:
        'Retrieves all available language translations for a unit ' +
        'associated with a listing. Requires host or admin access. ' +
        'Validates ownership before returning translation data.',
      body: {
        type: 'object',
        required: ['listingId', 'token'],
        properties: {
          token: { type: 'string' },
          listingId: { type: 'string' },
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
