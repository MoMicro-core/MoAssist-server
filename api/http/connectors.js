'use strict';

// Real-time data connectors are authored only by the platform operator
// (sole-author invariant), so every management route is admin-only.
module.exports = ({ services }) => [
  {
    method: 'GET',
    url: '/v1/chatbots/:chatbotId/connector',
    access: ['admin'],
    schema: {
      tags: ['Chatbots'],
      summary: 'Read the real-time data connector for a chatbot',
    },
    handler: async (request) =>
      services.realtimeService.getConnector(
        request.appSession,
        request.params.chatbotId,
      ),
  },
  {
    method: 'PUT',
    url: '/v1/chatbots/:chatbotId/connector',
    access: ['admin'],
    schema: {
      tags: ['Chatbots'],
      summary: 'Create or update the real-time data connector for a chatbot',
      body: {
        type: 'object',
        required: ['source'],
        properties: {
          source: { type: 'string' },
          enabled: { type: 'boolean' },
          baseUrl: { type: 'string' },
          allowedHosts: { type: 'array', items: { type: 'string' } },
          secrets: { type: 'object' },
          intents: { type: 'array' },
          routerThreshold: { type: 'number' },
          routerMargin: { type: 'number' },
        },
      },
    },
    handler: async (request) =>
      services.realtimeService.setConnector(
        request.appSession,
        request.params.chatbotId,
        request.body || {},
      ),
  },
  {
    method: 'POST',
    url: '/v1/chatbots/:chatbotId/connector/resync',
    access: ['admin'],
    schema: {
      tags: ['Chatbots'],
      summary: 'Re-download the connector from storage and refresh the cache',
    },
    handler: async (request) =>
      services.realtimeService.resync(
        request.appSession,
        request.params.chatbotId,
      ),
  },
];
