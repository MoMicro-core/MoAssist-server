'use strict';

const { Client } = require('@googlemaps/google-maps-services-js');

const mapsClient = new Client({});

module.exports = {
  getLocation: {
    type: 'post',
    access: ['public', 'guest', 'unregistered'],
    handler: async ({
      input,
      language = 'en',
      types = 'geocode',
      sessionToken,
    }) => {
      if (typeof input !== 'string' || !input.trim()) {
        return { message: 'Input is required', statusCode: 400 };
      }

      const key = process.env.GOOGLE_MAPS;
      if (!key) {
        return {
          message: 'Google Maps key is not configured',
          statusCode: 500,
        };
      }

      const params = {
        input: input.trim(),
        key,
        language,
        types,
      };
      if (sessionToken) params.sessiontoken = sessionToken;

      try {
        const res = await mapsClient.placeAutocomplete({
          params,
          timeout: 10000,
        });
        return res.data;
      } catch (error) {
        const statusCode =
          error?.response?.status && error.response.status >= 400
            ? error.response.status
            : 502;
        const message =
          error?.response?.data?.error_message ||
          error?.message ||
          'Google Maps request failed';
        return { message, statusCode };
      }
    },
    schema: {
      tags: ['Google', 'Locations'],
      summary: 'Get Google Maps location suggestions',
      description:
        'Returns Google Maps Places Autocomplete suggestions for the ' +
        'provided input. Uses the server-side Google Maps API key.',
      body: {
        type: 'object',
        required: ['input'],
        properties: {
          input: { type: 'string', description: 'User input to autocomplete' },
          language: { type: 'string', default: 'en' },
          types: { type: 'string', default: 'geocode' },
          sessionToken: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
  },
};
