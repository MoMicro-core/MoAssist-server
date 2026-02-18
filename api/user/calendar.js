'use strict';

module.exports = {
  upload: {
    // upload my calendar as .ics
    type: 'post',
    access: ['all', 'admin'],
    protocols: ['http'],
    handler: async ({ fastify, client, files }) => {
      if (Array.isArray(files)) return { message: 'Only one file is allowed' };
      const { _buf: fileBuffer, mimetype } = files;
      if (mimetype !== 'text/calendar') return { message: 'Invalid file type' };
      const ics = fileBuffer.toString('utf-8');
      const json = fastify.calendar.toJSON(ics);
      const calendarData = JSON.parse(json);
      const calendar = await fastify.mongodb.calendars.findOne({
        owner: client.session.uid,
      });
      if (!calendar) return { message: 'Calendar not found' };

      calendarData['VCALENDAR'].forEach((event) => {
        if (event['VEVENT']) calendar.data['VEVENT'].push(...event['VEVENT']);
      });
      await calendar.save();
      return { message: 'Calendar uploaded', calendar };
    },
    schema: {
      tags: ['User'],
      summary: 'Import calendar file',
      description:
        'Uploads and imports events from an .ics calendar file into ' +
        'the user\'s calendar. Merges imported events with existing ' +
        'calendar data. Accepts text/calendar MIME type only.' +
        '\n\nFields (multipart/form-data):' +
        '\n- required: token, files (single .ics file)',

      consumes: ['multipart/form-data'],
      response: {
        200: {
          type: 'object',
          properties: {
            calendar: { type: 'object', additionalProperties: true },
            message: {
              type: 'string',
              example: 'Calendar uploaded',
            },
          },
        },
      },
    },
  },

  getIcs: {
    // get my calendar as .ics
    type: 'post',
    access: ['all', 'admin'],
    protocols: ['http'],
    handler: async ({ fastify, client }) => {
      const calendar = await fastify.mongodb.calendars.findOne({
        owner: client.session.uid,
      });
      // const icsData = `
      // "VCALENDAR": {
      //   "VTIMEZONE": ${JSON.stringify(calendar.data.VTIMEZONE)},
      //   "VEVENT": ${JSON.stringify(calendar.data.VEVENT)}
      // }
      // `;
      const icsData = {
        VCALENDAR: [
          {
            VTIMEZONE: [calendar.data.VTIMEZONE],
            VEVENT: calendar.data.VEVENT,
          },
        ],
      };
      const prettyJson = JSON.stringify(icsData, null, 2);
      console.log(prettyJson);
      const ics = fastify.calendar.toICS(prettyJson);
      const headers = {
        'Content-Type': 'text/calendar',
        'Content-Disposition': 'attachment; filename="event.ics"',
      };
      return { file: ics, headers };
    },
    schema: {
      tags: ['User'],
      summary: 'Export calendar file',
      description:
        'Downloads the user\'s calendar as a standard .ics file. ' +
        'Compatible with major calendar applications like Google ' +
        'Calendar, Outlook, and Apple Calendar.',
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', description: 'Session token' },
        },
      },
      response: {
        200: {
          description: 'ICS calendar file',
          type: 'string',
          content: {
            'text/calendar': {
              schema: {
                type: 'string',
                format: 'binary',
              },
            },
          },
        },
      },
    },
  },
};
