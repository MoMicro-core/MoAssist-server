'use strict';

module.exports = {
  createForm: {
    type: 'post',
    access: ['all'],
    handler: async ({ fastify, client, files, ...restSupportData }) => {
      const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
      ];

      const urls = [];
      if (files) {
        const fileArray = Array.isArray(files) ? files : [files];

        for (const file of fileArray) {
	    console.log(typeof file);
          const { _buf: fileBuffer, filename, mimetype } = file;
          if (!allowedTypes.includes(mimetype)) continue;

          const url = await fastify.doSpaces.uploadToSpaces({
            fileStream: fileBuffer,
            filename,
            folder: 'support',
            mimetype: file.mimetype,
            contentLength: fileBuffer.length,
          });
          urls.push(url);
        }
      }
	    console.log(Object.keys(restSupportData));
      const form = await fastify.mongodb.support.create({
        ...restSupportData,
        attachments: urls,
        userId: client.session.uid,
      });
      return form;
    },
    schema: {
      tags: ['Support'],
      summary: 'Submit support request',
      description:
        'Creates a new support ticket with optional file attachments. ' +
        'Accepts multipart/form-data with required fields: name, email, ' +
        'message, topic, and subject. Supports multiple image ' +
        'attachments (JPEG, PNG, WebP, GIF). Requires authenticated ' +
        'user access.' +
        '\n\nFields (multipart/form-data):' +
        '\n- required: token, name, email, subject, topic, message' +
        '\n- optional: bookingId, listingId, files (image attachment(s))',
      consumes: ['multipart/form-data'],
      response: {
        200: {
          type: 'object',
          properties: {
            form: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
  },
};
