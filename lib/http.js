'use strict';

const setupEndpoint =
  (fastify) =>
  (type, route, handler, access, protocols = ['http'], schema = {}) => {
    // /api/${iface}/${name}
    schema.description = `${schema.description || ''} \n\n 
      protocols: ${protocols.join(', ')}\n
      access: ${access.join(', ')}`;
    fastify[type]('/api/' + route, { schema }, async (request, reply) => {
      if (!protocols.includes('http')) {
        return { message: 'Do not allow http' };
      }
      const client = fastify.client.createSession();
      // maybe remove token and just use props.token
      let props, token;
      if (request.method === 'GET') {
        if (!access.includes('public')) return { message: 'Forbidden' };
        return await handler({ fastify, request, client })
          .then(({ headers, ...result }) => {
            if (headers) reply.headers(headers);
            if (result.file) return result.file;
            else return result;
          })
          .catch((error) => {
            const message = error?.message || 'Internal error';
            fastify.log.error(`${route} error: ${message}`);
            reply.code(500);
            return { message };
          });
      }
      const contentType = request.headers['content-type'];
      if (contentType === 'application/json') {
        props = request.body;
        token = props.token;
      } else if (contentType.startsWith('multipart/form-data')) {
        props = {};
        token = request.body.token?.value;
        if (!token) {
          reply.code(403);
          return { message: 'Forbidden' };
        }
        for (const [key, value] of Object.entries(request.body)) {
          if (key === 'files') props[key] = value;
          else props[key] = value.value;
        }
      }
      if (token) await client.restoreSession({ token, request });
      else await client.initializeEmptySession(request);
      delete props.client;
      delete props.fastify;
      delete props.request;
      if (
        (client?.session?.mode === 'unregistered' &&
          !access.includes('unregistered')) ||
        (client?.session?.mode &&
          !['all', client.session.mode].some((mode) => access.includes(mode)))
      ) {
        reply.code(403);
        return { message: 'Forbidden' };
        // }
      }
      if (!client.session && !access.includes('public')) {
        reply.code(403);
        return { message: 'Forbidden' };
      }
      return await handler({ ...props, fastify, request, client })
        .then(({ headers, statusCode = 200, ...result }) => {
          if (headers) reply.headers(headers);
          reply.code(statusCode);
          if (result.file) return result.file;
          else return result;
        })
        .catch((error) => {
          const message = error?.message || 'Internal error';
          fastify.log.error(`${route} error: ${message}`);
          fastify.log.error(error);
          reply.code(500);
          return { message };
        });
    });
  };

function init(fastify, routes) {
  const setup = setupEndpoint(fastify);
  for (const [iface, methods] of Object.entries(routes)) {
    for (const [name, method] of Object.entries(methods)) {
      const { type, handler, access, protocols, schema } = method;
      if (type && handler) {
        setup(type, `${iface}/${name}`, handler, access, protocols, schema);
        continue;
      }
      for (const [key, value] of Object.entries(method)) {
        const { type, handler, access, protocols, schema } = value;
        if (!type || !handler) continue;
        setup(
          type,
          `${iface}/${name}/${key}`,
          handler,
          access,
          protocols,
          schema,
        );
      }
    }
  }
}

module.exports = { init };
