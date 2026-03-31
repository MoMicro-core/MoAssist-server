'use strict';

module.exports = ({ services }) => [
  {
    method: 'POST',
    url: '/v1/auth/session',
    access: ['public'],
    schema: {
      tags: ['Auth'],
      summary: 'Create an application session from a Firebase token',
      body: {
        type: 'object',
        required: ['idToken'],
        properties: {
          idToken: { type: 'string' },
          fcmToken: { type: 'string' },
        },
      },
    },
    handler: async (request) =>
      services.authService.signInWithFirebase(request.body),
  },
  {
    method: 'GET',
    url: '/v1/auth/me',
    access: ['user', 'admin'],
    schema: {
      tags: ['Auth'],
      summary: 'Read the authenticated user',
    },
    handler: async (request) =>
      services.authService.getCurrentUser(request.appSession),
  },
  {
    method: 'POST',
    url: '/v1/auth/logout',
    access: ['user', 'admin'],
    schema: {
      tags: ['Auth'],
      summary: 'Destroy the current application session',
    },
    handler: async (request) =>
      services.authService.logout(request.appSession.token),
  },
  {
    method: 'PATCH',
    url: '/v1/users/me',
    access: ['user', 'admin'],
    schema: {
      tags: ['Users'],
      summary: 'Update the authenticated user',
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      },
    },
    handler: async (request) =>
      services.authService.updateCurrentUser(request.appSession, request.body),
  },
];
