'use strict';

const loadFullUserInfo = (fastify) => async (forms, lang) => {
  const usersIds = forms.map((r) => r?.userId || '');
  const users = await fastify.mongodb.user
    .find({ uid: { $in: usersIds } })
    .lean();
  const bookings = await fastify.mongodb.bookings
    .find({
      user: { $in: usersIds },
    })
    .lean();

  const localizedPricesBookings =
    await fastify.localization.translateBookingPrices(bookings, lang);

  for (const form of forms) {
    const user = users.find((u) => u.uid === form.userId);
    form.userInfo = user;
    form.bookings = localizedPricesBookings.filter(
      (b) => b.user === form.userId,
    );
  }
  return forms;
};

module.exports = {
  get: {
    type: 'post',
    access: ['admin'],
    handler: async ({ fastify, client, page = 1, size = 10, ids = [] }) => {
      const query = ids.length ? { id: { $in: ids } } : {};
      const forms = await fastify.mongodb.support
        .find(query)
        .skip((page - 1) * size)
        .limit(size)
        .lean();
      const fullForms = await loadFullUserInfo(fastify)(
        forms,
        client.session.language,
      );
      const docCount = await fastify.mongodb.support.countDocuments(query);
      return { forms: fullForms, docCount };
    },
    schema: {
      tags: ['Support'],
      summary: 'Get support tickets',
      description:
        'Retrieve customer support tickets with pagination. Includes full ' +
        'user information, associated bookings with localized prices. ' +
        'Optionally filter by specific ticket IDs. Admin access required.',
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          page: {
            type: 'number',
            description: 'Page number',
            minimum: 1,
          },
          size: {
            type: 'number',
            description: 'Page size',
            minimum: 1,
          },
          ids: {
            type: 'array',
            description: 'Form ids',
            items: { type: 'string' },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            forms: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
            docCount: { type: 'number' },
          },
        },
      },
    },
  },
  getUnread: {
    type: 'post',
    access: ['admin'],
    handler: async ({ fastify, page = 1, size = 10 }) => {
      const forms = await fastify.mongodb.support
        .find({ read: false })
        .skip((page - 1) * size)
        .limit(size);
      return { forms };
    },
    schema: {
      tags: ['Support'],
      summary: 'Get unread support tickets',
      description:
        'Retrieve only support tickets that have not been marked as read ' +
        'yet. Supports pagination. Use this to prioritize new customer ' +
        'inquiries. Admin access required.',
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', description: 'Session token' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            forms: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
    },
  },

  countUnread: {
    type: 'post',
    access: ['admin'],
    handler: async ({ fastify }) => {
      const count = await fastify.mongodb.support.countDocuments({
        read: false,
      });
      return { count };
    },
    schema: {
      tags: ['Support'],
      summary: 'Count unread support tickets',
      description:
        'Get the total count of unread support tickets. Useful for ' +
        'displaying notification badges or monitoring support queue size. ' +
        'Admin access required.',
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', description: 'Session token' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            count: { type: 'number' },
          },
        },
      },
    },
  },

  answer: {
    type: 'post',
    access: ['admin'],
    handler: async ({ fastify, id, answer }) => {
      await fastify.mongodb.support.updateOne({ id }, { $set: { answer } });
      return { message: 'success' };
    },
    schema: {
      tags: ['Support'],
      summary: 'Answer support ticket',
      description:
        'Provide a response to a customer support ticket. The answer is ' +
        'stored and can be sent to the customer via email or displayed ' +
        'in their account. Admin access required.',
      body: {
        type: 'object',
        required: ['token', 'id', 'answer'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          id: { type: 'string', description: 'Form id' },
          answer: { type: 'string', description: 'Answer' },
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

  changeStatus: {
    type: 'post',
    access: ['admin'],
    handler: async ({ fastify, id, status }) => {
      const support = await fastify.mongodb.support.findOneAndUpdate(
        { id },
        { $set: { status } },
      );
      return { support };
    },
    schema: {
      tags: ['Admin'],
      summary: 'Change support ticket status',
      description:
        'Update the processing status of a support ticket (e.g., open, ' +
        'in_progress, resolved, closed). Used for tracking support ' +
        'workflow and ticket lifecycle. Admin access required.',
      body: {
        type: 'object',
        required: ['token', 'id', 'status'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          id: { type: 'string' },
          status: { type: 'string', description: 'Status' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            report: { type: 'object', additionalProperties: true },
            message: { type: 'string' },
          },
        },
      },
    },
  },
};
