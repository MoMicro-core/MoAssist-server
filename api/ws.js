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
        await services.conversationService.authenticateWidget(
          payload.token,
          payload.authClient || '',
        );
      fastify.client.authenticateWidget(connection, widgetSession);
      fastify.client.subscribe(connection, `conversation:${conversation.id}`);

      // Sync the visitor's auth state in the background: a token verifies
      // the identity once (or re-verifies after an account switch), no token
      // clears it (logout). Chat messages never carry identity.
      services.realtimeService
        .syncForWidget({
          chatbotId: conversation.chatbotId,
          widgetToken: payload.token,
          token: payload.realtimeToken || '',
        })
        .catch(() => null);

      return {
        event: 'authenticated',
        payload: {
          conversation,
        },
      };
    },
  },
  'chatbot.subscribe': {
    access: ['user', 'admin', 'dashboard'],
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
    access: ['user', 'admin', 'dashboard'],
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
        authClient: connection.principal.authClient || '',
        content: payload.content,
      });
      return {
        event: 'message.accepted',
        payload: result,
      };
    },
  },
  'widget.read': {
    access: ['widget'],
    handler: async ({ connection }) => {
      const result = await services.conversationService.markReadByWidget(
        connection.principal.token,
      );
      return {
        event: 'conversation.read',
        payload: result,
      };
    },
  },
  'widget.close': {
    access: ['widget'],
    handler: async ({ connection }) => {
      const result = await services.conversationService.closeForWidget(
        connection.principal.token,
        connection.principal.authClient || '',
      );
      return {
        event: 'conversation.closed',
        payload: result,
      };
    },
  },
  'owner.message': {
    access: ['user', 'admin', 'dashboard'],
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
  'conversation.close': {
    access: ['user', 'admin', 'dashboard'],
    handler: async ({ connection, payload }) => {
      const result = await services.conversationService.closeForActor(
        connection.principal,
        payload.conversationId,
      );
      return {
        event: 'conversation.closed',
        payload: result,
      };
    },
  },
  'conversation.read': {
    access: ['user', 'admin', 'dashboard'],
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
