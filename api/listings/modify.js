'use strict';

const crypto = require('node:crypto');

module.exports = {
  updateMultinit: {
    type: 'post',
    access: ['host', 'admin'],
    handler: async ({ fastify, client, listingId, unitId, fields }) => {
      const listing = await fastify.mongodb.listings.findOne({
        id: listingId,
        form: 'multiunit',
      });
      if (!listing) return { message: 'Listing not found' };
      if (
        listing.ownerUid !== client.session.uid &&
        client.session.mode !== 'admin'
      ) {
        return {
          message: 'You are not the owner of this listing',
          statusCode: 403,
        };
      }
      const unit = await fastify.mongodb.multiunit.findOne({ id: unitId });
      if (!unit) return { message: 'Unit not found', statusCode: 404 };
      const prohibitedFields = [
        'notAvailable',
        'id',
        'prices.otherFee',
        'prices.otherFee.name',
        'prices.otherFee._id',
        'prices.taxes',
        'prices.taxes.name',
        'reviews',
        'prices.taxes._id',
        'gallery',
        'gallery._id',
        'gallery.name',
      ];
      const fieldToTranslate = [];
      const allowedTranstlateFields = [
        'description',
        'undertitle',
        'title',
        'rules',
      ];
      const translationUnit =
        await fastify.mongodb.translationMultiunit.findOne({
          id: unitId,
        });

      for (const field in fields) {
        if (fields[field] === null) continue;
        if (prohibitedFields.includes(field)) continue;
        if (field === 'cancellation') {
          unit.cancellation.procent = fields[field].procent / 100;
          unit.cancellation.days = fields[field].days;
          continue;
        }
        if (field === 'prices') {
          const newPrices = fields[field];
          newPrices.otherFee = newPrices.otherFee.map((fee) => ({
            name: fee.name,
            price: fee.price,
            type: fee.type,
            id: fee.id || crypto.randomUUID(),
          }));
          newPrices.taxes = newPrices.taxes.map((fee) => ({
            name: fee.name,
            price: fee.price,
            type: fee.type,
            id: fee.id || crypto.randomUUID(),
          }));

          const translationPrices = await fastify.openai.translate({
            data: {
              prices: {
                otherFee: newPrices.otherFee?.map((f) => ({
                  name: f.name,
                  id: f.id,
                })),
                taxes: newPrices.taxes?.map((t) => ({
                  name: t.name,
                  id: t.id,
                })),
              },
            },
            languages: fastify.config.environment.languages.filter(
              (l) => l !== client.session.language,
            ),
          });
          const native = translationUnit.languages.find(
            (l) => l.name === client.session.language,
          );
          native.translation.prices = newPrices;
          translationPrices.languages.push({
            name: client.session.language,
            translation: native.translation,
          });
          unit.prices = newPrices;
          for (const language of translationUnit.languages) {
            const newPriceTranslation = translationPrices.languages.find(
              (l) => l.name === language.name,
            );
            language.translation.prices =
              newPriceTranslation.translation.prices;
          }
          continue;
        }
        if (field === 'units') {
          listing.multiunit[
            listing.multiunit.findIndex((u) => u.id === unitId)
          ].count = fields[field].length;
        }
        if (field === 'linksToSync') {
          const clearMultiunitByBookingId = async (
            multiunit,
            servicesToRemove = [],
          ) => {
            if (servicesToRemove.length === 0) return;

            const cleanedNotAvailable = unit.notAvailable
              .map((day) => ({
                ...day,
                units: day.units.filter(
                  (u) => !servicesToRemove.includes(u.source),
                ),
              }))
              .filter((day) => day.units.length > 0);

            await fastify.mongodb.multiunit.updateOne(
              { id: multiunit.id },
              { $set: { notAvailable: cleanedNotAvailable } },
            );
            fastify.log.info(
              // eslint-disable-next-line max-len
              `Cleared ${servicesToRemove.join(', ')} bookings for multiunit ${multiunit.id}`,
            );
          };

          const deletedServices = unit.linksToSync.filter(
            (l) => !fields[field].some((f) => f.link === l.link),
          );
          const deletedSources = deletedServices.map((l) => l.source);
          await clearMultiunitByBookingId(unit, deletedSources);
          unit[field] = fields[field];
          if (listing.form === 'multiunit') {
            if (!unitId) return { message: 'Unit ID is required' };
            if (!listing.multiunit.some((u) => u.id === unitId)) {
              return { message: 'Room does not belong to listing' };
            }
            try {
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
          continue;
        }
        if (allowedTranstlateFields.includes(field)) {
          fieldToTranslate.push({ name: field, value: fields[field] });
        }

        unit[field] = fields[field];
      }
      if (fieldToTranslate.length > 0) {
        const data = {};
        for (const field of fieldToTranslate) {
          translationUnit.languages.find(
            (l) => l.name === client.session.language,
          ).translation[field.name] = field.value;
          data[field.name] = field.value;
        }
        const newTransltion = await fastify.openai.translate({
          data,
          languages: fastify.config.environment.languages.filter(
            (l) => l !== client.session.language,
          ),
        });
        for (const language of newTransltion.languages) {
          const langEntry = translationUnit.languages.find(
            (l) => l.name === language.name,
          );
          if (!langEntry) continue;
          Object.assign(langEntry.translation, language.translation);
        }
      }
      await translationUnit.save();
      await unit.save();
      await listing.save();

      return { message: 'Listing updated', unit };
    },
    schema: {
      tags: ['Listing'],
      summary: 'Update multiunit room',
      description:
        'Update a specific room/unit within a multiunit property. ' +
        'Handles pricing, amenities, calendar sync links, and ' +
        'translatable content. Translatable fields (title, description, ' +
        'undertitle, rules) are auto-translated. Modifying linksToSync ' +
        'triggers calendar synchronization. Host or admin access ' +
        'required.',
      body: {
        type: 'object',
        required: ['unitId', 'fields', 'token', 'listingId'],
        properties: {
          unitId: { type: 'string' },
          fields: { type: 'object', additionalProperties: true },
          token: { type: 'string', description: 'Session token' },
          listingId: { type: 'string', description: 'Listing MongoDB id' },
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

  updateUnit: {
    type: 'post',
    access: ['host', 'admin'],
    handler: async ({ fastify, client, listingId, fields }) => {
      const listing = await fastify.mongodb.listings.findOne({
        id: listingId,
        form: 'unit',
      });
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
      const unit = await fastify.mongodb.unit.findOne({ id: listing.unit });
      if (!unit) return { message: 'Unit not found', statusCode: 404 };
      const prohibitedFields = [
        'notAvailable',
        'id',
        'prices.otherFee',
        'prices.otherFee.name',
        'prices.otherFee._id',
        'prices.taxes',
        'prices.taxes.name',
        'prices.taxes._id',
        'reviews',
        'gallery',
        'gallery._id',
        'gallery.name',
      ];
      const translationUnit = await fastify.mongodb.translationUnit.findOne({
        id: listing.unit,
      });
      const fieldToTranslate = [];
      const allowedTranstlateFields = [
        'description',
        'undertitle',
        'title',
        'rules',
      ];

      for (const field in fields) {
        if (fields[field] === null) continue;
        if (prohibitedFields.includes(field)) continue;

        if (field === 'cancellation') {
          unit.cancellation.procent = fields[field].procent / 100;
          unit.cancellation.days = fields[field].days;
          continue;
        }
        if (field === 'prices') {
          const newPrices = fields[field];
          newPrices.otherFee = newPrices.otherFee.map((fee) => ({
            name: fee.name,
            price: fee.price,
            type: fee.type,
            id: fee.id || crypto.randomUUID(),
          }));
          newPrices.taxes = newPrices.taxes.map((fee) => ({
            name: fee.name,
            price: fee.price,
            type: fee.type,
            id: fee.id || crypto.randomUUID(),
          }));
          console.dir(newPrices, { depth: null });
          const translationPrices = await fastify.openai.translate({
            data: {
              prices: {
                otherFee: newPrices.otherFee?.map((f) => ({
                  name: f.name,
                  id: f.id,
                })),
                taxes: newPrices.taxes?.map((t) => ({
                  name: t.name,
                  id: t.id,
                })),
              },
            },
            languages: fastify.config.environment.languages.filter(
              (l) => l !== client.session.language,
            ),
          });
          console.log({ translationPrices });
          const native = translationUnit.languages.find(
            (l) => l.name === client.session.language,
          );
          native.translation.prices = newPrices;
          translationPrices.languages.push({
            name: client.session.language,
            translation: native.translation,
          });
          unit.prices = newPrices;
          for (const language of translationUnit.languages) {
            const newPriceTranslation = translationPrices.languages.find(
              (l) => l.name === language.name,
            );
            language.translation.prices =
              newPriceTranslation.translation.prices;
          }
          await translationUnit.save();
          continue;
        }
        if (field === 'linksToSync') {
          const clearUnitByBookingId = async (unit, services = []) => {
            const { id } = unit;

            const cleanedNotAvailable = unit.notAvailable.filter(
              (day) => !services.includes(day.source),
            );
            await fastify.mongodb.unit.updateOne(
              { id },
              { $set: { notAvailable: cleanedNotAvailable } },
            );

            fastify.log.info(
              `Cleared ${services.join(', ')} bookings for unit ${id}`,
            );
          };
          const deletedServices = unit.linksToSync.filter(
            (l) => !fields[field].some((f) => f.link === l.link),
          );
          const deletedSources = deletedServices.map((l) => l.source);
          await clearUnitByBookingId(unit, deletedSources);
        }
        if (allowedTranstlateFields.includes(field)) {
          fieldToTranslate.push({ name: field, value: fields[field] });
        }

        unit[field] = fields[field];
      }
      if (fieldToTranslate.length > 0) {
        const data = {};
        for (const field of fieldToTranslate) {
          translationUnit.languages.find(
            (l) => l.name === client.session.language,
          ).translation[field.name] = field.value;
          data[field.name] = field.value;
        }
        const newTransltion = await fastify.openai.translate({
          data,
          languages: fastify.config.environment.languages.filter(
            (l) => l !== client.session.language,
          ),
        });
        for (const language of newTransltion.languages) {
          const langEntry = translationUnit.languages.find(
            (l) => l.name === language.name,
          );
          if (!langEntry) continue;
          Object.assign(langEntry.translation, language.translation);
        }
      }
      await translationUnit.save();
      await unit.save();
      return { message: 'Listing updated', unit };
    },
    schema: {
      tags: ['Listing'],
      summary: 'Update single unit listing',
      description:
        'Update a single-unit property listing. Handles pricing with ' +
        'auto-translated fee/tax names, amenities, calendar sync links, ' +
        'and content. Modifying linksToSync clears old synced dates and ' +
        're-syncs from external calendars. Host or admin access required.',
      body: {
        type: 'object',
        required: ['fields', 'token', 'listingId'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          listingId: { type: 'string', description: 'Listing MongoDB id' },
          fields: { type: 'object', additionalProperties: true },
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

  changeStatus: {
    type: 'post',
    access: ['host', 'admin'],
    handler: async ({ fastify, client, listingId, status }) => {
      const listing = await fastify.mongodb.listings.findOne({ id: listingId });
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
      const tranlation = await fastify.mongodb.translationListing.findOne({
        id: listingId,
      });
      if (status !== 'active') {
        listing.status = status;
        await listing.save();
        return { message: 'Listing updated', listing };
      }
      if (!tranlation || !tranlation.languages.length) {
        return { message: 'Listing has not enough info', statusCode: 400 };
      }
      const lang = tranlation.languages[0].translation;
      const requiredFields = [
        'title',
        'description',
        'tagLine',
        'previewVideo',
      ];
      const missingFields = [];
      for (const field of requiredFields) {
        console.log(field);
        if (field === 'previewVideo') {
          if (!listing.previewVideo) {
            missingFields.push(field);
          }
          continue;
        } else if (!lang[field]) {
          console.log(field);
          missingFields.push(field);
        }
      }
      if (missingFields.length) {
        return {
          message: `Missing fields: ${missingFields.join(', ')}`,
          fields: missingFields,
          statusCode: 400,
        };
      }
      listing.status = status;
      await listing.save();
      return { message: 'Listing updated', listing };
    },
    schema: {
      tags: ['Listing'],
      summary: 'Change listing status',
      description:
        'Update listing visibility status. Setting to "active" validates ' +
        'required fields (title, description, tagLine, previewVideo). ' +
        'Use "draft" for work-in-progress, "archived" to hide without ' +
        'deleting. Host or admin access required.',
      body: {
        type: 'object',
        required: ['token', 'listingId', 'status'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          listingId: { type: 'string', description: 'Listing MongoDB id' },
          status: { type: 'string', enum: ['active', 'archived', 'draft'] },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            fields: { type: 'array', items: { type: 'string' } },
            listing: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
  },
};
