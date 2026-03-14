'use strict';

const { getBaseUrl } = require('../../src/shared/application/url');

module.exports = ({ services, fastify }) => [
  {
    method: 'GET',
    url: '/health',
    access: ['public'],
    schema: {
      tags: ['Public'],
      summary: 'Service health',
    },
    handler: async () => ({
      service: fastify.config.environment.productName,
      status: 'ok',
    }),
  },
  {
    method: 'GET',
    url: '/v1/public/runtime-config.js',
    access: ['public'],
    schema: {
      tags: ['Public'],
      summary: 'Firebase runtime config',
    },
    handler: async (request, reply) => {
      const baseUrl = getBaseUrl(request, fastify.config.environment.appUrl);
      const payload = {
        apiBaseUrl: baseUrl,
        firebase: {
          apiKey:
            process.env.FIREBASE_PUBLIC_API_KEY || process.env.FBApi_key || '',
          authDomain:
            process.env.FIREBASE_PUBLIC_AUTH_DOMAIN ||
            `${process.env.FIREBASE_PUBLIC_PROJECT_ID || process.env.FBproject_id || ''}.firebaseapp.com`,
          projectId:
            process.env.FIREBASE_PUBLIC_PROJECT_ID ||
            process.env.FIREBASE_PROJECT_ID ||
            process.env.FBproject_id ||
            '',
          storageBucket: process.env.FIREBASE_PUBLIC_STORAGE_BUCKET || '',
          messagingSenderId:
            process.env.FIREBASE_PUBLIC_MESSAGING_SENDER_ID || '',
          appId: process.env.FIREBASE_PUBLIC_APP_ID || '',
          measurementId: process.env.FIREBASE_PUBLIC_MEASUREMENT_ID || '',
        },
        vapidKey: process.env.FIREBASE_PUBLIC_VAPID_KEY || '',
      };
      reply.type('application/javascript');
      return `window.MOMICRO_ASSIST_RUNTIME=${JSON.stringify(payload).replace(/</g, '\\u003c')};`;
    },
  },
  {
    method: 'GET',
    url: '/v1/public/chatbots/:chatbotId/widget',
    access: ['public'],
    schema: {
      tags: ['Public'],
      summary: 'Read public chatbot widget config',
    },
    handler: async (request) => {
      const origin = request.headers.origin || request.headers.referer || '';
      return services.chatbotService.getPublicWidget(
        request.params.chatbotId,
        origin,
      );
    },
  },
  {
    method: 'POST',
    url: '/v1/widget/sessions',
    access: ['public'],
    schema: {
      tags: ['Widget'],
      summary: 'Create or restore a widget session',
      body: {
        type: 'object',
        required: ['chatbotId'],
        properties: {
          chatbotId: { type: 'string' },
          token: { type: 'string' },
          visitor: { type: 'object' },
        },
      },
    },
    handler: async (request) => {
      const origin = request.headers.origin || request.headers.referer || '';
      return services.conversationService.createOrRestoreWidgetSession({
        chatbotId: request.body.chatbotId,
        token: request.body.token,
        visitor: request.body.visitor || {},
        origin,
        locale: request.viewer.locale,
      });
    },
  },
  {
    method: 'GET',
    url: '/chat/script/:chatbotId',
    access: ['public'],
    schema: {
      tags: ['Widget'],
      summary: 'Install script for a chatbot widget',
    },
    handler: async (request, reply) => {
      const origin = request.headers.origin || request.headers.referer || '';
      const chatbot = await services.chatbotService.getPublicWidget(
        request.params.chatbotId,
        origin,
      );
      const baseUrl = getBaseUrl(request, fastify.config.environment.appUrl);
      reply.type('application/javascript');
      return services.embedService.renderScript({ chatbot, baseUrl });
    },
  },
  {
    method: 'GET',
    url: '/chat/iframe/:chatbotId',
    access: ['public'],
    schema: {
      tags: ['Widget'],
      summary: 'Iframe widget page',
    },
    handler: async (request, reply) => {
      const origin = request.headers.origin || request.headers.referer || '';
      const chatbot = await services.chatbotService.getPublicWidget(
        request.params.chatbotId,
        origin,
      );
      const baseUrl = getBaseUrl(request, fastify.config.environment.appUrl);
      reply.type('text/html');
      return services.embedService.renderIframe({ chatbot, baseUrl });
    },
  },
];
