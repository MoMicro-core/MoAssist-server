'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');

module.exports = {
  get: {
    type: 'post',
    access: ['host', 'admin'],
    handler: async ({ fastify, files }) => {
      if (Array.isArray(files)) return { message: 'Only one file is allowed' };
      const allowedTypes = ['video/mp4', 'video/webm', 'video/ogg'];
      if (!allowedTypes.includes(files.mimetype)) {
        return { message: 'Invalid file type', statusCode: 400 };
      }
      const { _buf: fileBuffer, filename } = files;
      const filesDir = path.join(process.cwd(), 'files');
      try {
        await fs.mkdir(filesDir, { recursive: true });
      } catch {
        return { message: 'Failed to create files directory', statusCode: 500 };
      }

      const filePath = path.join(filesDir, `${Date.now()}-${filename}`);

      await fs.writeFile(filePath, fileBuffer);

      const subtitles = await fastify.video.videoPathToSubtitles(
        filePath,
        filename,
        files.mimetype,
      );

      await fs.unlink(filePath);
      // const subtitles = await fastify.video.transcribeAudioBuffer(
      //   fileBuffer,
      //   filename,
      //   mimetype,
      // );
      // const subtitles = await fastify.googleVideo.subtitlesFromBuffer(
      //   fileBuffer,
      //   filename,
      // );

      return { subtitles };
    },
    schema: {
      tags: ['Video'],
      summary: 'Generate video subtitles',
      description:
        'Extracts and generates subtitles from an uploaded video using ' +
        'AI transcription. Accepts multipart/form-data with a single ' +
        'video file (MP4, WebM, or OGG). Returns full transcript text ' +
        'and timestamped segments. Requires host or admin access.' +
        '\n\nFields (multipart/form-data):' +
        '\n- required: token, files (single video file)',
      consumes: ['multipart/form-data'],
      response: {
        200: {
          type: 'object',
          properties: {
            subtitles: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                segments: {
                  type: 'array',
                  items: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
        },
      },
    },
  },
};
