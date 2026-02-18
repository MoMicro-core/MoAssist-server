'use strict';

function isValidDate(date) {
  return date instanceof Date && !isNaN(date.getTime());
}

module.exports = {
  // byListing: {
  //   type: 'post',
  //   access: ['host'],
  //   handler: async ({ fastify, listingId, client }) => {
  //     const listing = await fastify.mongodb.listings.findOne({
  //       id: listingId,
  //     });
  //     if (
  //       listing.ownerUid !== client.session.uid &&
  //       !listing.managers.includes(client.session.uid)
  //     ) {
  //       return {
  //         message: 'You are not the owner of this listing',
  //         statusCode: 403,
  //       };
  //     }
  //     const bookings = await fastify.mongodb.bookings.find({
  //       listing: listingId,
  //     });
  //     return { bookings };
  //   },
  //   schema: {
  //     tags: ['Booking'],
  //     summary: 'Get a user by their UID',
  //     description: 'Get a user by their UID',
  //     body: {
  //       type: 'object',
  //       required: ['token', 'listingId'],
  //       properties: {
  //         token: { type: 'string', description: 'Session token' },
  //         listingId: { type: 'string', description: 'Listing MongoDB id' },
  //       },
  //     },
  //     response: {
  //       200: {
  //         type: 'object',
  //         properties: {
  //           bookings: {
  //             type: 'array',
  //             items: { type: 'object', additionalProperties: true },
  //           },
  //           message: { type: 'string' },
  //         },
  //       },
  //     },
  //   },
  // },
  all: {
    type: 'post',
    access: ['host'],
    handler: async (props) => {
      const { fastify, client, page = 1, size = 10, checkIn, checkOut } = props;
      const inDate = new Date(checkIn);
      const outDate = new Date(checkOut);
      if (!isValidDate(inDate) || !isValidDate(outDate)) {
        return { message: 'Invalid date', statusCode: 400 };
      }
      const listings = await fastify.mongodb.listings.find({
        ownerUid: client.session.uid,
      });
      const listingIds = listings.map((listing) => listing.id);
      const query = { listing: { $in: listingIds } };
      if (outDate <= inDate) {
        query.checkIn = { $gte: inDate, $lt: outDate };
        query.checkOut = { $gt: inDate, $lte: outDate };
      }
      const bookings = await fastify.mongodb.bookings
        .find(query)
        .skip((page - 1) * size)
        .limit(size);
      return { bookings };
    },
    schema: {
      tags: ['Booking'],
      summary: 'Search bookings by date range',
      description:
        'Retrieve all bookings across all your listings within a ' +
        'specified date range. Supports pagination. Useful for hosts to ' +
        'view upcoming reservations and manage availability across ' +
        'multiple properties.',
      body: {
        type: 'object',
        required: ['token', 'checkIn', 'checkOut'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          page: { type: 'number', description: 'Page number', default: 1 },
          size: { type: 'number', description: 'Page size', default: 10 },
          checkIn: {
            type: 'string',
            format: 'date',
            description: 'Check-in date (YYYY-MM-DD)',
          },
          checkOut: {
            type: 'string',
            format: 'date',
            description: 'Check-out date (YYYY-MM-DD)',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            bookings: {
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
