'use strict';

const path = require('node:path');
const geoip = require('geoip-lite');
const corsPlugin = require('@fastify/cors');
const formbodyPlugin = require('@fastify/formbody');
const fastifyStaticPlugin = require('@fastify/static');
const mongoPlugin = require('./mongodb.js');
const firebasePlugin = require('./firebase.js');
const fastifyRawBody = require('fastify-raw-body');
const logger = require('./logger.js');

function describeSchemaProperties(schema, { forceRequired = false } = {}) {
  if (!schema || schema.type !== 'object' || !schema.properties) return [];
  const required = new Set(schema.required || []);
  return Object.keys(schema.properties).map((name) => {
    const isRequired = forceRequired || required.has(name);
    return `- ${name} (${isRequired ? 'required' : 'optional'})`;
  });
}

function buildRequestPropertiesDescription(routeSchema) {
  if (!routeSchema) return '';
  const sections = [];
  const bodyLines = describeSchemaProperties(routeSchema.body);
  if (bodyLines.length) {
    sections.push('Request body properties:', ...bodyLines, '');
  }
  const queryLines = describeSchemaProperties(routeSchema.querystring);
  if (queryLines.length) {
    sections.push('Query parameters:', ...queryLines, '');
  }
  const headerLines = describeSchemaProperties(routeSchema.headers);
  if (headerLines.length) {
    sections.push('Header parameters:', ...headerLines, '');
  }
  const paramsLines = describeSchemaProperties(routeSchema.params, {
    forceRequired: true,
  });
  if (paramsLines.length) {
    sections.push('Path parameters:', ...paramsLines, '');
  }
  if (!sections.length) return '';
  if (sections[sections.length - 1] === '') sections.pop();
  return sections.join('\n');
}

module.exports = async (fastify) => {
  fastify.register(formbodyPlugin);
  fastify.register(corsPlugin, { origin: '*' });

  await fastify.register(fastifyRawBody, {
    field: 'rawBody',
    global: false,
    encoding: 'utf8',
    runFirst: true,
  });

  await fastify.register(mongoPlugin);
  await fastify.register(firebasePlugin);
  const Loger = logger();
  await fastify.decorate('logger', Loger);

  await fastify.register(require('@fastify/multipart'), {
    limits: {
      fileSize: 1024 * 1024 * 1024, // 1gb
    },
    attachFieldsToBody: true,
  });

  await fastify.register(require('./geo.js'));
  await fastify.register(require('./client.js'));

  await fastify.register(require('@fastify/swagger'), {
    transform: ({ schema, url }) => {
      if (!schema) return { schema, url };
      const extra = buildRequestPropertiesDescription(schema);
      if (!extra) return { schema, url };
      const transformedSchema = { ...schema };
      const base = transformedSchema.description || '';
      transformedSchema.description = base ? `${base}\n\n${extra}` : extra;
      return { schema: transformedSchema, url };
    },
    swagger: {},
  });

  await fastify.register(require('@fastify/swagger-ui'), {
    routePrefix: '/docs',
    exposeRoute: true,
  });

  const staticDirs = [
    { root: './static', prefix: '/static/' },
    { root: './models', prefix: '/schemas/', decorateReply: false },
  ];

  for (const { root, prefix, decorateReply = true } of staticDirs) {
    await fastify.register(fastifyStaticPlugin, {
      root: path.join(process.cwd(), root),
      prefix,
      decorateReply,
    });
  }

  // await fastify.register(require('./digitalOcean.js'));
  await fastify.register(require('./calendar.js'));
  await fastify.register(require('./email.js'));
  await fastify.register(require('./openai.js'));
  // await fastify.register(require('./transferwise.js'));
  await fastify.register(require('./stripe.js'));
  // await fastify.register(require('./utils/listings.js'));
  // await fastify.register(require('./utils/localization.js'));
  // await fastify.register(require('./utils/video.js'));
  // await fastify.register(require('./google.js'));
  // await fastify.register(require('./holidays.js'));
  // await fastify.register(require('./utils/location.js'));
  await fastify.register(require('./utils/statistics.js'));

  fastify.get('/', (request, reply) => {
    reply.sendFile('index.html');
  });

  // const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  // const WEBHOOK_SECRET_LIVE = process.env.STRIPE_WEBHOOK_SECRET_LIVE;

  fastify.post(
    '/webhook-live',
    { config: { rawBody: true } },
    // async (request, reply) => { },
  );

  fastify.get('/ip', async (req) => {
    const ip = req.ip;
    const geo = geoip.lookup(ip);

    const userCountry = await fastify.geo.getCountry(req);
    return {
      ip,
      country: geo ? geo.country : 'Unknown',
      userCountry,
    };
  });
};
