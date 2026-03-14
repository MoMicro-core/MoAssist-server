'use strict';

const { UnauthorizedError } = require('../src/shared/application/errors');

module.exports = ({ services, fastify }) => ({
  'user.authenticate': {
    access: ['public'],
    handler: async ({ connection, payload }) => {
      const session = await fastify.getAppSession(payload.token);
      if (!session) {
        throw new UnauthorizedError('Session is invalid or expired');
      }
      fastify.client.authenticateUser(connection, session);
      return {
        event: 'authenticated',
        payload: { actor: session },
      };
    },
  },
  'widget.authenticate': {
    access: ['public'],
    handler: async ({ connection, payload }) => {
      const { widgetSession, conversation } =
        await services.conversationService.authenticateWidget(payload.token);
      fastify.client.authenticateWidget(connection, widgetSession);
      fastify.client.subscribe(connection, `conversation:${conversation.id}`);
      return {
        event: 'authenticated',
        payload: {
          conversation,
        },
      };
    },
  },
  'chatbot.subscribe': {
    access: ['user', 'admin'],
    handler: async ({ connection, payload }) => {
      const chatbot = await services.chatbotService.getForActor(
        connection.principal,
        payload.chatbotId,
      );
      fastify.client.subscribe(connection, `chatbot:${chatbot.id}`);
      return {
        event: 'subscribed',
        payload: { room: `chatbot:${chatbot.id}` },
      };
    },
  },
  'conversation.subscribe': {
    access: ['user', 'admin'],
    handler: async ({ connection, payload }) => {
      const conversation = await services.conversationService.getForActor(
        connection.principal,
        payload.conversationId,
      );
      fastify.client.subscribe(connection, `conversation:${conversation.id}`);
      return {
        event: 'subscribed',
        payload: { room: `conversation:${conversation.id}` },
      };
    },
  },
  'widget.message': {
    access: ['widget'],
    handler: async ({ connection, payload }) => {
      const result = await services.conversationService.sendVisitorMessage({
        widgetToken: connection.principal.token,
        content: payload.content,
      });
      return {
        event: 'message.accepted',
        payload: result,
      };
    },
  },
  'owner.message': {
    access: ['user', 'admin'],
    handler: async ({ connection, payload }) => {
      const result = await services.conversationService.sendOwnerMessage(
        connection.principal,
        payload.conversationId,
        payload.content,
      );
      return {
        event: 'message.accepted',
        payload: result,
      };
    },
  },
  'conversation.read': {
    access: ['user', 'admin'],
    handler: async ({ connection, payload }) => {
      const result = await services.conversationService.markRead(
        connection.principal,
        payload.conversationId,
      );
      return {
        event: 'conversation.read',
        payload: result,
      };
    },
  },
});
