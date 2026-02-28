'use strict';

function init(fastify, routes) {
  fastify.register(require('@fastify/websocket'));
  fastify.register(async (fastify) => {
    fastify.get('/api', { websocket: true }, (socket) => {
      const client = fastify.client.createSession();
      socket.on('message', async (message) => {
        try {
          const { route, ...args } = JSON.parse(message);
          delete args.client;
          delete args.fastify;
          const [service, endpoint, method] = route.split('/');
          if (!service || !endpoint || !method) {
            return socket.send('"Not found"', { binary: false });
          }
          if (!client.session && args.token) {
            await client.restoreSession({ token: args.token, socket });
          }
          const { handler, access, protocols } =
            routes[service][endpoint][method];
          if (!protocols?.includes('ws')) {
            return socket.send('"WS not allowed"', { binary: false });
          }
          if (
            (client?.session?.mode === 'unregistered' &&
              !access.includes('unregistered')) ||
            (client?.session?.mode &&
              !['all', client.session.mode].some((mode) =>
                access.includes(mode),
              ))
          ) {
            const result = {
              message: 'Forbidden',
            };
            socket.send(JSON.stringify(result), { binary: false });
            return null;
          }
          if (!client.session && !access.includes('public')) {
            const result = { message: 'Forbidden' };
            socket.send(JSON.stringify(result), { binary: false });
            return null;
          }
          if (!handler) return socket.send('"Not found"', { binary: false });
          const result = await handler(
            { ...args, fastify, client },
            socket,
          ).catch((error) => {
            const message = error?.message || 'Internal error';
            fastify.log.error(`${route} error: ${message}`);
            socket.send(JSON.stringify({ message }), { binary: false });
            // return { message };
            return;
          });
          socket.send(JSON.stringify(result), { binary: false });
        } catch (err) {
          fastify.log.error(err);
          socket.send(JSON.stringify({ message: err.message }), {
            binary: false,
          });
        }
        return null;
      });

      socket.on('close', () => {
        // const { handler } = routes['user']['session']['close'];
        // if (handler) handler({ fastify }, socket);
        client.close();
        // fastify.log.info('WebSocket connection closed');
      });
    });
  });
}
module.exports = { init };
