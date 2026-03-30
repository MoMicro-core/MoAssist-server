'use strict';

const path = require('node:path');
const cors = require('@fastify/cors');
const multipart = require('@fastify/multipart');
const rawBody = require('fastify-raw-body');
const fastifyStatic = require('@fastify/static');
const swagger = require('@fastify/swagger');
const swaggerUi = require('@fastify/swagger-ui');

const corePlugins = [
  'mongodb',
  'firebase',
  'geo',
  'client',
  'request-context',
  'openai',
  'stripe',
];

module.exports = async (fastify) => {
  await fastify.register(cors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Session-Token'],
    exposedHeaders: ['X-Session-Token'],
  });
  await fastify.register(multipart, {
    limits: {
      files: 300,
      fileSize: 300 * 1024 * 1024,
    },
  });
  await fastify.register(rawBody, {
    field: 'rawBody',
    global: false,
    encoding: 'utf8',
    runFirst: true,
  });
  for (const pluginName of corePlugins) {
    await fastify.register(require(`./${pluginName}`));
  }
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'MoMicro Assist API',
        version: '1.0.0',
        description: 'MoMicro Assist swagger',
      },
    },
  });
  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
  });
  await fastify.register(fastifyStatic, {
    root: path.join(process.cwd(), 'static'),
    prefix: '/static/',
  });
};
