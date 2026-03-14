'use strict';

const buildPreHandlers = (fastify, access = ['public'], custom) => {
  const handlers = [];
  const requiresSession = access.some(
    (item) => item === 'user' || item === 'admin',
  );

  if (requiresSession) handlers.push(fastify.authenticateRequest);
  if (requiresSession) handlers.push(fastify.authorizeRoles(access));
  if (custom) handlers.push(custom);

  return handlers.length ? handlers : undefined;
};

const registerHttpRoutes = (fastify, routes) => {
  for (const route of routes) {
    fastify.route({
      method: route.method,
      url: route.url,
      schema: route.schema,
      config: route.config,
      preHandler: buildPreHandlers(fastify, route.access, route.preHandler),
      handler: route.handler,
    });
  }
};

module.exports = { registerHttpRoutes };
