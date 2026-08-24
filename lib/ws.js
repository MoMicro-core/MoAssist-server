'use strict';

const websocket = require('@fastify/websocket');
const {
  UnauthorizedError,
  BadRequestError,
  TooManyRequestsError,
} = require('../src/shared/application/errors');

const hasAccess = (connection, access = ['public']) => {
  if (access.includes('public')) return true;
  if (access.includes('widget') && connection.actorType === 'widget') {
    return true;
  }
  if (connection.actorType === 'user' && connection.principal) {
    if (access.includes(connection.principal.role)) {
      return true;
    }
    if (connection.principal.role === 'admin' && access.includes('user')) {
      return true;
    }
  }
  return false;
};

const registerWebsocket = async (fastify, actions) => {
  await fastify.register(websocket);

  // Per-connection throttle. The chatbot id is public by design, so without a
  // ceiling here anyone can open a socket and drive unbounded model calls.
  const RATE_WINDOW_MS = 10_000;
  const RATE_MAX_FRAMES = 40;
  const MAX_FRAME_BYTES = 32 * 1024;

  fastify.get('/ws', { websocket: true }, (socket) => {
    const connection = fastify.client.createConnection(socket);
    let windowStart = Date.now();
    let framesInWindow = 0;

    const sendError = (error) => {
      connection.send('error', {
        message: error.message,
        code: error.code || 'websocket_error',
      });
    };

    const exceedsRate = () => {
      const now = Date.now();
      if (now - windowStart > RATE_WINDOW_MS) {
        windowStart = now;
        framesInWindow = 0;
      }
      framesInWindow += 1;
      return framesInWindow > RATE_MAX_FRAMES;
    };

    socket.on('message', async (raw) => {
      try {
        if (raw.length > MAX_FRAME_BYTES) {
          throw new BadRequestError('Message is too large');
        }
        if (exceedsRate()) {
          throw new TooManyRequestsError('Too many messages, slow down');
        }
        const packet = JSON.parse(raw.toString());
        const action = actions[packet.action];

        if (!action) throw new UnauthorizedError('Unknown websocket action');
        if (!hasAccess(connection, action.access)) {
          throw new UnauthorizedError('Websocket action is not allowed');
        }

        const result = await action.handler({
          fastify,
          connection,
          payload: packet.payload || {},
        });

        if (result?.event) connection.send(result.event, result.payload);
      } catch (error) {
        sendError(error);
      }
    });

    socket.on('close', () => {
      fastify.client.remove(connection);
    });
  });
};

module.exports = { registerWebsocket };
