'use strict';

// function isValidDate(date) {
//   return date instanceof Date && !isNaN(date.getTime());
// }

function checkGeo(radiusRadians, centerLng, centerLat) {
  const R = 6371; // Earth radius in km
  const radiusKm = radiusRadians * R;
  const toRadians = (deg) => (deg * Math.PI) / 180;

  const centerLatRad = toRadians(centerLat);
  const centerLngRad = toRadians(centerLng);

  function isWithinRadius(point) {
    if (!Array.isArray(point) || point.length !== 2) {
      throw new Error('Point must be an array of [lng, lat]');
    }

    const [lng, lat] = point;
    if (typeof lng !== 'number' || typeof lat !== 'number') {
      throw new Error('Coordinates must be numbers');
    }

    const latRad = toRadians(lat);
    const lngRad = toRadians(lng);

    const dLat = latRad - centerLatRad;
    const dLng = lngRad - centerLngRad;

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(centerLatRad) * Math.cos(latRad) * Math.sin(dLng / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance <= radiusKm;
  }

  return isWithinRadius;
}

function sortListings(radiusRadians, userLng, userLat, country, listings) {
  const isWithinRadius = checkGeo(radiusRadians, userLng, userLat);

  return listings
    .map((listing) => {
      const coords = listing.location?.coordinates?.coordinates;
      if (!Array.isArray(coords) || coords.length !== 2) {
        listing.totalScore = listing.totalScore || 0;
        if (listing.location?.country === country) {
          listing.totalScore += 0.35;
        }
        return listing;
      }

      listing.totalScore = listing.totalScore || 0;

      if (isWithinRadius(coords)) {
        listing.totalScore += 0.35;
      }
      if (listing.location.country === country) {
        listing.totalScore += 0.35;
      }
      return listing;
    })
    .sort((a, b) => b.totalScore - a.totalScore);
}

module.exports = {
  search: {
    type: 'post',
    access: ['public', 'guest', 'unregistered'],
    handler: async (props) => {
      const { fastify, filter = {}, page = 1, pageSize = 10 } = props;
      const { checkIn = null, checkOut = null, user = {}, client } = props;
      const { sortBy = 'popularity' } = props;
      // const { minPrice = 0, maxPrice = 20000, bedrooms } = filter.unit;
      // const { bathrooms, beds } = filter.unit;

      const {
        longitude: filterLng = null,
        latitude: filterLat = null,
        country: filterCountry = null,
        city: filterCity = null,
        area: filterArea = null,
        type = [],
        tags = [],
        ...unitFilter
      } = filter;

      const listingQuery = {};
      const unitQuery = {};
      const priceRange = {};

      for (const [key, value] of Object.entries(unitFilter)) {
        if (key === 'amenities') {
          unitQuery[key] = { $all: value };
        } else if (key === 'minPrice') {
          priceRange.min = value;
        } else if (key === 'maxPrice') {
          priceRange.max = value;
        } else if (key === 'title') {
          listingQuery.title = { $regex: value, $options: 'i' };
        } else if (key === 'withPets') {
          unitQuery['petsAllow'] = value;
        } else if (key === 'beds') {
          unitQuery[key] = { $gte: value };
        } else {
          unitQuery[key] = value;
        }
      }

      // if (Object.keys(priceRange).length) {
      //   unitQuery['prices.rate'] = priceRange;
      // }

      if (type.length > 0) listingQuery.type = { $in: type };
      if (tags.length > 0) listingQuery.tags = { $all: tags };

      const validCoords = (lng, lat) =>
        typeof lng === 'number' &&
        typeof lat === 'number' &&
        !isNaN(filterLng) &&
        !isNaN(filterLat);

      let lng, lat, country, city, area;
      let maxDistanceInRadians;
      if (validCoords(filterLng, filterLat)) {
        lng = filterLng;
        lat = filterLat;
        maxDistanceInRadians = 50 / 6378.1;
        if (filterCountry) country = filterCountry;
        if (filterCity) city = filterCity;
        if (filterArea) area = filterArea;
      } else if (filterCountry) {
        country = filterCountry;
        if (filterCity) city = filterCity;
        if (filterArea) area = filterArea;
      } else if (validCoords(user.longitude, user.latitude)) {
        lng = user.longitude;
        lat = user.latitude;
        maxDistanceInRadians = 300 / 6378.1;
        if (user.country) country = user.country;
        if (user.city) city = user.city;
        if (user.area) area = user.area;
      } else if (user.country) {
        country = user.country;
        if (user.city) city = user.city;
        if (user.area) area = user.area;
      }

      const aggregationPipeline = [];

      aggregationPipeline.push({
        $match: {
          status: 'active',
          ...listingQuery,
        },
      });

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
          const locationQuery = {};
          locationQuery.country = country;
          if (city) locationQuery.city = city;
          if (area) locationQuery['area.name'] = area;
          for (const [key, value] of Object.entries(locationQuery)) {
            delete locationQuery[key];
            locationQuery['location.' + key] = value;
          }
          orConditions.push({ ...locationQuery });
        }

        aggregationPipeline.push({
          $match: {
            $or: orConditions,
          },
        });
      } else if (country) {
        const locationQuery = {};
        locationQuery.country = country;
        if (city) locationQuery.city = city;
        if (area) locationQuery['area.name'] = area;
        for (const [key, value] of Object.entries(locationQuery)) {
          delete locationQuery[key];
          locationQuery['location.' + key] = value;
        }
        aggregationPipeline.push({ $match: locationQuery });
      }

      aggregationPipeline.push({
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
      });

      aggregationPipeline.push({
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
      });

      aggregationPipeline.push({
        $addFields: {
          popularityScore: {
            $multiply: [{ $min: ['$popularityRaw', 1] }, 0.3],
          },
        },
      });

      aggregationPipeline.push({
        $addFields: {
          totalScore: { $ifNull: ['$popularityScore', 0] },
        },
      });

      aggregationPipeline.push({
        $lookup: {
          from: 'units',
          let: { unitId: '$unit' },
          pipeline: [
            { $match: { $expr: { $eq: ['$id', '$$unitId'] } } },
            { $project: { _id: 0, 'prices.rate': 1 } },
          ],
          as: 'pricesPreview_units',
        },
      });

      aggregationPipeline.push({
        $lookup: {
          from: 'multiunits',
          let: { multiunitIds: '$multiunit.id' },
          pipeline: [
            { $match: { $expr: { $in: ['$id', '$$multiunitIds'] } } },
            { $project: { _id: 0, 'prices.rate': 1 } },
          ],
          as: 'pricesPreview_multiunits',
        },
      });

      aggregationPipeline.push({
        $addFields: {
          pricesPreview: {
            $concatArrays: [
              '$pricesPreview_units',
              '$pricesPreview_multiunits',
            ],
          },
        },
      });

      aggregationPipeline.push({
        $addFields: {
          highestPriceRate: {
            $max: '$pricesPreview.prices.rate',
          },
          lowestPriceRate: {
            $min: '$pricesPreview.prices.rate',
          },
        },
      });
      aggregationPipeline.push({
        $addFields: {
          createdAtDate: { $toDate: '$createdAt' },
        },
      });
      if (sortBy === 'highestPrice') {
        aggregationPipeline.push({ $sort: { highestPriceRate: -1 } });
      } else if (sortBy === 'lowestPrice') {
        aggregationPipeline.push({ $sort: { lowestPriceRate: 1 } });
      } else if (sortBy === 'date') {
        aggregationPipeline.push({ $sort: { createdAtDate: -1 } });
      } else {
        aggregationPipeline.push({ $sort: { popularityScore: -1 } });
      }

      aggregationPipeline.push({
        $unset: [
          'pricesPreview_units',
          'pricesPreview_multiunits',
          'pricesPreview',
          'highestPriceRate',
          'lowestPriceRate',
          'createdAtDate',
        ],
      });
      aggregationPipeline.push({ $skip: (page - 1) * pageSize });
      aggregationPipeline.push({ $limit: pageSize });

      const listings =
        await fastify.mongodb.listings.aggregate(aggregationPipeline);

      async function handleListings(foundedListings) {
        const localizedListings = await fastify.listings.getFull({
          listings: foundedListings,
          match: unitQuery,
          checkIn,
          checkOut,
          matchAvailability: true,
          currency: client?.session?.currency,
          lang: client?.session?.language,
        });
        console.log(localizedListings[0]);

        if (Object.keys(priceRange).length) {
          const filteredListings = [];
          const inRange = (price) =>
            price >= priceRange.min && price <= priceRange.max;
          for (const listing of localizedListings) {
            if (
              listing.form === 'unit' &&
              inRange(listing.previewUnit.prices.rate)
            ) {
              filteredListings.push(listing);
              continue;
            }
            if (listing.form !== 'multiunit') continue;
            for (const unit of listing.previewMultiunit) {
              if (!inRange(unit.prices.rate)) {
                listing.previewMultiunit = listing.previewMultiunit.filter(
                  (mUnit) => mUnit.id !== unit.id,
                );
              }
            }
            if (listing.previewMultiunit.length) filteredListings.push(listing);
          }
          return filteredListings;
        }
        return localizedListings;
      }

      const ckeckedListings = await handleListings(listings);

      await fastify.mongodb.listings.updateMany(
        { id: { $in: ckeckedListings.map((l) => l.id) } },
        { $inc: { views: 1 } },
      );
      const resultListings =
        sortBy === 'popularity'
          ? sortListings(
            maxDistanceInRadians,
            lng,
            lat,
            country,
            ckeckedListings,
          )
          : ckeckedListings;
      return {
        listings: resultListings,
      };
    },
    schema: {
      tags: ['Listing'],
      summary: 'Search and filter listings',
      description:
        'Advanced search for property listings with comprehensive ' +
        'filtering options. Filter by location (coordinates, country, ' +
        'city, area), property type, amenities, price range, unit ' +
        'features (bedrooms, bathrooms, beds, guests). Supports ' +
        'date-based availability checking. Results are ranked by ' +
        'proximity to user location and popularity score.',
      body: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'Session token' },
          page: {
            type: 'number',
            description: 'Page number',
            default: 1,
            minimum: 1,
          },
          pageSize: {
            type: 'number',
            description: 'Number of items per page',
            default: 10,
            minimum: 1,
          },
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
              city: { type: 'string' },
              area: { type: 'string' },
            },
          },
          sortBy: {
            type: 'string',
            enum: ['popularity', 'highestPrice', 'lowestPrice', 'date'],
            default: 'popularity',
          },
          filter: {
            type: 'object',
            properties: {
              minPrice: { type: 'number' },
              maxPrice: { type: 'number' },
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
              city: { type: 'string' },
              area: { type: 'string' },
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
            listings: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
            skiped: { type: 'number' },
            message: { type: 'string' },
          },
        },
      },
    },
  },
};
