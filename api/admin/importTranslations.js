'use strict';

module.exports = {
  units: {
    type: 'post',
    access: ['admin'],
    protocols: ['http'],
    handler: async ({ fastify, files }) => {
      if (Array.isArray(files)) return { message: 'Only one file is allowed' };
      const allowedTypes = ['application/json'];
      if (!allowedTypes.includes(files.mimetype)) {
        return { message: 'Invalid file type', statusCode: 400 };
      }

      const { _buf: fileBuffer } = files;
      const jsonString = fileBuffer.toString('utf-8');

      let dataArray;
      try {
        dataArray = JSON.parse(jsonString);

        if (!Array.isArray(dataArray)) {
          return { message: 'Invalid JSON: must be an array', statusCode: 400 };
        }
      } catch (err) {
        return {
          message: 'Failed to parse JSON',
          error: err.message,
          statusCode: 400,
        };
      }
      try {
        for (const rawDoc of dataArray) {
          // eslint-disable-next-line new-cap
          const doc = new fastify.mongodb.translationUnit(rawDoc);
          await doc.validate();
        }
      } catch (err) {
        return {
          message: 'Validation failed',
          error: err.message,
          statusCode: 400,
        };
      }

      await fastify.mongodb.translationUnit.deleteMany({});
      await fastify.mongodb.translationUnit.insertMany(dataArray);
      return { message: 'Units updated' };
    },
    schema: {
      tags: ['Admin'],
      summary: 'Import unit translations',
      description:
        'Upload a JSON file to replace all unit translations. The file ' +
        'must contain a valid JSON array of translation objects. Existing ' +
        'translations will be deleted and replaced. Use multipart/form-data ' +
        'with the JSON file in the "files" key. Admin access required.' +
        '\n\nFields (multipart/form-data):' +
        '\n- required: token, files (single JSON file)',
      consumes: ['multipart/form-data'],
    },
  },
  listings: {
    type: 'post',
    access: ['admin'],
    protocols: ['http'],
    handler: async ({ fastify, files }) => {
      if (Array.isArray(files)) return { message: 'Only one file is allowed' };
      const allowedTypes = ['application/json'];
      if (!allowedTypes.includes(files.mimetype)) {
        return { message: 'Invalid file type', statusCode: 400 };
      }

      const { _buf: fileBuffer } = files;
      const jsonString = fileBuffer.toString('utf-8');

      let dataArray;
      try {
        dataArray = JSON.parse(jsonString);

        if (!Array.isArray(dataArray)) {
          return { message: 'Invalid JSON: must be an array', statusCode: 400 };
        }
      } catch (err) {
        return {
          message: 'Failed to parse JSON',
          error: err.message,
          statusCode: 400,
        };
      }
      try {
        for (const rawDoc of dataArray) {
          // eslint-disable-next-line new-cap
          const doc = new fastify.mongodb.translationListing(rawDoc);
          await doc.validate();
        }
      } catch (err) {
        return {
          message: 'Validation failed',
          error: err.message,
          statusCode: 400,
        };
      }

      await fastify.mongodb.translationListing.deleteMany({});
      await fastify.mongodb.translationListing.insertMany(dataArray);
      return { message: 'Units updated' };
    },
    schema: {
      tags: ['Admin'],
      summary: 'Import listing translations',
      description:
        'Upload a JSON file to replace all listing translations. The file ' +
        'must contain a valid JSON array of translation objects. Existing ' +
        'translations will be deleted and replaced. Use multipart/form-data ' +
        'with the JSON file in the "files" key. Admin access required.' +
        '\n\nFields (multipart/form-data):' +
        '\n- required: token, files (single JSON file)',
      consumes: ['multipart/form-data'],
    },
  },
  multiunit: {
    type: 'post',
    access: ['admin'],
    protocols: ['http'],
    handler: async ({ fastify, files }) => {
      if (Array.isArray(files)) return { message: 'Only one file is allowed' };
      const allowedTypes = ['application/json'];
      if (!allowedTypes.includes(files.mimetype)) {
        return { message: 'Invalid file type', statusCode: 400 };
      }

      const { _buf: fileBuffer } = files;
      const jsonString = fileBuffer.toString('utf-8');

      let dataArray;
      try {
        dataArray = JSON.parse(jsonString);

        if (!Array.isArray(dataArray)) {
          return { message: 'Invalid JSON: must be an array', statusCode: 400 };
        }
      } catch (err) {
        return {
          message: 'Failed to parse JSON',
          error: err.message,
          statusCode: 400,
        };
      }
      try {
        for (const rawDoc of dataArray) {
          // eslint-disable-next-line new-cap
          const doc = new fastify.mongodb.translationMultiunit(rawDoc);
          await doc.validate();
        }
      } catch (err) {
        return {
          message: 'Validation failed',
          error: err.message,
          statusCode: 400,
        };
      }

      await fastify.mongodb.translationMultiunit.deleteMany({});
      await fastify.mongodb.translationMultiunit.insertMany(dataArray);
      return { message: 'Units updated' };
    },
    schema: {
      tags: ['Admin'],
      summary: 'Import multiunit translations',
      description:
        'Upload a JSON file to replace all multiunit property translations. ' +
        'The file must contain a valid JSON array of translation objects. ' +
        'Existing translations will be deleted and replaced. Use ' +
        'multipart/form-data with the JSON file in the "files" key. ' +
        'Admin access required.' +
        '\n\nFields (multipart/form-data):' +
        '\n- required: token, files (single JSON file)',
      consumes: ['multipart/form-data'],
    },
  },
};
