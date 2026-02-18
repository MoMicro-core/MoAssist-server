'use strict';
const crypto = require('node:crypto');
const ratePlanTranslation = require('../../models/ratePlanTranslation');

module.exports = {
  add: {
    type: 'post',
    access: ['host', 'admin'],
    handler: async ({ fastify, client, listingId, unitId, ratePlans }) => {
      const listing = await fastify.mongodb.listings
        .find({ id: listingId })
        .select('id form unit multiunit ownerUid managers');
      if (
        listing.ownerUid !== client.session.uid &&
        client.session.mode !== 'admin' &&
        !(listing.managers || []).includes(client.session.uid)
      ) {
        return { message: 'Not your listing', statusCode: 403 };
      }
      let unit = null;
      if (listing.form === 'multiunit') {
        if (!listing.multiunit.some((mu) => mu.id === unitId)) {
          return { message: 'Unit not found', statusCode: 404 };
        }
        unit = await fastify.mongodb.multiunit.findOne({ id: unitId });
      } else {
        unit = await fastify.mongodb.unit.findOne({ id: listing.unit });
      }
      for (const ratePlan of ratePlans) {
        const newRatePlan = await fastify.mongodb.ratePlans.create({
          listingId: listing.id,
          unitId: unit.id,
          listingForm: listing.form,
          ...ratePlan,
        });
        unit.ratePlans.push(newRatePlan.id);
      }
      await fastify.localization.createRatePlanLocalization(
        client.session.language,
        ratePlans,
      );
      await unit.save();
      return { unit, message: 'Rate plan(s) added' };
    },
    schema: {
      tags: ['Rate Plan'],
      summary: 'Add rate plan',
      description:
        'Creates one or more rate plans for a specific unit. Requires ' +
        'host or admin access. Rate plans define pricing tiers, ' +
        'cancellation policies, and included services. Automatically ' +
        'creates localized translations.',
      body: {
        type: 'object',
        required: ['token', 'listingId', 'unitId', 'ratePlans'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          listingId: { type: 'string', description: 'Listing ID' },
          unitId: { type: 'string', description: 'Unit ID' },
          ratePlans: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Rate plan title' },
                description: {
                  type: 'string',
                  description: 'Rate plan description',
                },
                checkInTime: { type: 'string' },
                checkOutTime: { type: 'string' },
                rules: {
                  type: 'array',
                  items: { type: 'string' },
                },
                cancellation: {
                  type: 'object',
                  properties: {
                    days: { type: 'number', minimum: 0 },
                    procent: { type: 'number', minimum: 0, maximum: 1 },
                  },
                },
                prices: {
                  type: 'object',
                  properties: {
                    rate: { type: 'number', minimum: 1 },
                    // currency: { type: 'string' },
                    otherFee: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          price: { type: 'number', minimum: 1 },
                          type: {
                            type: 'string',
                            description: 'fixed or percentage',
                          },
                        },
                        required: ['name', 'price', 'type'],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            ratePlan: { type: 'object', additionalProperties: true },
            message: { type: 'string' },
          },
        },
      },
    },
  },
  delete: {
    type: 'post',
    access: ['host', 'admin'],
    handler: async ({ fastify, client, ratePlanId }) => {
      const ratePlan = await fastify.mongodb.ratePlans.findOne({
        id: ratePlanId,
      });
      if (!ratePlan) {
        return { message: 'Rate plan not found', statusCode: 404 };
      }
      const listing = await fastify.mongodb.listings
        .find({ id: ratePlan.listingId })
        .select('id ownerUid managers form');
      if (
        listing.ownerUid !== client.session.uid &&
        client.session.mode !== 'admin' &&
        !(listing.managers || []).includes(client.session.uid)
      ) {
        return { message: 'Not your listing', statusCode: 403 };
      }
      let unit = null;
      if (listing.form === 'multiunit') {
        unit = await fastify.mongodb.multiunit.findOne({ id: ratePlan.unitId });
      } else {
        unit = await fastify.mongodb.unit.findOne({ id: ratePlan.unitId });
      }
      if (!unit) {
        return { message: 'Unit not found', statusCode: 404 };
      }
      unit.ratePlans = (unit.ratePlans || []).filter(
        (rpId) => rpId !== ratePlan.id,
      );
      await unit.save();
      await fastify.mongodb.ratePlans.delete({ id: ratePlan.id });
      return { message: 'Rate plan deleted' };
    },
    schema: {
      tags: ['Rate Plan'],
      summary: 'Delete rate plan',
      description:
        'Permanently removes a rate plan from a unit. Requires host or ' +
        'admin access. Only the listing owner or assigned managers can ' +
        'delete rate plans.',
      body: {
        type: 'object',
        required: ['token', 'ratePlanId'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          ratePlanId: { type: 'string', description: 'Rate Plan ID' },
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
  edit: {
    type: 'post',
    access: ['host', 'admin'],
    handler: async ({ fastify, client, ratePlanId, changes }) => {
      const ratePlan = await fastify.mongodb.ratePlans.findOne({
        id: ratePlanId,
      });
      if (!ratePlan) {
        return { message: 'Rate plan not found', statusCode: 404 };
      }
      const listing = await fastify.mongodb.listings
        .find({ id: ratePlan.listingId })
        .select('id ownerUid managers');
      if (
        listing.ownerUid !== client.session.uid &&
        client.session.mode !== 'admin' &&
        !(listing.managers || []).includes(client.session.uid)
      ) {
        return { message: 'Not your listing', statusCode: 403 };
      }
      const fieldsToTranslate = ['title', 'description'];
      const changesToTranslate = [];
      const translationRatePlan =
        await fastify.mongodb.ratePlanTranslation.findOne({ id: ratePlan.id });
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) continue;
        if (fieldsToTranslate.includes(key)) {
          changesToTranslate.push({ key, value });
        }
        if (key === 'prices') {
          const newPrices = value;
          newPrices.otherFee = newPrices.otherFee.map((fee) => ({
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
              },
            },
            languages: fastify.config.environment.languages.filter(
              (l) => l !== client.session.language,
            ),
          });
          console.log({ translationPrices });
          const native = ratePlan.languages.find(
            (l) => l.name === client.session.language,
          );
          native.translation.prices = newPrices;
          translationPrices.languages.push({
            name: client.session.language,
            translation: native.translation,
          });
          ratePlan.prices = newPrices;
          for (const language of translationRatePlan.languages) {
            const newPriceTranslation = translationPrices.languages.find(
              (l) => l.name === language.name,
            );
            language.translation.prices =
              newPriceTranslation.translation.prices;
          }
          await translationRatePlan.save();
          continue;
        }
        ratePlan[key] = value;
      }
      if (changesToTranslate.length > 0) {
        const data = {};
        for (const field of changesToTranslate) {
          ratePlanTranslation.languages.find(
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
          const langEntry = ratePlanTranslation.languages.find(
            (l) => l.name === language.name,
          );
          if (!langEntry) continue;
          Object.assign(langEntry.translation, language.translation);
        }
      }
      await ratePlanTranslation.save();
      await ratePlan.save();
      return { ratePlan, message: 'Rate plan updated' };
    },
    schema: {
      tags: ['Rate Plan'],
      summary: 'Update rate plan',
      description:
        'Modifies an existing rate plan. Requires host or admin access. ' +
        'Supports partial updates for title, description, pricing, ' +
        'rules, and cancellation policy. Automatically updates ' +
        'translations.',
      body: {
        type: 'object',
        required: ['token', 'ratePlanId', 'changes'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          ratePlanId: { type: 'string', description: 'Rate Plan ID' },
          changes: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Rate plan title' },
              description: {
                type: 'string',
                description: 'Rate plan description',
              },
              checkInTime: { type: 'string' },
              checkOutTime: { type: 'string' },
              rules: {
                type: 'array',
                items: { type: 'string' },
              },
              cancellation: {
                type: 'object',
                properties: {
                  days: { type: 'number', minimum: 0 },
                  procent: { type: 'number', minimum: 0, maximum: 1 },
                },
              },
              prices: {
                type: 'object',
                properties: {
                  rate: { type: 'number', minimum: 1 },
                  // currency: { type: 'string' },
                  otherFee: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        price: { type: 'number', minimum: 1 },
                        type: {
                          type: 'string',
                          description: 'fixed or percentage',
                        },
                        id: { type: 'string' },
                      },
                      required: ['name', 'price', 'type'],
                    },
                  },
                },
              },
            },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            ratePlan: { type: 'object', additionalProperties: true },
            message: { type: 'string' },
          },
        },
      },
    },
  },
};
