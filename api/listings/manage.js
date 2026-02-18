'use strict';
const ffmpeg = require('fluent-ffmpeg');
const fs = require('node:fs/promises');
const path = require('node:path');
const util = require('node:util');
const ffprobe = util.promisify(ffmpeg.ffprobe);

module.exports = {
  getMy: {
    type: 'post',
    access: ['host'],
    handler: async ({ fastify, client, sortBy = 'title' }) => {
      const sortQuery = {};
      if (sortBy === 'title') sortQuery.title = 1;
      else if (sortBy === 'date') sortQuery.createdAt = -1;
      else if (sortBy === 'popularity') sortQuery.totalScore = -1;

      const matchStage = { $match: { ownerUid: client.session.uid } };
      const query = [
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
      ];
      if (Object.keys(sortQuery).length > 0) query.push({ $sort: sortQuery });
      const listings = await fastify.mongodb.listings.aggregate(query);
      const localizedFullListings = await fastify.listings.getFull({
        listings,
        lang: client.session.language,
      });
      if (sortBy === 'bookings') {
        for (const listing of localizedFullListings) {
          const bookingCounts = await fastify.mongodb.bookings.countDocuments({
            listing: listing.id,
          });
          listing.bookingsCount = bookingCounts;
        }
        localizedFullListings.sort((a, b) => b.bookingsCount - a.bookingsCount);
      }
      const managersUid = localizedFullListings.flatMap(
        (listing) => listing.managers,
      );
      const managers = await fastify.mongodb.user
        .find({ uid: { $in: managersUid } })
        .select({ uid: 1, name: 1, email: 1, lastName: 1 });
      for (const listing of localizedFullListings) {
        const listingManagers = managers.filter((manager) =>
          listing.managers.includes(manager.uid),
        );
        listing.managers = listingManagers;
      }
      return { listings: localizedFullListings };
    },
    schema: {
      tags: ['Listing'],
      summary: 'Get my listings',
      description:
        'Retrieve all listings owned by the authenticated host. Supports ' +
        'multiple sort options: by title (alphabetical), by date (most ' +
        'recent), by popularity (engagement score), or by bookings ' +
        '(reservation count). Includes full localized details.',
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          sortBy: { type: 'string', description: 'Sort by a specific field' },
          token: { type: 'string', description: 'Session token' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            listings: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
    },
  },

  getManaged: {
    type: 'post',
    access: ['host'],
    handler: async ({ fastify, client }) => {
      const listings = await fastify.mongodb.listings.find({
        managers: { $in: [client.session.uid] },
      });
      const localizedFullListings = await fastify.listings.getFull({
        listings,
        lang: client.session.language,
      });
      return { listings: localizedFullListings };
    },
    schema: {
      tags: ['Listing'],
      summary: 'Get managed listings',
      description:
        'Retrieve all listings where the authenticated user is assigned ' +
        'as a manager (not owner). Returns full localized listing ' +
        'details. Host access required.',
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
            message: { type: 'string', description: 'Session token' },
            listings: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
    },
  },

  update: {
    type: 'put',
    access: ['host', 'admin'],
    handler: async ({ fastify, client, id, changes }) => {
      const listing = await fastify.mongodb.listings.findOne({ id });
      if (!listing) return { message: 'Listing not found', statusCode: 404 };
      if (
        listing.ownerUid !== client.session.uid &&
        client.session.mode !== 'admin'
      ) {
        return {
          message: 'You are not the owner of this listing',
          statusCode: 403,
        };
      }
      const fieldToTranslate = {};
      const allowedFieldsToTranslate = ['title', 'description', 'tagLine'];
      const forbiddenFields = ['id', 'status', 'ownerUid', 'managers', 'form'];
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) continue;
        if (forbiddenFields.includes(key)) continue;
        if (allowedFieldsToTranslate.includes(key)) {
          fieldToTranslate[key] = value;
        }

        listing[key] = value;
      }
      if (Object.keys(fieldToTranslate).length === 0) {
        await listing.save();
        return { listing, message: 'Listing updated' };
      }
      const listingTranslation =
        await fastify.mongodb.translationListing.findOne({
          id: listing.id,
        });

      const native = listingTranslation.languages.find(
        (l) => l.name === client.session.language,
      );
      for (const [key, value] of Object.entries(fieldToTranslate)) {
        native.translation[key] = value;
      }

      const translationListing = await fastify.openai.translate({
        data: fieldToTranslate,

        languages: fastify.config.environment.languages.filter(
          (l) => l !== client.session.language,
        ),
      });
      for (const language of translationListing.languages) {
        const langEntry = listingTranslation.languages.find(
          (l) => l.name === language.name,
        );
        if (!langEntry) continue;
        Object.assign(langEntry.translation, language.translation);
      }
      await listingTranslation.save();
      return { listing, message: 'Listing updated' };
    },
    schema: {
      tags: ['Listing'],
      summary: 'Update listing',
      description:
        'Update listing properties. Translatable fields (title, ' +
        'description, tagLine) are automatically translated to all ' +
        'supported languages using AI. Protected fields (id, status, ' +
        'ownerUid, managers, form) cannot be modified. Host or admin ' +
        'access required.',
      body: {
        type: 'object',
        required: ['token', 'id', 'changes'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          id: { type: 'string', description: 'Listing ID (id)' },
          changes: {
            type: 'object',
            additionalProperties: true,
            description:
              'Fields to update in the listing.' +
              'Should be an object with key/value pairs.' +
              'For example: { "name": "My new listing name" }',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            listing: { type: 'object', additionalProperties: true },
            message: { type: 'string' },
          },
        },
      },
    },
  },

  delete: {
    type: 'delete',
    access: ['host', 'admin'],
    handler: async ({ fastify, id, client }) => {
      const listing = await fastify.mongodb.listings.findOne({ id });
      if (
        listing.ownerUid !== client.session.uid &&
        client.session.mode !== 'admin'
      ) {
        return {
          message: 'You are not the owner of this listing',
          statusCode: 403,
        };
      }
      await fastify.mongodb.listings.deleteOne({ id });
      await fastify.mongodb.translationListing.deleteOne({ id });
      if (!listing) return { message: 'Listing not found', statusCode: 404 };
      const deleteFile = async (url) => {
        try {
          const { pathname } = new URL(url);
          await fastify.mongodb.videos.deleteOne({ url: listing.previewVideo });
          const key = decodeURIComponent(pathname.slice(1));
          await fastify.doSpaces.deleteFromSpaces(key);
        } catch (error) {
          console.log(error);
        }
      };
      for (const image of listing.previewImages) {
        await deleteFile(image);
      }
      if (listing.previewVideo) {
        await deleteFile(listing.previewVideo);
        await fastify.mongodb.videos.deleteOne({ url: listing.previewVideo });
      }

      if (listing.form === 'unit') {
        const unit = await fastify.mongodb.unit.findOne({ id: listing.unit });
        if (unit && Array.isArray(unit.gallery)) {
          for (const category of unit.gallery) {
            if (Array.isArray(category.images)) {
              await Promise.all(category.images.map(deleteFile));
            }
          }
          await fastify.mongodb.unit.deleteOne({ id: listing.unit });
        }
        await fastify.mongodb.translationUnit.deleteOne({ id: listing.unit });
      }

      if (listing.form === 'multiunit') {
        const multiunits = await fastify.mongodb.multiunit.find({
          id: { $in: listing.multiunit.map((u) => u.id) },
        });

        for (const mu of multiunits) {
          if (mu && Array.isArray(mu.gallery)) {
            for (const category of mu.gallery) {
              if (Array.isArray(category.images)) {
                await Promise.all(category.images.map(deleteFile));
              }
            }
            await fastify.mongodb.multiunit.deleteOne({ id: mu.id });
          }
          await fastify.mongodb.translationMultiunit.deleteOne({
            id: mu.id,
          });
        }
      }
      return { message: 'Listing deleted' };
    },
    schema: {
      tags: ['Listing'],
      summary: 'Delete listing',
      description:
        'Permanently delete a listing and all associated data including ' +
        'units/multiunits, translations, preview images, and videos from ' +
        'cloud storage. This action cannot be undone. Host or admin ' +
        'access required.',
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
            message: { type: 'string' },
          },
        },
      },
    },
  },

  uploadImage: {
    type: 'post',
    protocols: ['http'],
    access: ['host'],
    handler: async ({ fastify, client, listingId, files }) => {
      if (!files || (Array.isArray(files) && files.length === 0)) {
        return { message: 'No images provided' };
      }
      if (!listingId) {
        return { message: 'Listing ID is required', statusCode: 400 };
      }
      const listing = await fastify.mongodb.listings.findOne({
        id: listingId,
        ownerUid: client.session.uid,
      });
      if (!listing) return { message: 'Listing not found', statusCode: 404 };
      const maxImages = 5;
      if (listing.previewImages.length >= maxImages) {
        return { message: 'Listing already has 5 images', statusCode: 400 };
      }
      if (listing.previewImages.length + files.length > maxImages) {
        return {
          message: 'Listing cannot have more than 5 images',
          statusCode: 400,
        };
      }
      const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
      ];
      const urls = [];
      const fileArray = Array.isArray(files) ? files : [files];
      for (const file of fileArray) {
        const { _buf: fileBuffer, filename, mimetype } = file;
        if (!allowedTypes.includes(mimetype)) continue;

        const url = await fastify.doSpaces.uploadToSpaces({
          fileStream: fileBuffer,
          filename,
          folder: 'images',
          mimetype: file.mimetype,
          contentLength: fileBuffer.length,
        });
        urls.push(url);
      }
      if (urls.length === 0) {
        return { message: 'No images uploaded', statusCode: 400 };
      }
      listing.previewImages.push(...urls);
      await listing.save();
      return { message: 'Images uploaded successfully', listing };
    },
    schema: {
      tags: ['Listing'],
      summary: 'Upload listing preview images',
      description:
        'Upload up to 5 preview images for a listing. Use ' +
        'multipart/form-data with images in the "files" key. Accepts ' +
        'JPEG, PNG, WebP, and GIF formats. Images are stored in cloud ' +
        'storage. Host access required.' +
        '\n\nFields (multipart/form-data):' +
        '\n- required: token, listingId, files (1-5 image files)',
      consumes: ['multipart/form-data'],
      response: {
        200: {
          type: 'object',
          properties: {
            listing: { type: 'object', additionalProperties: true },
            message: { type: 'string' },
          },
        },
      },
    },
  },

  deleteImages: {
    type: 'post',
    access: ['host'],
    handler: async ({ fastify, client, listingId, images }) => {
      if (!images || !Array.isArray(images)) {
        return { message: 'Images are required', statusCode: 400 };
      }
      if (!listingId) {
        return { message: 'Listing ID is required', statusCode: 400 };
      }
      const listing = await fastify.mongodb.listings.findOne({
        id: listingId,
        ownerUid: client.session.uid,
      });
      if (!listing) return { message: 'Listing not found', statusCode: 404 };
      for (const fileUrl of images) {
        if (!listing.previewImages.includes(fileUrl)) continue;
        const { pathname } = new URL(fileUrl);
        const key = decodeURIComponent(pathname.slice(1));
        await fastify.doSpaces.deleteFromSpaces(key);
        listing.previewImages = listing.previewImages.filter(
          (image) => image !== fileUrl,
        );
      }
      await listing.save();
      return { message: 'Images deleted successfully', listing };
    },
    schema: {
      tags: ['Listing'],
      summary: 'Delete listing preview images',
      description:
        'Remove specific preview images from a listing. Provide an array ' +
        'of image URLs to delete. Images are removed from both the ' +
        'listing and cloud storage. Host access required.',
      consumes: ['application/json'],
      body: {
        type: 'object',
        required: ['token', 'listingId', 'images'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          listingId: { type: 'string', description: 'Listing ID (id)' },
          images: {
            type: 'array',
            items: { type: 'string', description: 'Image URL' },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            listing: { type: 'object', additionalProperties: true },
            message: { type: 'string' },
          },
        },
      },
    },
  },

  uploadVideo: {
    type: 'post',
    protocols: ['http'],
    access: ['host', 'admin'],
    handler: async (props) => {
      const { fastify, client, listingId, files, subtitles = '{}' } = props;
      if (!listingId) return { message: 'not enough data' };
      const listing = await fastify.mongodb.listings.findOne({
        id: listingId,
        // ownerUid: client.session.uid,
      });
      if (!listing) return { message: 'Listing not found', statusCode: 404 };
      if (
        listing.ownerUid !== client.session.uid &&
        client.session.mode !== 'admin'
      ) {
        return { message: 'Not yours', statusCode: 500 };
      }
      if (listing.previewVideo) {
        const { pathname } = new URL(listing.previewVideo);
        await fastify.mongodb.videos.deleteOne({ url: listing.previewVideo });
        const key = decodeURIComponent(pathname.slice(1));
        await fastify.doSpaces.deleteFromSpaces(key);
      }

      if (Array.isArray(files)) return { message: 'Only one file is allowed' };
      const allowedTypes = ['video/mp4', 'video/webm', 'video/ogg'];
      if (!allowedTypes.includes(files.mimetype)) {
        return { message: 'Invalid file type', statusCode: 400 };
      }

      const { _buf: fileBuffer, filename, mimetype } = files;
      const filesDir = path.join(process.cwd(), 'files');
      try {
        await fs.mkdir(filesDir, { recursive: true });
      } catch {
        return {
          message: 'Failed to create files directory',
          statusCode: 500,
        };
      }

      const filePath = path.join(filesDir, `${Date.now()}-${filename}`);

      await fs.writeFile(filePath, fileBuffer);
      async function checkQuality(minHeight, filepath) {
        const metadata = await ffprobe(filepath);
        const videoStream = metadata.streams.find(
          (s) => s.codec_type === 'video',
        );
        if (videoStream === undefined) {
          return { status: false, message: 'No video' };
        }

        let width = Number(videoStream.width);
        let height = Number(videoStream.height);

        const rotationRaw =
          videoStream.tags?.rotate ??
          metadata.format?.tags?.rotate ??
          videoStream.side_data_list?.find((d) => d?.rotation !== undefined)
            ?.rotation;
        const rotation = Number(rotationRaw);
        const isRotated90 =
          Number.isFinite(rotation) && Math.abs(rotation) % 180 === 90;
        if (isRotated90) [width, height] = [height, width];

        if (!Number.isFinite(width) || !Number.isFinite(height)) {
          return { status: false, message: 'No video' };
        }
        if (width > height) {
          return { status: false, message: 'Video have to be vertical' };
        }
        const status = width >= minHeight;
        return { status, message: 'low quality' };
      }

      const { status: isHD, message } = await checkQuality(720, filePath);
      await fs.unlink(filePath);
      if (!isHD) {
        return { message, statusCode: 400 };
      }

      const url = await fastify.doSpaces.uploadToSpaces({
        fileStream: fileBuffer,
        filename,
        folder: 'videos',
        mimetype,
        contentLength: fileBuffer.length,
      });
      const videoSubtitles = JSON.parse(subtitles) || {};
      const video = await fastify.mongodb.videos.create({
        url,
        subtitles: videoSubtitles,
      });
      listing.previewVideo = url;
      await listing.save();
      return { message: 'Video uploaded successfully', video };
    },
    schema: {
      tags: ['Listing'],
      summary: 'Upload listing preview video',
      description:
        'Upload a preview video for a listing. Use multipart/form-data ' +
        'with video in the "files" key. Accepts MP4, WebM, and OGG ' +
        'formats. Maximum file size: 1GB. Video is validated for ' +
        'duration (max 60s) and stored in cloud. Optionally include ' +
        'subtitles in "subtitles" field as JSON with text and time-' +
        'coded segments. Replaces existing ' +
        'video if present. Host or admin access required.' +
        '\n\nFields (multipart/form-data):' +
        '\n- required: token, listingId, files (single video file)' +
        '\n-optional: subtitles(JSON string with text and time-coded segments)',
      consumes: ['multipart/form-data'],
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            video: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
  },
};
