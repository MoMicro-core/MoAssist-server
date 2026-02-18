'use strict';

module.exports = {
  getByUrls: {
    type: 'post',
    access: ['public'],
    handler: async ({ fastify, urls }) => {
      const videos = await fastify.mongodb.videos.find({ url: { $in: urls } });
      if (!videos) return { message: 'Videos not found', statusCode: 404 };
      return { videos };
    },
    schema: {
      tags: ['Video'],
      summary: 'Get videos by URLs',
      description:
        'Retrieves video metadata for multiple videos by their URLs. ' +
        'Returns video objects including music, subtitles, and ' +
        'engagement statistics. Public access endpoint.',
      body: {
        type: 'object',
        required: ['token', 'urls'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          urls: { type: 'array', items: { type: 'string' } },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            videos: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
    },
  },

  // like: {
  //   type: 'post',
  //   access: ['guest', 'unregistered'],
  //   handler: async ({ fastify, client, url }) => {
  //     const video = await fastify.mongodb.videos.findOne({
  //       url,
  //     });
  //     if (!video) return { message: 'Video not found', statusCode: 404 };
  //     video.likesCount += 1;
  //     await fastify.mongodb.user.updateOne(
  //       { uid: client.session.uid },
  //       { $addToSet: { likedVideos: video.id } },
  //     );
  //     const today = video.likesByDay.find(
  //       (day) => day.date === new Date().toDateString(),
  //     );
  //     if (today) {
  //       today.count += 1;
  //     } else {
  //       video.likesByDay.push({ date: new Date().toDateString(), count: 1 });
  //     }
  //     await video.save();
  //     return { video };
  //   },
  //   schema: {
  //     tags: ['Video'],
  //     summary: 'Like a video',
  //     description: 'Like a video',
  //     body: {
  //       type: 'object',
  //       required: ['token', 'url'],
  //       properties: {
  //         token: { type: 'string', description: 'Session token' },
  //         url: { type: 'string', description: 'Video url' },
  //       },
  //     },
  //   },
  // },
  // dislike: {
  //   type: 'post',
  //   access: ['guest', 'unregistered'],
  //   handler: async ({ fastify, client, url }) => {
  //     const video = await fastify.mongodb.videos.findOne({
  //       url,
  //     });
  //     if (!video) return { message: 'Video not found', statusCode: 404 };
  //     video.likesCount -= 1;
  //     await fastify.mongodb.user.updateOne(
  //       { uid: client.session.uid },
  //       { $pull: { likedVideos: video.id } },
  //     );
  //     await video.save();
  //     return { video };
  //   },
  //   schema: {
  //     tags: ['Video'],
  //     summary: 'Dislike a video',
  //     description: 'Dislike a video',
  //     body: {
  //       type: 'object',
  //       required: ['token', 'url'],
  //       properties: {
  //         token: { type: 'string', description: 'Session token' },
  //         url: { type: 'string', description: 'Video url' },
  //       },
  //     },
  //   },
  // },

  share: {
    type: 'post',
    access: ['guest', 'unregistered'],
    handler: async ({ fastify, url }) => {
      await fastify.mongodb.listings.updateOne(
        { previewVideo: url },
        { $inc: { shares: 1 } },
      );
      return { message: 'done' };
    },
    schema: {
      tags: ['Video'],
      summary: 'Record video share',
      description:
        'Increments the share counter for a listing\'s preview video. ' +
        'Used to track social sharing engagement. Requires guest or ' +
        'unregistered user access.',
      consumes: ['application/json'],
      body: {
        type: 'object',
        required: ['token', 'url'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          url: { type: 'string', description: 'Video url' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            video: { type: 'object', additionalProperties: true },
            message: { type: 'string' },
          },
        },
      },
    },
  },
};
