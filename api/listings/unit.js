'use strict';

const crypto = require('node:crypto');

module.exports = {
  create: {
    type: 'post',
    access: ['host'],
    handler: async (props) => {
      const { fastify, location, unit, title, tagLine } = props;
      const { description, client, type } = props;
      if (!client.session.verified) {
        return { message: 'User not verified', statusCode: 500 };
      }
      unit.prices.otherFee = unit.prices.otherFee?.map((fee) => ({
        name: fee.name,
        price: fee.price,
        type: fee.type,
        id: crypto.randomUUID(),
      }));
      unit.prices.taxes = unit.prices.taxes?.map((tax) => ({
        name: tax.name,
        price: tax.price,
        type: tax.type,
        id: crypto.randomUUID(),
      }));

      unit.cancellation.procent /= 100;
      const newUnit = await fastify.mongodb.unit.create(unit);
      const translatedLocation = await fastify.locationHelper.create(
        location,
        client.session.language,
      );
      const locationEnglish = translatedLocation.find(
        (loc) => loc.language === 'english',
      );
      const listing = await fastify.mongodb.listings.create({
        tagLine,
        status: 'draft',
        ownerUid: client.session.uid,
        form: 'unit',
        type,
        title,
        location: {
          street: location.street,
          city: locationEnglish.city,
          postalCode: location.postalCode,
          country: locationEnglish.country,
          googleMapsUrl: location.googleMapsUrl,
          area: {
            name: locationEnglish.area.name,
            type: locationEnglish.area.type,
          },
          coordinates: {
            type: 'Point',
            coordinates: [
              location.coordinates.longitude,
              location.coordinates.latitude,
            ],
          },
        },
        description,
        unit: newUnit.id,
      });
      if (!listing) return { message: 'Error while creating', statusCode: 500 };
      await fastify.localization.createLocalization(
        client.session.language,
        { id: listing.id, title, description, tagLine, form: 'unit' },
        { unit: { ...unit, id: newUnit.id } },
      );
      await fastify.mongodb.user.updateOne(
        { uid: client.session.uid },
        { type: 'host' },
      );
      return { message: 'Listing created', listing };
    },
    schema: {
      tags: ['Listing/Unit'],
      summary: 'Create unit listing',
      description:
        'Creates a new single-unit property listing (e.g., apartment, ' +
        'villa). Requires host access and verified account. ' +
        'Automatically translates location data and creates localized ' +
        'content.',
      body: {
        type: 'object',
        required: [
          'token',
          'title',
          'location',
          'unit',
          'type',
          'description',
          'tagLine',
        ],
        properties: {
          token: { type: 'string', description: 'Session token' },
          title: { type: 'string', description: 'Listing title' },
          description: { type: 'string', description: 'Listing description' },
          tagLine: { type: 'string', description: 'Listing tag line' },
          type: {
            type: 'string',
            description: 'Listing type (villa for example)',
            enum: [
              'Hotel',
              'Apartment',
              'House / Villa',
              'Guesthouse',
              'Glamping',
              'Penthouse',
            ],
          },
          location: {
            type: 'object',
            description: 'Location data',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' },
              postalCode: { type: 'string' },
              country: { type: 'string' },
              googleMapsUrl: { type: 'string' },
              area: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: {
                    type: 'string',
                    enum: ['state', 'region', 'province'],
                  },
                },
                required: ['name', 'type'],
              },
              coordinates: {
                type: 'object',
                properties: {
                  longitude: { type: 'number' },
                  latitude: { type: 'number' },
                },
                required: ['longitude', 'latitude'],
              },
            },
            required: [
              'street',
              'city',
              'postalCode',
              'country',
              'area',
              'coordinates',
            ],
          },
          unit: {
            type: 'object',
            description: 'unit-specific data',
            properties: {
              cancellation: {
                type: 'object',
                properties: {
                  days: { type: 'number', default: 7 },
                  procent: {
                    type: 'number',
                    default: 50,
                    minimum: 0,
                    maximum: 100,
                  },
                },
              },
              rules: { type: 'array', items: { type: 'string' } },

              bookingRequirements: {
                type: 'object',
                properties: {
                  minNights: { type: 'number', default: 1 },
                  maxNights: { type: 'number', default: 30 },
                },
              },
              prices: {
                type: 'object',
                properties: {
                  rate: { type: 'number', minimum: 1 },
                  currency: { type: 'string' },
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
                  taxes: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        price: { type: 'number' },
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
              petsAllow: { type: 'boolean' },
              bedrooms: { type: 'number' },
              beds: { type: 'number' },
              bathrooms: { type: 'number' },
              amenities: { type: 'array', items: { type: 'string' } },
              guests: { type: 'number' },
              size: { type: 'number' },
            },
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

  getFull: {
    type: 'post',
    access: ['public', 'all'],
    handler: async ({ fastify, unitId }) => {
      const unit = await fastify.mongodb.unit.findOne({ id: unitId });
      if (!unit) return { message: 'unit not found', statusCode: 404 };
      return { unit };
    },
    schema: {
      tags: ['Listing/Unit'],
      summary: 'Get unit details',
      description:
        'Retrieves complete unit information including availability ' +
        'data. Accessible publicly or by authenticated users. Returns ' +
        'full unit object with pricing, amenities, and booking ' +
        'requirements.',
      body: {
        type: 'object',
        required: ['token', 'unitId'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          unitId: { type: 'string', description: 'Unit MongoDB id' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            unit: { type: 'object', additionalProperties: true },
            message: { type: 'string' },
          },
        },
      },
    },
  },
};
