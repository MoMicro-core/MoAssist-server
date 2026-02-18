'use strict';

module.exports = {
  'ics/:listingId/:unitId': {
    type: 'get',
    access: ['public'],
    protocols: ['http'],
    handler: async ({ fastify, request }) => {
      const { listingId, unitId } = request.params;
      const listing = await fastify.mongodb.listings.findOne({ id: listingId });
      if (!listing) return { message: 'Listing not found' };

      let unit;

      if (listing.form === 'multiunit') {
        if (!unitId) return { message: 'Unit ID is required' };
        if (!listing.multiunit.some((u) => u.id === unitId)) {
          return { message: 'Room does not belong to listing' };
        }

        unit = await fastify.mongodb.multiunit.findOne({ id: unitId });
        if (!unit) return { message: 'Room not found' };
      } else {
        unit = await fastify.mongodb.unit.findOne({ id: listing.unit });
        if (!unit) return { message: 'Unit not found' };
      }

      const notAvailable = (unit.notAvailable || [])
        // sort by date ascending
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        // map to simple date strings
        .map((b) => b.date);

      // --- Group consecutive dates ---
      const periods = [];
      let start = null;
      let prev = null;

      for (const dateStr of notAvailable) {
        const date = new Date(dateStr);
        if (!start) {
          start = date;
          prev = date;
          continue;
        }

        // check if current date is consecutive to previous
        const nextDay = new Date(prev);
        nextDay.setDate(prev.getDate() + 1);

        if (date.getTime() === nextDay.getTime()) {
          // consecutive date
          prev = date;
        } else {
          // end of a consecutive block
          periods.push({ start, end: prev });
          start = date;
          prev = date;
        }
      }
      // push last block
      if (start) periods.push({ start, end: prev });

      // --- Build ICS events ---
      const events = periods.map((period, i) => {
        const dtStamp =
          new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        const dtStart = period.start
          .toISOString()
          .split('T')[0]
          .replace(/-/g, '');
        const dtEndDate = new Date(period.end);
        dtEndDate.setDate(dtEndDate.getDate() + 1); // DTEND is next day
        const dtEnd = dtEndDate.toISOString().split('T')[0].replace(/-/g, '');

        const uid = `${unit.id}-${dtStart}-${i}@rstays`;

        return `
BEGIN:VEVENT
DTSTAMP:${dtStamp}
DTSTART;VALUE=DATE:${dtStart}
DTEND;VALUE=DATE:${dtEnd}
SUMMARY:Unavailable
UID:${uid}
END:VEVENT
`.trim();
      });

      const icsData = `
BEGIN:VCALENDAR
PRODID:-//Rstays//Unit Calendar 1.0//EN
CALSCALE:GREGORIAN
VERSION:2.0
${events.join('\n')}
END:VCALENDAR
`.trim();

      const headers = {
        'Content-Type': 'text/calendar',
        'Content-Disposition': `attachment; filename="unit_${unitId}.ics"`,
      };

      return { file: icsData, headers };
    },
    schema: {
      tags: ['Calendar'],
      summary: 'Export calendar as ICS file',
      description:
        'Download unit availability calendar as an ICS file for import ' +
        'into external calendar applications (Google Calendar, iCal, ' +
        'Outlook). Groups consecutive unavailable dates into blocked ' +
        'periods. Public endpoint - no authentication required.',
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

  sync: {
    type: 'post',
    access: ['host', 'admin'],
    handler: async ({ fastify, client, listingId, unitId = null }) => {
      const listing = await fastify.mongodb.listings
        .findOne({ id: listingId })
        .select('multiunit ownerUid unit form');
      if (!listing) return { message: 'Listing not found' };
      if (
        listing.ownerUid !== client.session.uid &&
        client.session.mode !== 'admin'
      ) {
        return { message: 'You are not the owner of this listing' };
      }
      let unit = null;
      if (listing.form === 'multiunit') {
        if (!unitId) return { message: 'Unit ID is required' };
        if (!listing.multiunit.some((u) => u.id === unitId)) {
          return { message: 'Room does not belong to listing' };
        }
        unit = await fastify.mongodb.multiunit.findOne({ id: unitId });
        if (!unit) return { message: 'Room not found' };
        try {
          console.log({ unit });
          await fastify.calendar.syncMultiunit(fastify, unit);
          unit.syncStatus = 'synced';
        } catch (error) {
          console.log(error);
          fastify.logger.log({
            error: 'Sync error in unit' + unit.id,
            errorDesc: error,
          });
          unit.syncStatus = 'error';
          if (client.session.email) {
            await fastify.email.sendMail({
              to: client.session.email,
              subject: 'Sync error',
              text: `Sync error for ${unit.id}`,
            });
          }
        }
      } else {
        unit = await fastify.mongodb.unit.findOne({ id: listing.unit });
        try {
          await fastify.calendar.syncUnit(fastify, unit);
          unit.syncStatus = 'synced';
        } catch (error) {
          unit.syncStatus = 'error';
          fastify.logger.log({
            error: 'Sync error in unit' + unit.id,
            errorDesc: error,
          });
          if (client.session.email) {
            await fastify.email.sendMail({
              to: client.session.email,
              subject: 'Sync error',
              text: `Sync error for ${unit.id}`,
            });
          }
        }
      }
      unit.lastSync = Date.now();
      await unit.save();

      return { message: 'Calendar synced' };
    },
    schema: {
      tags: ['Calendar'],
      summary: 'Sync external calendar',
      description:
        'Synchronize unit availability with external calendar sources ' +
        '(Airbnb, Booking.com, etc.) via iCal URLs. Imports blocked ' +
        'dates from external platforms to prevent double bookings. ' +
        'Sends email notification on sync failure. Host access required.',
      body: {
        type: 'object',
        properties: {
          listingId: { type: 'string', description: 'Listing MongoDB id' },
          unitId: { type: 'string', description: 'Unit MongoDB id' },
          token: { type: 'string', description: 'Session token' },
        },
        required: ['listingId', 'token'],
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
};
