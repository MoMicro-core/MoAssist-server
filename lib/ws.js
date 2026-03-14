'use strict';

const websocket = require('@fastify/websocket');
const { UnauthorizedError } = require('../src/shared/application/errors');

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

  fastify.get('/ws', { websocket: true }, (socket) => {
    const connection = fastify.client.createConnection(socket);

    const sendError = (error) => {
      connection.send('error', {
        message: error.message,
        code: error.code || 'websocket_error',
      });
    };

    socket.on('message', async (raw) => {
      try {
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
