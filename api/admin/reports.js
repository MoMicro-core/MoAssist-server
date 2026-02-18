'use strict';

const loadFullReport = (fastify) => async (reports, lang) => {
  const usersIds = reports.map((r) => r.userId);
  const users = await fastify.mongodb.user.find({ id: { $in: usersIds } });
  const bookings = await fastify.mongodb.bookings
    .find({
      user: { $in: usersIds },
    })
    .lean();

  const localizedPricesBookings =
    await fastify.localization.translateBookingPrices(bookings, lang);

  for (const report of reports) {
    const user = users.find((u) => u.uid === report.userId);
    report.userInfo = user;
    report.bookings = localizedPricesBookings.filter(
      (b) => b.user === report.userId,
    );
  }
  return reports;
};

module.exports = {
  get: {
    type: 'post',
    access: ['admin'],
    handler: async ({ client, fastify, page = 1, size = 10 }) => {
      const reports = await fastify.mongodb.reports
        .find()
        .skip((page - 1) * size)
        .limit(size);
      const fullReports = await loadFullReport(fastify)(
        reports,
        client.session.language,
      );
      const docCount = await fastify.mongodb.reports.countDocuments();
      return { reports: fullReports, docCount };
    },
    schema: {
      tags: ['Admin'],
      summary: 'Get all paginated reports',
      description:
        'Retrieve all user reports with pagination. Includes full user ' +
        'information, associated bookings with localized prices. Used for ' +
        'reviewing user-submitted issues and complaints. ' +
        'Admin access required.',
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          page: { type: 'number', description: 'Page number', minimum: 1 },
          size: { type: 'number', description: 'Page size', minimum: 1 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            reports: {
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

  getUnread: {
    type: 'post',
    access: ['admin'],
    handler: async ({ fastify, page = 1, size = 10 }) => {
      const reports = await fastify.mongodb.reports
        .find({ read: false })
        .skip((page - 1) * size)
        .limit(size);
      return { reports };
    },
    schema: {
      tags: ['Admin'],
      summary: 'Get unread reports',
      description:
        'Retrieve only reports that have not been marked as read yet. ' +
        'Supports pagination for efficient review of new reports. ' +
        'Admin access required.',
      body: {
        type: 'object',
        required: ['token', 'id'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          id: { type: 'string', description: 'Listing ID (id)' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            reports: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
            message: { type: 'string' },
          },
        },
      },
    },
  },

  getByListing: {
    type: 'post',
    access: ['admin'],
    handler: async ({ fastify, listingId }) => {
      const reports = await fastify.mongodb.reports.find({ listingId });
      const fullReports = await loadFullReport(fastify)(
        reports,
        fastify.session.language,
      );
      return { reports: fullReports };
    },
    schema: {
      tags: ['Admin'],
      summary: 'Get reports by listing',
      description:
        'Retrieve all reports associated with a specific property listing. ' +
        'Includes full user information and booking history for context. ' +
        'Useful for investigating listing-specific issues. ' +
        'Admin access required.',
      body: {
        type: 'object',
        required: ['token', 'id'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          id: { type: 'string', description: 'Listing ID (id)' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            reports: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
            message: { type: 'string' },
          },
        },
      },
    },
  },

  setRead: {
    type: 'post',
    access: ['admin'],
    handler: async ({ fastify, ids }) => {
      const report = await fastify.mongodb.reports.findOneAndUpdate(
        { id: { $in: ids } },
        { $set: { read: true } },
      );
      return { report };
    },
    schema: {
      tags: ['Admin'],
      summary: 'Mark reports as read',
      description:
        'Mark one or more reports as read by setting their read status to ' +
        'true. Accepts an array of report IDs for batch processing. ' +
        'Admin access required.',
      body: {
        type: 'object',
        required: ['token', 'ids'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          ids: { type: 'array', items: { type: 'string' } },
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

  answer: {
    type: 'post',
    access: ['admin'],
    handler: async ({ fastify, id, answer }) => {
      const report = await fastify.mongodb.reports.findOneAndUpdate(
        { id },
        { $set: { answer, isAnswered: true } },
      );
      return { report };
    },
    schema: {
      tags: ['Admin'],
      summary: 'Answer a report',
      description:
        'Provide an official response to a user report. The answer is ' +
        'saved and the report is marked as answered. Used for ' +
        'communicating resolution or follow-up to users. ' +
        'Admin access required.',
      body: {
        type: 'object',
        required: ['token', 'id', 'answer'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          id: { type: 'string', description: 'Listing ID (id)' },
          answer: { type: 'string', description: 'Answer' },
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

  changeStatus: {
    type: 'post',
    access: ['admin'],
    handler: async ({ fastify, id, status }) => {
      const report = await fastify.mongodb.reports.findOneAndUpdate(
        { id },
        { $set: { status } },
      );
      return { report };
    },
    schema: {
      tags: ['Admin'],
      summary: 'Change report status',
      description:
        'Update the processing status of a report (e.g., pending, ' +
        'investigating, resolved, closed). Used for tracking report ' +
        'resolution workflow. Admin access required.',
      body: {
        type: 'object',
        required: ['token', 'id', 'status'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          id: { type: 'string', description: 'Listing ID (id)' },
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
