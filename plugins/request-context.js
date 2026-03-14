'use strict';

const fp = require('fastify-plugin');

const createViewer = (session, locale) =>
  session
    ? {
        ...session,
        isAuthenticated: true,
        locale,
      }
    : {
        role: 'public',
        isAuthenticated: false,
        locale,
      };

const requestContextPlugin = async (fastify) => {
  fastify.decorateRequest('appSession', null);
  fastify.decorateRequest('viewer', null);

  fastify.addHook('onRequest', async (request) => {
    const token = fastify.readSessionToken(request);
    const session = token ? await fastify.getAppSession(token) : null;
    const locale = fastify.geo.resolveLocale(request, session);

    request.appSession = session;
    request.viewer = createViewer(session, locale);
  });
};

module.exports = fp(requestContextPlugin, {
  fastify: '5.x',
});
