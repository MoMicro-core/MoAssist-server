'use strict';

module.exports = {
  get: {
    type: 'post',
    access: ['public', 'all', 'unregistered'],
    handler: async (props) => {
      const { fastify, ids = [], client, page = 1, pageSize = 10 } = props;
      const { sortBy, sortType = 'high' } = props;
      const { searchBy = {} } = props;
      const query = [];
      const skip = (page - 1) * pageSize;
      const match = {};
      if (ids.length) {
        match['uid'] = { $in: ids };
        query.push({ $match: { uid: { $in: ids } } });
      }
      if (Object.keys(searchBy).length) {
        for (const { key, value } in Object.entries(searchBy)) {
          if (key === 'uid') match['uid'] = { $regex: value, $options: 'i' };
          else match[key] = value;
        }
      }
      if (Object.keys(match).length) {
        query.push({ $match: match });
      }

      const fields = {
        uid: 1,
        name: 1,
        lastName: 1,
        image: 1,
        email: 1,
        responseRate: 1,
        permissions: 1,
        verified: 1,
        description: {
          $filter: {
            input: '$description',
            as: 'desc',
            cond: {
              $eq: ['$$desc.language', client.session.language || 'english'],
            },
          },
        },
        languagesSpoken: 1,
        type: 1,
        createdAt: 1,
        phoneNumber: 1,
      };
      if (client?.session?.mode === 'admin') {
        fields['balance'] = 1;
        fields['status'] = 1;
        fields['paymentInfo'] = 1;
      }
      query.push({ $project: { ...fields } });
      if (sortBy) {
        const sortDir = sortType === 'high' ? 1 : -1;
        const sortConfig = { [sortBy]: sortDir };
        query.push({ $sort: sortConfig });
      }
      query.push({
        $facet: {
          metadata: [{ $count: 'total' }, { $addFields: { page } }],
          data: [{ $skip: skip }, { $limit: pageSize }],
        },
      });

      const result = await fastify.mongodb.user.aggregate(query);
      const users = result[0].data;
      if (!users) return { message: 'User not found', statusCode: 404 };
      const docCount = await fastify.mongodb.user.countDocuments(match);
      return { users, docCount };
    },
    schema: {
      tags: ['User', 'Admin'],
      summary: 'Retrieve users',
      description:
        'Retrieves user profiles with optional filtering, sorting, and ' +
        'pagination. Admins can view additional fields like balance and ' +
        'payment info. Supports searching by user IDs or custom criteria.',
      body: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'Session token' },
          ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
          page: { type: 'number', minimum: 1 },
          pageSize: { type: 'number', minimum: 1 },
          sortBy: { type: 'string' },
          sortType: { type: 'string', enum: ['high', 'low'] },
          searchBy: {
            type: 'object',
            additionalProperties: true,
            properties: {
              status: { type: 'string' },
              type: { type: 'string' },
            },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            users: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: true,
              },
            },
            docCount: { type: 'number' },
            message: { type: 'string' },
          },
        },
      },
    },
  },
};
