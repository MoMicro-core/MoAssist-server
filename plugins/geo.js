'use strict';

const fp = require('fastify-plugin');
const geoip = require('geoip-lite');

const DEFAULT_LOCALE = {
  country: 'US',
  language: 'english',
  currency: 'USD',
};

const getCountry = (request) => {
  if (!request) return DEFAULT_LOCALE.country;
  const geo = geoip.lookup(request.ip);
  return geo?.country || DEFAULT_LOCALE.country;
};

const normalizeCountry = (fastify, country) => {
  const code = String(country || DEFAULT_LOCALE.country).toUpperCase();
  return fastify.config.countries.countryAliases?.[code] || code;
};

const resolveLocale = (fastify, request, session = null) => {
  const country = normalizeCountry(fastify, getCountry(request));
  const localized =
    fastify.config.countries.localizationByCountry?.[country] || {};

  return {
    country,
    language:
      session?.language || localized.language || DEFAULT_LOCALE.language,
    currency:
      session?.currency || localized.currency || DEFAULT_LOCALE.currency,
  };
};

const geoPlugin = async (fastify) => {
  fastify.decorate('geo', {
    getCountry: (request) => getCountry(request),
    resolveLocale: (request, session = null) =>
      resolveLocale(fastify, request, session),
  });
};

module.exports = fp(geoPlugin, {
  fastify: '5.x',
});
