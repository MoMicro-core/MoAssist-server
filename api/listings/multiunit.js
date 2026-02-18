'use strict';

const crypto = require('node:crypto');

// function isValidDate(date) {
//   return date instanceof Date && !isNaN(date.getTime());
// }
module.exports = {
  create: {
    type: 'post',
    access: ['host'],
    handler: async (props) => {
      const { fastify, location, title, type, tagLine } = props;
      const { description, units, client } = props;
      if (!client.session.verified) {
        return { message: 'User not verified', statusCode: 500 };
      }
      const unitsInfo = [];
      const unitsToTranslate = [];
      if (units && !units.length) {
        return { message: 'No units provided', statusCode: 400 };
      }
      for (const { quantity, ...unit } of units) {
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

        const newRoom = await fastify.mongodb.multiunit.create({
          units: Array.from({ length: quantity }, (_, i) => i + 1),
          ...unit,
        });
        unitsInfo.push({
          id: newRoom.id,
          title: unit.title,
          count: quantity,
        });
        unitsToTranslate.push({ ...unit, id: newRoom.id });
      }
      const translatedLocation = await fastify.locationHelper.create(
        location,
        client.session.language,
      );
      const englishLocation = translatedLocation.find(
        (loc) => loc.language === 'english',
      );
      const listing = await fastify.mongodb.listings.create({
        tagLine,
        ownerUid: client.session.uid,
        status: 'draft',
        form: 'multiunit',
        title,
        location: {
          street: location.street,
          city: englishLocation.city,
          postalCode: location.postalCode,
          country: englishLocation.country,
          googleMapsUrl: location.googleMapsUrl,
          area: {
            name: englishLocation.area.name,
            type: englishLocation.area.type,
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
        type,
        multiunit: unitsInfo,
      });
      if (!listing) return { message: 'Error while creating', statusCode: 500 };
      await fastify.localization.createLocalization(
        client.session.language,
        { id: listing.id, title, description, tagLine, form: 'multiunit' },
        { units: unitsToTranslate },
      );
      await fastify.mongodb.user.updateOne(
        { uid: client.session.uid },
        { type: 'host' },
      );

      return { message: 'Listing created', listing };
    },
    schema: {
      tags: ['Listing/Multiunit'],
      summary: 'Create multiunit listing',
      description:
        'Creates a new multi-room property listing (e.g., hotel, ' +
        'hostel). Requires host access and verified account. Supports ' +
        'multiple unit types with individual pricing and amenities. ' +
        'All fields are required.',
      body: {
        type: 'object',
        required: [
          'token',
          'title',
          'location',
          'units',
          'type',
          'description',
          'tagLine',
        ],
        properties: {
          tagLine: { type: 'string', description: 'Listing tag line' },
          token: { type: 'string', description: 'Session token' },
          title: { type: 'string', description: 'Listing title' },
          description: { type: 'string', description: 'Listing description' },

          type: {
            type: 'string',
            description: 'Listing type (hotel for example)',
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
          units: {
            type: 'array',
            description: 'List of hotel rooms',
            items: {
              type: 'object',
              properties: {
                quantity: { type: 'number', minimum: 1 },
                rules: { type: 'array', items: { type: 'string' } },
                bookingRequirements: {
                  type: 'object',
                  properties: {
                    minNights: { type: 'number', default: 1 },
                    maxNights: { type: 'number', default: 30 },
                  },
                },
                description: { type: 'string' },
                size: { type: 'number' },
                guests: { type: 'number', minimum: 1 },
                beds: { type: 'number', minimum: 1 },
                bedrooms: { type: 'number', minimum: 1 },
                bathrooms: { type: 'number' },
                floor: { type: 'number' },
                // rules: { type: 'array', items: { type: 'string' } },
                title: { type: 'string' },
                undertitle: { type: 'string' },
                petsAllow: { type: 'boolean' },
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

                prices: {
                  type: 'object',
                  properties: {
                    rate: { type: 'number', minimum: 1 },
                    currency: { type: 'string', default: 'USD' },
                    otherFee: {
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
                amenities: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
              additionalProperties: true,
              required: ['title', 'prices', 'beds', 'guests', 'amenities'],
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
    handler: async ({ fastify, unitIds }) => {
      const units = await fastify.mongodb.multiunit.find({
        id: { $in: unitIds },
      });
      if (!units) return { message: 'Listing not found', statusCode: 404 };
      return { units };
    },

    schema: {
      tags: ['Listing/Multiunit'],
      summary: 'Get units by IDs',
      description:
        'Retrieves multiple units by their MongoDB IDs in a single ' +
        'request. Publicly accessible. Returns an array of complete ' +
        'unit objects.',
      body: {
        type: 'object',
        required: ['unitIds'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          unitIds: { type: 'array', items: { type: 'string' } },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            units: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
            message: { type: 'string' },
          },
        },
      },
    },
  },

  getAllUnits: {
    type: 'post',
    access: ['public', 'all'],
    handler: async ({ fastify, listingId }) => {
      const listing = await fastify.mongodb.listings.findOne({
        id: listingId,
      });
      if (!listing) return { message: 'Listing not found', statusCode: 404 };
      const unitIds = listing.multiunit.map((u) => u.id);

      const units = await fastify.mongodb.multiunit.find({
        id: { $in: unitIds },
      });
      if (!units) return { message: 'Listing not found', statusCode: 404 };
      return { units };
    },

    schema: {
      tags: ['Listing/Multiunit'],
      summary: 'Get all listing units',
      description:
        'Retrieves all unit types associated with a multiunit listing. ' +
        'Publicly accessible. Returns complete unit details including ' +
        'pricing, capacity, and amenities.',
      body: {
        type: 'object',
        required: ['token', 'listingId'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          listingId: { type: 'string', description: 'Listing MongoDB id' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            units: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
            message: { type: 'string' },
          },
        },
      },
    },
  },

  getFreeUnits: {
    type: 'post',
    access: ['public', 'all'],
    handler: async ({ fastify, listingId, checkIn, checkOut }) => {
      const listing = await fastify.mongodb.listings
        .findOne({ id: listingId })
        .select('multiunit', 'form', 'id');
      if (!listing) return { message: 'Listing not found', statusCode: 404 };
      if (listing.form !== 'multiunit') {
        return { message: 'Listing is not multi', statusCode: 400 };
      }

      const { fullMultiunits } = await fastify.listings.getFull({
        listings: [listing],
        checkIn,
        checkOut,
        returnType: 'units',
        matchAvailability: true,
      });

      return { units: fullMultiunits };
    },
    schema: {
      tags: ['Listing/Multiunit'],
      summary: 'Get available units',
      description:
        'Retrieves units available for booking within the specified ' +
        'date range. Filters out booked or blocked units. Publicly ' +
        'accessible. Requires check-in and check-out dates.',
      consumes: ['application/json'],
      body: {
        type: 'object',
        required: ['token', 'listingId', 'checkIn', 'checkOut'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          listingId: { type: 'string', description: 'Listing MongoDB id' },
          checkIn: { type: 'string', format: 'date' },
          checkOut: { type: 'string', format: 'date' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            units: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
            message: { type: 'string' },
          },
        },
      },
    },
  },
};
