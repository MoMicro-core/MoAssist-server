'use strict';

module.exports = {
  get: {
    type: 'post',
    access: ['admin'],
    handler: async (props) => {
      const { fastify, page = 1, pageSize = 100, ids = [], client } = props;
      console.log(client.session);

      const matchStage = ids.length
        ? { $match: { id: { $in: ids } } }
        : { $match: {} };

      const listings = await fastify.mongodb.listings.aggregate([
        matchStage,
        {
          $lookup: {
            from: 'videos',
            let: { previewVideoUrl: '$previewVideo' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$url', '$$previewVideoUrl'] },
                },
              },
              {
                $project: {
                  _id: 0,
                  subtitles: 1,
                },
              },
            ],
            as: 'videoData',
          },
        },

        {
          $addFields: {
            popularityRaw: {
              $cond: [
                { $gt: [{ $ifNull: ['$views', 0] }, 0] },
                {
                  $divide: [
                    {
                      $add: [
                        { $ifNull: ['$likes', 0] },
                        { $ifNull: ['$shares', 0] },
                      ],
                    },
                    { $ifNull: ['$views', 1] },
                  ],
                },
                0,
              ],
            },
          },
        },

        {
          $addFields: {
            popularityScore: {
              $multiply: [{ $min: ['$popularityRaw', 1] }, 0.3],
            },
          },
        },
        {
          $addFields: {
            totalScore: { $ifNull: ['$popularityScore', 0] },
          },
        },
        { $sort: { totalScore: -1 } },
        { $skip: (page - 1) * pageSize },
        { $limit: pageSize },
      ]);

      if (!listings.length) return { message: 'Listings not found' };

      const localizedFullListings = await fastify.listings.getFull({
        listings,
        lang: client.session?.language,
        currency: client.session?.currency,
      });
      const docCount = await fastify.mongodb.listings.countDocuments(
        matchStage.$match,
      );
      return { listings: localizedFullListings, docCount };
    },
    schema: {
      tags: ['Admin'],
      summary: 'Get all listings (Admin)',
      description:
        'Retrieve all property listings with full details including ' +
        'associated videos, units, and localized content. Results are ' +
        'sorted by popularity score and support pagination. ' +
        'Admin access required.',
      body: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'Session token' },
          ids: { type: 'array', items: { type: 'string' }, default: [] },
          page: {
            type: 'integer',
            minimum: 1,
            default: 1,
            description: 'Page number for pagination',
          },
          pageSize: {
            type: 'integer',
            minimum: 1,
            default: 10,
            description: 'Number of items per page',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            listings: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
            docCount: { type: 'number' },
            message: { type: 'string' },
          },
        },
      },
    },
  },
};
