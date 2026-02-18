'use strict';

const crypto = require('node:crypto');

module.exports = {
  uploadImage: {
    type: 'post',
    protocols: ['http'],
    access: ['host'],
    handler: async (props) => {
      const { fastify, client, listingId, files = [] } = props;
      const { categoryId, categoryName = null, unitId = null } = props;
      const { imagesUrls = [] } = props;
      if (!files || (Array.isArray(files) && files.length === 0)) {
        if (
          !imagesUrls ||
          (Array.isArray(imagesUrls) && imagesUrls.length === 0)
        ) {
          return { message: 'No images provided', statusCode: 400 };
        }
      }
      if (!listingId) {
        return { message: 'ListingId is required', statusCode: 400 };
      }

      const listing = await fastify.mongodb.listings.findOne({ id: listingId });
      if (!listing) {
        return { message: 'Listing not found', statusCode: 404 };
      }
      if (listing.ownerUid !== client.session.uid) {
        return {
          message: 'No permission to update this unit',
          statusCode: 403,
        };
      }
      const maxImages = 30;
      let unit;
      if (listing.form === 'multiunit') {
        unit = await fastify.mongodb.multiunit.findOne({ id: unitId });
        if (!listing.multiunit.some((u) => u.id === unitId)) {
          return { message: 'Unit do not belong to listing', statusCode: 404 };
        }
      } else {
        unit = await fastify.mongodb.unit.findOne({ id: listing.unit });
      }
      if (!unit) return { message: 'Unit not found', statusCode: 404 };
      const imagesCount = unit.gallery
        .map((g) => g.images.length)
        .reduce((a, b) => a + b, 0);

      if (imagesCount >= maxImages) {
        return { message: 'Unit already has 30 images', statusCode: 400 };
      }
      if (imagesCount + files.length > maxImages) {
        return {
          message: 'Unit cannot have more than 20 images',
          statusCode: 400,
        };
      }

      const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
      ];
      const fileArray = Array.isArray(files) ? files : [files];
      const urls = [];
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
      for (const url of imagesUrls) {
        const newUrl = await fastify.doSpaces.duplicateImage(url, 'images');
        urls.push(newUrl);
      }
      if (urls.length === 0) {
        return { message: 'No images uploaded', statusCode: 400 };
      }
      const category = unit.gallery.find((g) => g.id === categoryId);
      if (!category) {
        const category = {
          name: categoryName || 'Images',
          images: urls,
          id: crypto.randomUUID(),
        };
        unit.gallery.push(category);
        if (categoryName) {
          const categoryTranslate = await fastify.openai.translate({
            data: { name: category.name },
            languages: fastify.config.environment.languages.filter(
              (l) => l !== client.session.language,
            ),
          });
          let translationUnit;
          if (listing.form === 'unit') {
            translationUnit = await fastify.mongodb.translationUnit.findOne({
              id: listing.unit,
            });
          } else {
            translationUnit =
              await fastify.mongodb.translationMultiunit.findOne({
                id: unitId,
              });
          }
          translationUnit.languages
            .find((l) => l.name === client.session.language)
            .translation.gallery.push({
              name: category.name,
              id: category.id,
            });
          for (const { name, translation } of categoryTranslate.languages) {
            translationUnit.languages
              .find((l) => l.name === name)
              .translation.gallery.push({
                name: translation.name,
                id: category.id,
              });
          }
          await translationUnit.save();
        }
      } else {
        category.images.push(...urls);
      }
      await unit.save();
      return { message: 'Images uploaded successfully', unit };
    },
    schema: {
      tags: ['Media'],
      summary: 'Upload unit images',
      description:
        'Uploads images to a unit gallery category. Accepts ' +
        'multipart/form-data with files or image URLs. Creates a new ' +
        'category if categoryName is provided, otherwise adds to ' +
        'existing categoryId. Maximum 30 images per unit. Supports JPEG, ' +
        'PNG, WebP, and GIF formats. Requires host access and listing ' +
        'ownership.' +
        '\n\nFields (multipart/form-data):' +
        '\n- required: token, listingId, and at least one of files (image file(s)) or imagesUrls (image URL array)' +
        '\n- optional: categoryId, categoryName, unitId (required for multiunit listings)',
      consumes: ['multipart/form-data'],
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            room: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
  },

  deleteImages: {
    type: 'post',
    protocols: ['http'],
    access: ['host'],
    handler: async (props) => {
      const { fastify, client, listingId } = props;
      const { images, categoryId, unitId = null } = props;
      if (!listingId) {
        return { message: 'ListingId is required', statusCode: 400 };
      }

      const listing = await fastify.mongodb.listings.findOne({ id: listingId });
      if (!listing) {
        return { message: 'Listing not found', statusCode: 404 };
      }
      if (listing.ownerUid !== client.session.uid) {
        return {
          message: 'No permission to update this unit',
          statusCode: 403,
        };
      }
      let unit;
      if (listing.form === 'multiunit') {
        unit = await fastify.mongodb.multiunit.findOne({ id: unitId });
        if (!listing.multiunit.some((u) => u.id === unitId)) {
          return { message: 'Unit do not belong to listing', statusCode: 404 };
        }
      } else {
        unit = await fastify.mongodb.unit.findOne({ id: listing.unit });
      }
      if (!unit) return { message: 'Unit not found', statusCode: 404 };
      const category = unit.gallery.find((g) => g.id === categoryId);
      if (!category) return { message: 'Category not found', statusCode: 404 };

      for (const fileUrl of images) {
        if (!category.images.includes(fileUrl)) continue;
        category.images = category.images.filter((image) => image !== fileUrl);
        const { pathname } = new URL(fileUrl);
        const key = decodeURIComponent(pathname.slice(1));
        await fastify.doSpaces.deleteFromSpaces(key);
      }
      unit.gallery.find((g) => g.id === categoryId).images = category.images;
      await unit.save();
      return { message: 'Images deleted successfully', unit };
    },
    schema: {
      tags: ['Media'],
      summary: 'Delete unit images',
      description:
        'Removes specified images from a unit gallery category. ' +
        'Permanently deletes image files from storage. Requires host ' +
        'access and listing ownership. For multiunit listings, unitId ' +
        'must be provided.',
      consumes: ['application/json'],
      body: {
        type: 'object',
        required: ['token', 'listingId', 'images', 'categoryId'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          listingId: { type: 'string', description: 'Listing MongoDB id' },
          images: {
            type: 'array',
            items: { type: 'string', description: 'Image URL' },
          },
          categoryId: { type: 'string', description: 'Category name' },
          unitId: { type: 'string', description: 'Unit MongoDB id' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            room: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
  },

  editCategoryName: {
    type: 'post',
    protocols: ['http'],
    access: ['host'],
    handler: async (props) => {
      const { fastify, client, listingId } = props;
      const { categoryId, newCategoryName, unitId = null } = props;
      const listing = await fastify.mongodb.listings.findOne({ id: listingId });
      if (!listing) {
        return { message: 'Listing not found', statusCode: 404 };
      }
      if (listing.ownerUid !== client.session.uid) {
        return {
          message: 'No permission to update this unit',
          statusCode: 403,
        };
      }
      let unitTranslation;
      if (listing.form === 'multiunit') {
        if (!listing.multiunit.some((u) => u.id === unitId)) {
          return { message: 'Unit do not belong to listing', statusCode: 404 };
        }
        unitTranslation = await fastify.mongodb.translationMultiunit.findOne({
          id: unitId,
        });
      } else {
        unitTranslation = await fastify.mongodb.translationUnit.findOne({
          id: listing.unit,
        });
      }
      if (!unitTranslation) {
        return { message: 'Unit not found', statusCode: 404 };
      }
      const newCategoryTranslation = await fastify.openai.translate({
        data: { name: newCategoryName },
        languages: fastify.config.environment.languages.filter(
          (l) => l !== client.session.language,
        ),
      });
      unitTranslation.languages
        .find((l) => l.name === client.session.language)
        .translation.gallery.find((g) => g.id === categoryId).name =
        newCategoryName;
      for (const { name, translation } of newCategoryTranslation.languages) {
        unitTranslation.languages
          .find((l) => l.name === name)
          .translation.gallery.find((g) => g.id === categoryId).name =
          translation.name;
      }
      await unitTranslation.save();
      return { message: 'Category name edited successfully' };
    },
    schema: {
      tags: ['Media'],
      summary: 'Rename gallery category',
      description:
        'Updates the name of a gallery category with automatic ' +
        'translation to all supported languages. Requires host access ' +
        'and listing ownership. For multiunit listings, unitId must be ' +
        'provided.',
      consumes: ['application/json'],
      body: {
        type: 'object',
        required: ['token', 'listingId', 'categoryId', 'newCategoryName'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          listingId: { type: 'string', description: 'Listing MongoDB id' },
          categoryId: { type: 'string' },
          newCategoryName: { type: 'string', description: 'New category name' },
          unitId: { type: 'string', description: 'Unit MongoDB id' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            unit: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
  },
  deleteCategory: {
    type: 'delete',
    access: ['host', 'admin'],
    handler: async (props) => {
      const { fastify, client, listingId } = props;
      const { categoryId, unitId = null } = props;
      const listing = await fastify.mongodb.listings.findOne({ id: listingId });
      if (!listing) {
        return { message: 'Listing not found', statusCode: 404 };
      }
      if (listing.ownerUid !== client.session.uid) {
        return {
          message: 'No permission to update this unit',
          statusCode: 403,
        };
      }
      let unit;
      if (listing.form === 'multiunit') {
        unit = await fastify.mongodb.multiunit.findOne({ id: unitId });
        if (!listing.multiunit.some((u) => u.id === unitId)) {
          return { message: 'Unit do not belong to listing', statusCode: 404 };
        }
      } else {
        unit = await fastify.mongodb.unit.findOne({ id: listing.unit });
      }
      if (!unit) return { message: 'Unit not found', statusCode: 404 };
      const category = unit.gallery.find((g) => g.id === categoryId);
      if (!category) return { message: 'Category not found', statusCode: 404 };
      for (const image of category.images) {
        const { pathname } = new URL(image);
        const key = decodeURIComponent(pathname.slice(1));
        await fastify.doSpaces.deleteFromSpaces(key);
      }
      unit.gallery = unit.gallery.filter((g) => g.id !== categoryId);
      await unit.save();
      return { message: 'Category deleted successfully', unit };
    },
    schema: {
      tags: ['Media'],
      summary: 'Delete gallery category',
      description:
        'Removes an entire gallery category and permanently deletes all ' +
        'associated images from storage. Requires host or admin access ' +
        'and listing ownership. For multiunit listings, unitId must be ' +
        'provided.',
      consumes: ['application/json'],
      body: {
        type: 'object',
        required: ['token', 'listingId', 'categoryId'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          listingId: { type: 'string', description: 'Listing MongoDB id' },
          categoryId: { type: 'string', description: 'Category name' },
          unitId: { type: 'string', description: 'Unit MongoDB id' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            unit: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
  },
  createCategory: {
    type: 'post',
    protocols: ['http'],
    access: ['host'],
    handler: async (props) => {
      const { fastify, client, listingId } = props;
      const { categoryName = null, unitId = null } = props;

      const listing = await fastify.mongodb.listings.findOne({ id: listingId });
      if (!listing) {
        return { message: 'Listing not found', statusCode: 404 };
      }
      if (listing.ownerUid !== client.session.uid) {
        return {
          message: 'No permission to update this unit',
          statusCode: 403,
        };
      }
      let unit;
      if (listing.form === 'multiunit') {
        unit = await fastify.mongodb.multiunit.findOne({ id: unitId });
        if (!listing.multiunit.some((u) => u.id === unitId)) {
          return { message: 'Unit do not belong to listing', statusCode: 404 };
        }
      } else {
        unit = await fastify.mongodb.unit.findOne({ id: listing.unit });
      }
      if (!unit) return { message: 'Unit not found', statusCode: 404 };
      const category = {
        name: categoryName || 'Images',
        images: [],
        id: crypto.randomUUID(),
      };
      unit.gallery.push(category);
      const categoryTranslate = await fastify.openai.translate({
        data: { name: category.name },
        languages: fastify.config.environment.languages.filter(
          (l) => l !== client.session.language,
        ),
      });
      let translationUnit;
      if (listing.form === 'unit') {
        translationUnit = await fastify.mongodb.translationUnit.findOne({
          id: listing.unit,
        });
      } else {
        translationUnit = await fastify.mongodb.translationMultiunit.findOne({
          id: unitId,
        });
      }
      translationUnit.languages
        .find((l) => l.name === client.session.language)
        .translation.gallery.push({
          name: category.name,
          id: category.id,
        });
      for (const { name, translation } of categoryTranslate.languages) {
        translationUnit.languages
          .find((l) => l.name === name)
          .translation.gallery.push({
            name: translation.name,
            id: category.id,
          });
      }
      await translationUnit.save();
      await unit.save();
      return { message: 'Category created successfully', unit };
    },
    schema: {
      tags: ['Media'],
      summary: 'Create gallery category',
      description:
        'Creates a new empty gallery category for a unit with automatic ' +
        'translation of the category name to all supported languages. ' +
        'Requires host access and listing ownership. For multiunit ' +
        'listings, unitId must be provided.',
      consumes: ['application/json'],
      body: {
        type: 'object',
        required: ['token', 'listingId', 'unitId', 'categoryName'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          listingId: { type: 'string', description: 'Listing MongoDB id' },
          unitId: { type: 'string', description: 'Unit MongoDB id' },
          categoryName: { type: 'string', description: 'Category name' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            room: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
  },

  reorder: {
    type: 'post',
    protocols: ['http'],
    access: ['host'],
    handler: async (props) => {
      const { fastify, client, listingId } = props;
      const { newImagesOrder, unitId = null, categoryId } = props;
      const listing = await fastify.mongodb.listings.findOne({ id: listingId });
      if (!listing) {
        return { message: 'Listing not found', statusCode: 404 };
      }
      if (listing.ownerUid !== client.session.uid) {
        return {
          message: 'No permission to update this unit',
          statusCode: 403,
        };
      }
      let unit;
      if (listing.form === 'multiunit') {
        unit = await fastify.mongodb.multiunit.findOne({ id: unitId });
        if (!listing.multiunit.some((u) => u.id === unitId)) {
          return { message: 'Unit do not belong to listing', statusCode: 404 };
        }
      } else {
        unit = await fastify.mongodb.unit.findOne({ id: listing.unit });
      }
      function haveSameItems(arr1, arr2) {
        return (
          arr1.length === arr2.length &&
          new Set(arr1).size === new Set(arr2).size &&
          [...new Set(arr1)].every((item) => arr2.includes(item))
        );
      }
      if (!unit) return { message: 'Unit not found', statusCode: 404 };
      const category = unit.gallery.find((g) => g.id === categoryId);
      if (!haveSameItems(category.images, newImagesOrder)) {
        return { message: 'No changes allowed', statusCode: 400 };
      }
      unit.gallery.find((g) => g.id === categoryId).images = newImagesOrder;
      await unit.save();
      return { message: 'Category created successfully', unit };
    },
    schema: {
      tags: ['Media'],
      summary: 'Reorder gallery images',
      description:
        'Updates the display order of images within a gallery category. ' +
        'The new order must contain the same images as the original. ' +
        'Requires host access and listing ownership. For multiunit ' +
        'listings, unitId must be provided.',
      consumes: ['application/json'],
      body: {
        type: 'object',
        required: ['token', 'listingId', 'categoryId', 'newImagesOrder'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          listingId: { type: 'string', description: 'Listing MongoDB id' },
          categoryId: { type: 'string', description: 'Category name' },
          newImagesOrder: {
            type: 'array',
            items: { type: 'string' },
            description: 'New images order',
          },
          unitId: { type: 'string', description: 'Unit MongoDB id' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            room: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
  },
};
