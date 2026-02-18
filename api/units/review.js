'use strict';

module.exports = {
  write: {
    type: 'post',
    access: ['guest'],
    handler: async ({ fastify, client, review, bookingId }) => {
      if (!bookingId) return { message: 'Booking ID is required' };
      const booking = await fastify.mongodb.bookings.findOne({
        id: bookingId,
        user: client.session.uid,
      });
      if (!booking) {
        return { message: 'Booking not found or not yours', statusCode: 404 };
      }
      const dateNow = new Date();
      const checkOutDate = new Date(booking.checkOut);
      if (dateNow < checkOutDate) {
        return {
          message: 'You can only write a review after check-out',
          statusCode: 400,
        };
      }
      const unitsIds = booking.units.map((u) => u.id);
      let units;
      if (booking.type === 'unit') {
        units = await fastify.mongodb.unit.find({ id: { $in: unitsIds } });
      } else if (booking.type === 'multiunit') {
        units = await fastify.mongodb.multiunit.find({ id: { $in: unitsIds } });
      }
      const notWritenFor = [];
      for (const unit of units) {
        console.log(unit);
        if (unit.reviews.some((r) => r.authorUid === client.session.uid)) {
          notWritenFor.push(unit.id);
          continue;
        }
        unit.reviews.push({
          stars: review.rating,
          text: review.text,
          date: new Date().toISOString(),
          authorUid: client.session.uid,
          author: client.session.name,
        });
        await unit.save();
      }
      return { message: 'Review written successfully', notWritenFor };
    },
    schema: {
      tags: ['Review'],
      summary: 'Submit guest review',
      description:
        'Submits a review for booked units after checkout. Requires ' +
        'guest access and a completed booking. Reviews can only be ' +
        'written after the checkout date. If multiple units were booked, ' +
        'the review is applied to all units. Prevents duplicate reviews ' +
        'from the same user.',
      consumes: ['application/json'],
      body: {
        type: 'object',
        required: ['token', 'review', 'bookingId'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          bookingId: {
            type: 'string',
            description: 'Booking id of your booking by that unit',
          },
          review: {
            type: 'object',
            properties: {
              rating: {
                type: 'number',
                description: 'start from 0 to 5',
                minimum: 0,
                maximum: 5,
              },
              text: { type: 'string', description: 'Review text' },
            },
            required: ['rating', 'text'],
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            notWritenFor: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  },
  reply: {
    type: 'post',
    access: ['host'],
    handler: async (props) => {
      const { fastify, client, reply, reviewId, listingId, unitId } = props;
      const listing = await fastify.mongodb.listings.findOne({ id: listingId });
      let unit;
      if (listing.form === 'unit') {
        unit = await fastify.mongodb.unit.findOne({ id: listing.unit });
      } else {
        if (!unitId) return { message: 'Unit ID is required', statusCode: 400 };
        unit = await fastify.mongodb.multiunit.findOne({ id: unitId });
      }
      const review = unit.reviews.find((r) => r.id === reviewId);

      if (!review) {
        throw new Error('Review not found');
      }

      review.replies.push({
        text: reply.text,
        date: new Date().toISOString(),
        authorUid: client.session.uid,
      });

      await unit.save();
      return { message: 'Review written successfully', reviews: unit.reviews };
    },
    schema: {
      tags: ['Review'],
      summary: 'Reply to guest review',
      description:
        'Allows hosts to respond to guest reviews on their units. ' +
        'Requires host access. For multiunit listings, unitId must be ' +
        'provided. Multiple replies can be added to a single review.',
      consumes: ['application/json'],
      body: {
        type: 'object',
        required: ['token', 'reply', 'reviewId', 'listingId'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          reviewId: { type: 'string', description: 'Review id' },
          listingId: { type: 'string', description: 'Listing id' },
          unitId: { type: 'string', description: 'Unit id' },
          reply: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Reply text' },
            },
            required: ['text'],
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            reviews: { type: 'array', items: { type: 'object' } },
          },
        },
      },
    },
  },
};
