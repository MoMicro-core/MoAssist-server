'use strict';

module.exports = {
  filter: {
    access: ['public', 'guest', 'unregistered'],
    type: 'post',
    handler: async (props) => {
      const { fastify, filter = {} } = props;
      const { checkIn = null, checkOut = null, user = {}, client } = props;
      const {
        longitude: filterLng = null,
        latitude: filterLat = null,
        country: filterCountry = null,
        type = [],
        tags = [],
        ...unitFilter
      } = filter;

      const listingQuery = {};
      const unitQuery = {};
      const priceRange = {};

      const aggregationPipeline = [];

      aggregationPipeline.push({
        $match: {
          status: 'active',
          ...listingQuery,
        },
      });

      if (type.length > 0) listingQuery.type = { $in: type };
      if (tags.length > 0) listingQuery.tags = { $all: tags };

      for (const [key, value] of Object.entries(unitFilter)) {
        if (key === 'amenities') {
          unitQuery[key] = { $all: value };
        } else if (key === 'minPrice') {
          priceRange.$gte = value;
        } else if (key === 'maxPrice') {
          priceRange.$lte = value;
        } else if (key === 'title') {
          listingQuery.title = { $regex: value, $options: 'i' };
        } else if (key === 'withPets') {
          unitQuery['petsAllow'] = value;
        } else {
          unitQuery[key] = { $gte: value };
        }
      }

      if (Object.keys(priceRange).length) {
        unitQuery['prices.rate'] = priceRange;
      }

      const validCoords = (lng, lat) =>
        typeof lng === 'number' &&
        typeof lat === 'number' &&
        !isNaN(filterLng) &&
        !isNaN(filterLat);

      let lng, lat, country;
      let maxDistanceInRadians;
      if (validCoords(filterLng, filterLat)) {
        lng = filterLng;
        lat = filterLat;
        maxDistanceInRadians = 50 / 6378.1;
        if (filterCountry) country = filterCountry;
      } else if (filterCountry) {
        country = filterCountry;
      } else if (validCoords(user.longitude, user.latitude)) {
        lng = user.longitude;
        lat = user.latitude;
        maxDistanceInRadians = 300 / 6378.1;
        if (user.country) country = user.country;
      } else if (user.country) {
        country = user.country;
      }
      if (validCoords(lng, lat)) {
        const orConditions = [];

        orConditions.push({
          'location.coordinates': {
            $geoWithin: {
              $centerSphere: [[lng, lat], maxDistanceInRadians],
            },
          },
        });

        if (country) {
          orConditions.push({ 'location.country': country });
        }

        aggregationPipeline.push({
          $match: {
            $or: orConditions,
          },
        });
      } else if (country) {
        aggregationPipeline.push({
          $match: { 'location.country': country },
        });
      }
      aggregationPipeline.push({
        $project: {
          form: 1,
          type: 1,
          location: 1,
          multiunit: 1,
          unit: 1,
        },
      });
      const listings =
        await fastify.mongodb.listings.aggregate(aggregationPipeline);

      const fullListings = await fastify.listings.getFull({
        listings,
        match: unitQuery,
        checkIn,
        checkOut,
        // returnType: '',
        matchAvailability: true,
        currency: client?.session?.currency,
        lang: client?.session?.lang,
      });
      const units = fullListings.map((l) =>
        l.form === 'unit' ? l.previewUnit : l.previewMultiunit,
      );
      const getPrices = (units) => {
        const prices = [];
        for (const unit of units) {
          if (Array.isArray(unit)) prices.push(...getPrices(unit));
          else prices.push(unit.prices.rate);
        }
        return prices;
      };
      const prices = getPrices(units);
      const highestPrice = Math.max(...prices);
      const lowestPrice = Math.min(...prices);
      return {
        // averagePrice,
        lowestPrice,
        highestPrice,
        currency: client?.session?.currency,
      };
    },
    schema: {
      tags: ['Listing'],
      summary: 'Filter listings by price',
      description:
        'Returns price range statistics for listings matching the ' +
        'specified filters. Supports location-based, amenity, and ' +
        'availability filtering. Returns lowest and highest prices in ' +
        'the user\'s preferred currency.',
      body: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'Session token' },
          checkIn: {
            type: 'string',
            description: 'Check-in date. Also checkOut is required',
            format: 'date',
          },
          checkOut: {
            type: 'string',
            description: 'Check-out date',
            format: 'date',
          },
          user: {
            type: 'object',
            properties: {
              longitude: { type: 'number' },
              latitude: { type: 'number' },
              country: { type: 'string' },
            },
          },
          filter: {
            type: 'object',
            properties: {
              bedrooms: { type: 'number' },
              bathrooms: { type: 'number' },
              beds: { type: 'number' },
              tags: { type: 'array', items: { type: 'string' } },
              type: {
                type: 'array',
                items: { type: 'string' },
              },
              longitude: { type: 'number' },
              latitude: { type: 'number' },
              country: { type: 'string' },
              guests: { type: 'number' },
              withPets: { type: 'boolean' },
              amenities: { type: 'array', items: { type: 'string' } },
            },
            additionalProperties: true,
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            highestPrice: { type: 'number' },
            lowestPrice: { type: 'number' },
            // averagePrice: { type: 'number' },
            message: { type: 'string' },
            currency: { type: 'string' },
          },
        },
      },
    },
  },
};
