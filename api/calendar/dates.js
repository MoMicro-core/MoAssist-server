'use strict';

function isValidDate(date) {
  return date instanceof Date && !isNaN(date.getTime());
}

module.exports = {
  block: {
    type: 'post',
    access: ['host'],
    handler: async (props) => {
      const { fastify, client, listingId } = props;
      const { dates, unitId = null, count = 0 } = props;
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

      if (listing.form === 'unit') {
        for (const day of dates) {
          const date = unit.notAvailable.find((d) => d.date === day);
          if (date) {
            if (date.bookingId) continue;
            date.bookingId = 'Blocked';
            date.source = 'rstays';
            continue;
          }

          unit.notAvailable.push({
            date: day,
            bookingId: 'Blocked',
            source: 'rstays',
          });
        }
      } else if (listing.form === 'multiunit') {
        if (typeof count !== 'number' || count <= 0) {
          return { message: 'Count must be greater than 0', statusCode: 400 };
        }
        for (const day of dates) {
          const validDate = new Date(day);
          if (!isValidDate(validDate)) continue;

          const date = unit.notAvailable.find((d) => d.date === day);
          if (!date) {
            const unitsToBlock = Array.from({ length: count }, (_, i) => i + 1);
            unit.notAvailable.push({
              date: day,
              units: [
                {
                  numbers: unitsToBlock,
                  bookingId: 'Blocked',
                  source: 'rstays',
                },
              ],
            });
            continue;
          }
          let notAvailableUnits = [];
          for (const u of date.units) {
            notAvailableUnits = notAvailableUnits.concat(u.numbers);
          }
          const availableUnits = unit.units.filter(
            (u) => !notAvailableUnits.includes(u),
          );
          date.units.push({
            numbers: availableUnits.slice(0, count),
            bookingId: 'Blocked',
          });
        }
      }
      await unit.save();
      return { message: 'Dates blocked successfully' };
    },
    schema: {
      tags: ['Listing'],
      summary: 'Block dates for unit',
      description:
        'Mark specific dates as unavailable for bookings. For ' +
        'single-unit listings, blocks the entire unit. For multi-unit ' +
        'listings, specify "count" to block a certain number of rooms. ' +
        'Does not override existing bookings. Host or manager access ' +
        'required.',
      consumes: ['application/json'],
      body: {
        type: 'object',
        properties: {
          dates: { type: 'array', items: { type: 'string', format: 'date' } },
          unitId: { type: 'string' },
          count: { type: 'number' },
          listingId: { type: 'string', description: 'Listing MongoDB id' },
          token: { type: 'string', description: 'Session token' },
        },
        required: ['dates', 'listingId', 'token'],
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

  unblock: {
    type: 'post',
    access: ['host'],
    handler: async (props) => {
      const { fastify, client, listingId } = props;
      const { dates, unitId = null, count = 0 } = props;

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

      if (!unit) return { message: 'Unit not found', statusCode: 404 };

      if (listing.form === 'unit') {
        unit.notAvailable = unit.notAvailable.filter((d) => {
          if (!dates.includes(d.date)) return true;
          return d.bookingId !== 'Blocked';
        });
      } else if (listing.form === 'multiunit') {
        if (typeof count !== 'number' || count <= 0) {
          return { message: 'Count must be greater than 0', statusCode: 400 };
        }

        for (const day of dates) {
          const dateEntry = unit.notAvailable.find((d) => d.date === day);
          if (!dateEntry) continue;

          for (const u of dateEntry.units) {
            if (u.bookingId === 'Blocked') {
              u.numbers.splice(-count);
            }
          }

          dateEntry.units = dateEntry.units.filter((u) => u.numbers.length > 0);
        }

        unit.notAvailable = unit.notAvailable.filter((d) => d.units.length > 0);
      }

      await unit.save();
      return { message: 'Dates unblocked successfully' };
    },
    schema: {
      tags: ['Listing'],
      summary: 'Unblock dates for unit',
      description:
        'Remove manual availability blocks from specific dates, making ' +
        'them available for bookings again. For multi-unit listings, ' +
        'specify "count" to unblock a specific number of rooms. Only ' +
        'removes manually blocked dates, not confirmed bookings. Host ' +
        'or manager access required.',
      consumes: ['application/json'],
      body: {
        type: 'object',
        properties: {
          dates: { type: 'array', items: { type: 'string', format: 'date' } },
          unitId: { type: 'string' },
          count: { type: 'number' },
          listingId: { type: 'string', description: 'Listing MongoDB id' },
          token: { type: 'string', description: 'Session token' },
        },
        required: ['dates', 'listingId', 'token'],
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
