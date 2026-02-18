'use strict';

module.exports = {
  write: {
    type: 'post',
    access: ['host'],
    handler: async (props) => {
      const { fastify, text, dates, listingId, client, unitId = null } = props;
      const listing = await fastify.mongodb.listings.findOne({ id: listingId });
      if (!listing) return { message: 'Listing not found', statusCode: 404 };
      if (
        listing.ownerUid !== client.session.uid &&
        !listing.managers.includes(client.session.uid)
      ) {
        return {
          message: 'You are not the owner of this listing',
          statusCode: 403,
        };
      }

      let unit;

      if (listing.form === 'multiunit') {
        if (!unitId) return { message: 'UnitId is required', statusCode: 404 };
        unit = await fastify.mongodb.multiunit.findOne({ id: unitId });
      } else {
        unit = await fastify.mongodb.unit.findOne({ id: listing.unit });
      }
      for (const date of dates) {
        const existedDate = unit.notAvailable.find((d) => d.date === date);
        if (existedDate) {
          existedDate.notes = text;
        } else {
          unit.notAvailable.push({ date, notes: text });
        }
      }
      await unit.save();
      return { message: 'Note written successfully' };
    },
    schema: {
      tags: ['calendar'],
      summary: 'Add calendar notes',
      description:
        'Add or update notes for specific dates on a unit calendar. ' +
        'Useful for hosts to track maintenance schedules, special ' +
        'events, or reminders. Notes are visible only to the listing ' +
        'owner and managers.',
      consumes: ['application/json'],
      body: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          dates: { type: 'array', items: { type: 'string', format: 'date' } },
          unitId: { type: 'string' },
          listingId: { type: 'string', description: 'Listing MongoDB id' },
          token: { type: 'string', description: 'Session token' },
        },
        required: ['dates', 'listingId', 'token', 'text'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            listing: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
  },
};
