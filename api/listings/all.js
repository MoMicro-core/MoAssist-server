'use strict';

module.exports = {
  findByIds: {
    type: 'post',
    access: ['public', 'all', 'unregistered'],
    handler: async ({ fastify, ids, client, checkIn, checkOut }) => {
      const listings = await fastify.mongodb.listings
        .find({
          id: { $in: ids },
        })
        .lean();

      const localizedFullListings = await fastify.listings.getFull({
        listings,
        lang: client?.session?.language || 'english',
        currency: client?.session?.currency || 'USD',
        checkIn,
        checkOut,
      });
      return { listings: localizedFullListings };
    },
    schema: {
      tags: ['Listing'],
      summary: 'Get listings by IDs',
      description:
        'Retrieve specific listings by their IDs with full details. ' +
        'Returns localized content (titles, descriptions) based on user ' +
        'language and prices converted to user currency. Optionally ' +
        'check availability for date range.',
      body: {
        type: 'object',
        required: ['ids'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          ids: { type: 'array', items: { type: 'string' } },
          checkIn: {
            type: 'string',
            description: 'Check-in date. Also checkOut is required',
            format: 'date',
          },
          checkOut: {
            type: 'string',
            description: 'Check-out date',
            format: 'date',
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
            message: { type: 'string' },
          },
        },
      },
    },
  },

  get: {
    type: 'post',
    access: ['public', 'guest'],
    handler: async (props) => {
      const { fastify, page = 1, pageSize = 100, ids = [], client } = props;
      console.log(client.session);

      const matchStage = ids.length
        ? { $match: { $and: [{ status: 'active' }, { id: { $in: ids } }] } }
        : { $match: { status: 'active' } };

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

      await fastify.mongodb.listings.updateMany(
        { id: { $in: listings.map((l) => l.id) } },
        { $inc: { views: 1 } },
      );

      const localizedFullListings = await fastify.listings.getFull({
        listings,
        lang: client.session?.language,
        currency: client.session?.currency,
      });
      return { listings: localizedFullListings };
    },
    schema: {
      tags: ['Listing'],
      summary: 'Get all active listings',
      description:
        'Retrieve paginated list of active property listings sorted by ' +
        'popularity score. Includes full details: video subtitles, unit ' +
        'information, localized content, and converted prices. ' +
        'Increments view count for analytics.',
      body: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'Session token' },
          ids: { type: 'array', items: { type: 'string' }, default: [] },
          page: {
            type: 'number',
            minimum: 1,
            default: 1,
            description: 'Page number for pagination',
          },
          pageSize: {
            type: 'number',
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
            message: { type: 'string' },
          },
        },
      },
    },
  },

  getByUser: {
    type: 'post',
    access: ['public', 'guest'],
    handler: async (props) => {
      const { fastify, userUid } = props;
      const listings = await fastify.mongodb.listings.find({
        $or: [{ ownerUid: userUid }, { managers: { $in: [userUid] } }],
      });
      return { listings };
    },
    schema: {
      tags: ['Listing'],
      summary: 'Get listings by user',
      description:
        'Retrieve all listings associated with a specific user. Includes ' +
        'both listings owned by the user and listings where they serve ' +
        'as a manager. Useful for viewing a host profile.',
      body: {
        type: 'object',
        required: ['token', 'id'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          id: { type: 'string', description: 'User ID (id)' },
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
            message: { type: 'string' },
          },
        },
      },
    },
  },
};
