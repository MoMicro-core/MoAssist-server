'use strict';

const { loadApplication } = require('./lib/loader.js');
const initPlugins = require('./plugins/index.js');
const http = require('./lib/http.js');
const ws = require('./lib/ws.js');
const dotenv = require('dotenv');

const fastify = require('fastify')({
  logger: true,
  requestTimeout: 600000,
  pluginTimeout: 600000,
  trustProxy: true,
});
dotenv.config();

async function initFastify() {
  const { api, config } = await loadApplication();
  fastify.decorate('config', config);
  await initPlugins(fastify);

  http.init(fastify, api);
  ws.init(fastify, api);

  return fastify;
}

module.exports = { initFastify };
