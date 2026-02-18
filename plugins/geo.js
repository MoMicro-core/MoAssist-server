'use strict';

const fp = require('fastify-plugin');
const geoip = require('geoip-lite');

const getCountry = async (request) => {
  if (!request) return 'US';
  const ip = request.ip; // should now be client’s real IP
  const geo = geoip.lookup(ip);
  return geo?.country || 'US';
};

const geoPlugin = async (fastify) => {
  const geo = { getCountry };
  fastify.decorate('geo', geo);
};

module.exports = fp(geoPlugin, {
  fastify: '5.x',
});
