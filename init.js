'use strict';

const path = require('node:path');
const dotenv = require('dotenv');
const fastifyFactory = require('fastify');
const { loadDir, invokeFactories, mergeFactoryMaps } = require('./lib/loader');
const initPlugins = require('./plugins');
const { registerHttpRoutes } = require('./lib/http');
const { registerWebsocket } = require('./lib/ws');
const { createServices } = require('./src/create-services');
const { ApplicationError } = require('./src/shared/application/errors');

dotenv.config();

async function initFastify() {
  const fastify = fastifyFactory({
    logger: true,
    trustProxy: true,
    requestTimeout: 600000,
    pluginTimeout: 600000,
  });

  const config = await loadDir(path.join(process.cwd(), './config'));
  fastify.decorate('config', config);

  await initPlugins(fastify);

  const services = await createServices(fastify);
  fastify.decorate('services', services);

  const api = await loadDir(path.join(process.cwd(), './api'));

  registerHttpRoutes(fastify, invokeFactories(api.http, { services, fastify }));

  await registerWebsocket(
    fastify,
    mergeFactoryMaps(api.ws, { services, fastify }),
  );

  fastify.setErrorHandler((error, request, reply) => {
    const statusCode =
      error instanceof ApplicationError
        ? error.statusCode
        : error.statusCode || 500;
    const code =
      error instanceof ApplicationError ? error.code : 'internal_error';

    request.log.error(error);
    reply.code(statusCode).send({
      message: error.message || 'Internal server error',
      code,
    });
  });

  return fastify;
}

module.exports = { initFastify };
