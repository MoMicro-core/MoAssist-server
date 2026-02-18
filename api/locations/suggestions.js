'use strict';

module.exports = {
  get: {
    type: 'post',
    access: ['public', 'guest', 'unregistered'],
    handler: async ({ fastify, keyword, limit, skip }) => {
      const locations = await fastify.mongodb.locations
        .find({
          'data.stamp': { $regex: keyword.toLowerCase(), $options: 'i' },
          type: 'city',
        })
        .limit(limit)
        .skip(skip)
        .lean();
      const results = [];
      const enLocations = locations.map((l) => {
        const en = l.data.find((l) => l.language === 'english');
        return { country: en.country, city: en.city, area: en.area, id: l.id };
      });
      for (const loc of enLocations) {
        const cityListings = await fastify.mongodb.listings.countDocuments({
          'location.city': loc.city,
          status: 'active',
        });
        if (cityListings) {
          results.push({ loc, type: 'city', count: cityListings });
        }
        const areaListings = await fastify.mongodb.listings.countDocuments({
          'location.area.name': loc.area.name,
          // 'location.area.type': loc.area.type,
          status: 'active',
        });
        if (areaListings) {
          results.push({ loc, type: 'area', count: areaListings });
        }
        const countryListings = await fastify.mongodb.listings.countDocuments({
          'location.country': loc.country,
          status: 'active',
        });
        if (countryListings) {
          results.push({ loc, type: 'country', count: countryListings });
        }
      }
      const filteredResults = [];
      for (const res of results) {
        if (res.type === 'city') {
          const original = locations.find((l) => l.id === res.loc.id);
          filteredResults.push({ count: res.count, ...original });
        }
        if (res.type === 'area') {
          const areLocations = await fastify.mongodb.locations
            .find({
              'data.area.name': res.loc.area.name,
              'data.area.type': res.loc.area.type,
              type: 'area',
            })
            .lean();
          filteredResults.push(
            ...areLocations.map((l) => ({ count: res.count, ...l })),
          );
        }
        if (res.type === 'country') {
          const countryLocations = await fastify.mongodb.locations
            .find({
              'data.country': res.loc.country,
              type: 'country',
            })
            .lean();
          filteredResults.push(
            ...countryLocations.map((l) => ({ count: res.count, ...l })),
          );
        }
      }
      const result = filteredResults.reduce((accumulator, current) => {
        const exists = accumulator.find((item) => item.id === current.id);
        if (!exists) {
          accumulator = accumulator.concat(current);
        }
        return accumulator;
      }, []);

      return { locations: result };
    },
    schema: {
      tags: ['Locations'],
      summary: 'Search location suggestions',
      description:
        'Returns location suggestions based on a keyword search. ' +
        'Searches by city or country name across all supported ' +
        'languages. Only returns locations that have active listings. ' +
        'Supports pagination with limit and skip parameters.',
      body: {
        type: 'object',
        required: ['keyword'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          keyword: { type: 'string', description: 'Keyword to search for' },
          limit: { type: 'number', minimum: 1, default: 10 },
          skip: { type: 'number', minimum: 0, default: 0 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            locations: {
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
