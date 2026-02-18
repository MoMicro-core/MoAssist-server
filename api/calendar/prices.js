'use strict';

module.exports = {
  adjust: {
    type: 'post',
    access: ['host'],
    handler: async (props) => {
      const { fastify, client, listingId, dates = [] } = props;
      const { rate, currency, unitId = null } = props;
      if (!dates.length) {
        return { message: 'Dates are required', statusCode: 404 };
      }

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
          existedDate.price = { rate, currency };
        } else {
          unit.notAvailable.push({ date, price: { rate, currency } });
        }
      }
      await unit.save();
      return { message: 'Success', statusCode: 200 };
    },
    schema: {
      tags: ['Calendar'],
      summary: 'Set custom date prices',
      description:
        'Override the default nightly rate for specific dates. Useful ' +
        'for setting higher prices during peak seasons, holidays, or ' +
        'special events. The custom rate applies to all bookings that ' +
        'include these dates. Host or manager access required.',
      body: {
        type: 'object',
        required: ['token', 'listingId', 'dates', 'rate', 'currency'],
        properties: {
          token: { type: 'string' },
          listingId: { type: 'string' },
          dates: { type: 'array', items: { type: 'string' } },
          rate: { type: 'number' },
          currency: { type: 'string' },
          unitId: { type: 'string' },
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

  reset: {
    type: 'post',
    access: ['host'],
    handler: async (props) => {
      const { fastify, listingId, client, dates = [], unitId = null } = props;
      if (!dates.length) {
        return { message: 'Dates are required', statusCode: 404 };
      }
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
          existedDate.price = null;
        }
      }
      await unit.save();
      return { message: 'Success', statusCode: 200 };
    },
    schema: {
      tags: ['Calendar'],
      summary: 'Reset date prices to default',
      description:
        'Remove custom price overrides for specific dates, reverting ' +
        'them to the unit default nightly rate. Useful for undoing ' +
        'seasonal pricing after peak periods end. Host or manager ' +
        'access required.',
      body: {
        type: 'object',
        required: ['token', 'listingId', 'dates'],
        properties: {
          token: { type: 'string' },
          listingId: { type: 'string' },
          dates: { type: 'array', items: { type: 'string' } },
          unitId: { type: 'string' },
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
