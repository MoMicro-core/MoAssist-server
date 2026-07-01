'use strict';

module.exports = ({ services }) => [
  {
    method: 'GET',
    url: '/v1/chatbots/:chatbotId/external-dashboard',
    access: ['user', 'admin'],
    schema: {
      tags: ['Chatbots'],
      summary: 'Read external dashboard login status',
    },
    handler: async (request) =>
      services.externalDashboardService.getStatus(
        request.appSession,
        request.params.chatbotId,
      ),
  },
  {
    method: 'PUT',
    url: '/v1/chatbots/:chatbotId/external-dashboard',
    access: ['user', 'admin'],
    schema: {
      tags: ['Chatbots'],
      summary: 'Set external dashboard username and password',
      body: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          username: { type: 'string' },
          password: { type: 'string' },
        },
      },
    },
    handler: async (request) =>
      services.externalDashboardService.setCredentials(
        request.appSession,
        request.params.chatbotId,
        request.body || {},
      ),
  },
  {
    method: 'POST',
    url: '/v1/chatbots/:chatbotId/external-dashboard/login',
    access: ['public'],
    schema: {
      tags: ['Widget'],
      summary: 'Log in to the external dashboard with a username and password',
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string' },
          password: { type: 'string' },
        },
      },
    },
    handler: async (request) =>
      services.externalDashboardService.login(
        request.params.chatbotId,
        request.body || {},
      ),
  },
];
