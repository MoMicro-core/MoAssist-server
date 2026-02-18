'use strict';

module.exports = {
  add: {
    access: ['host'],
    type: 'post',
    handler: async ({ fastify, listingId, songId, start, end }) => {
      const listing = await fastify.mongodb.listing.findOne({ id: listingId });
      if (!listing) return { message: 'Listing not found', statusCode: 404 };
      if (
        listing.ownerUid !== fastify.session.uid ||
        !listing.managers.includes(fastify.session.uid)
      ) {
        return {
          message: 'You are not the owner of this listing',
          statusCode: 403,
        };
      }
      if (!listing.previewVideo) return { message: 'Preview video not found' };
      const video = await fastify.mongodb.videos.findOne({
        url: listing.previewVideo,
      });
      if (!video) return { message: 'Video not found', statusCode: 404 };
      video.music.push({ songId, start, end });
      await video.save();
      return { video };
    },
    schema: {
      tags: ['Video'],
      summary: 'Add music to video',
      description:
        'Adds a music track to a listing\'s preview video with specified ' +
        'start and end times. Requires host access. User must be the ' +
        'listing owner or a manager. The listing must have an existing ' +
        'preview video.',
      body: {
        type: 'object',
        required: ['token', 'listingId', 'songId', 'start', 'end'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          listingId: { type: 'string', description: 'Listing ID' },
          songId: { type: 'string', description: 'Song ID' },
          start: { type: 'number', description: 'Start time' },
          end: { type: 'number', description: 'End time' },
        },
      },
    },
  },
  remove: {
    access: ['host'],
    type: 'delete',
    handler: async ({ fastify, listingId, songId }) => {
      const listing = await fastify.mongodb.listing.findOne({ id: listingId });
      if (!listing) return { message: 'Listing not found', statusCode: 404 };
      if (
        listing.ownerUid !== fastify.session.uid ||
        !listing.managers.includes(fastify.session.uid)
      ) {
        return {
          message: 'You are not the owner of this listing',
          statusCode: 403,
        };
      }
      const video = await fastify.mongodb.videos.findOne({
        url: listing.previewVideo,
      });
      if (!video) return { message: 'Video not found', statusCode: 404 };
      video.music = video.music.filter((m) => m.songId !== songId);
      await video.save();
      return { video };
    },
    schema: {
      tags: ['Video'],
      summary: 'Remove music from video',
      description:
        'Removes a music track from a listing\'s preview video by song ' +
        'ID. Requires host access. User must be the listing owner or ' +
        'a manager.',
      body: {
        type: 'object',
        required: ['token', 'listingId', 'songId'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          listingId: { type: 'string', description: 'Listing ID' },
          songId: { type: 'string', description: 'Song ID' },
        },
      },
    },
  },
};
