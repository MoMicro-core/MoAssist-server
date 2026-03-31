'use strict';

const { BadRequestError } = require('../../src/shared/application/errors');

const collectMultipartFiles = async (request) => {
  const files = [];
  const parts = request.parts();

  for await (const part of parts) {
    if (part.type !== 'file') continue;
    files.push({
      fileName: part.filename,
      mimeType: part.mimetype,
      buffer: await part.toBuffer(),
    });
  }

  return files;
};

const collectSingleMultipartFile = async (request) => {
  let selected = null;
  const parts = request.parts();

  for await (const part of parts) {
    if (part.type !== 'file') continue;
    if (selected) {
      throw new BadRequestError('Only one logo file can be uploaded');
    }
    selected = {
      fileName: part.filename,
      mimeType: part.mimetype,
      buffer: await part.toBuffer(),
    };
  }

  if (!selected) {
    throw new BadRequestError('Logo file is required');
  }

  return selected;
};

module.exports = ({ services }) => [
  {
    method: 'GET',
    url: '/v1/chatbots',
    access: ['user', 'admin'],
    schema: {
      tags: ['Chatbots'],
      summary: 'List chatbots',
    },
    handler: async (request) =>
      services.chatbotService.list(request.appSession),
  },
  {
    method: 'POST',
    url: '/v1/chatbots',
    access: ['user', 'admin'],
    schema: {
      tags: ['Chatbots'],
      summary: 'Create a chatbot',
      body: {
        type: 'object',
        properties: {
          settings: { type: 'object' },
        },
      },
    },
    handler: async (request) =>
      services.chatbotService.create(request.appSession, request.body || {}),
  },
  {
    method: 'GET',
    url: '/v1/chatbots/languages',
    access: ['user', 'admin'],
    schema: {
      tags: ['Chatbots'],
      summary: 'List allowed chatbot languages',
    },
    handler: async () => services.chatbotService.getLanguageOptions(),
  },
  {
    method: 'GET',
    url: '/v1/chatbots/:chatbotId',
    access: ['user', 'admin'],
    schema: {
      tags: ['Chatbots'],
      summary: 'Read a chatbot',
    },
    handler: async (request) =>
      services.chatbotService.getForActor(
        request.appSession,
        request.params.chatbotId,
      ),
  },
  {
    method: 'PATCH',
    url: '/v1/chatbots/:chatbotId',
    access: ['user', 'admin'],
    schema: {
      tags: ['Chatbots'],
      summary: 'Update a chatbot',
      body: {
        type: 'object',
        properties: {
          settings: { type: 'object' },
        },
      },
    },
    handler: async (request) =>
      services.chatbotService.update(
        request.appSession,
        request.params.chatbotId,
        request.body || {},
      ),
  },
  {
    method: 'PATCH',
    url: '/v1/chatbots/:chatbotId/languages/:language',
    access: ['user', 'admin'],
    schema: {
      tags: ['Chatbots'],
      summary: 'Update a single chatbot language pack without re-translation',
      params: {
        type: 'object',
        required: ['chatbotId', 'language'],
        properties: {
          chatbotId: { type: 'string' },
          language: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          botName: { type: 'string' },
          initialMessage: { type: 'string' },
          inputPlaceholder: { type: 'string' },
          suggestedMessages: {
            type: 'array',
            items: { type: 'string' },
          },
          leadsFormTitle: { type: 'string' },
          leadsFormLabels: {
            type: 'array',
            items: { type: 'string' },
          },
          aiTemplate: { type: 'string' },
          aiGuidelines: { type: 'string' },
        },
      },
    },
    handler: async (request) =>
      services.chatbotService.updateLanguage(
        request.appSession,
        request.params.chatbotId,
        request.params.language,
        request.body || {},
      ),
  },
  {
    method: 'DELETE',
    url: '/v1/chatbots/:chatbotId',
    access: ['user', 'admin'],
    schema: {
      tags: ['Chatbots'],
      summary: 'Delete a chatbot',
    },
    handler: async (request) =>
      services.chatbotService.delete(
        request.appSession,
        request.params.chatbotId,
      ),
  },
  {
    method: 'GET',
    url: '/v1/chatbots/:chatbotId/install',
    access: ['user', 'admin'],
    schema: {
      tags: ['Chatbots'],
      summary: 'Generate script and iframe installation snippets',
    },
    handler: async (request) =>
      services.chatbotService.getInstallCode(
        request.appSession,
        request.params.chatbotId,
        `${request.protocol}://${request.headers.host}`.replace(/\/$/, ''),
      ),
  },
  {
    method: 'GET',
    url: '/v1/chatbots/:chatbotId/analytics',
    access: ['user', 'admin'],
    schema: {
      tags: ['Chatbots'],
      summary: 'Read chatbot analytics',
    },
    handler: async (request) =>
      services.chatbotService.getAnalytics(
        request.appSession,
        request.params.chatbotId,
      ),
  },
  {
    method: 'GET',
    url: '/v1/chatbots/:chatbotId/files',
    access: ['user', 'admin'],
    schema: {
      tags: ['Files'],
      summary: 'List chatbot knowledge files',
    },
    handler: async (request) =>
      services.knowledgeService.list(
        request.appSession,
        request.params.chatbotId,
      ),
  },
  {
    method: 'POST',
    url: '/v1/chatbots/:chatbotId/files',
    access: ['user', 'admin'],
    schema: {
      tags: ['Files'],
      summary: 'Upload chatbot knowledge files',
      consumes: ['multipart/form-data'],
    },
    handler: async (request) => {
      const files = await collectMultipartFiles(request);
      return services.knowledgeService.upload(
        request.appSession,
        request.params.chatbotId,
        files,
      );
    },
  },
  {
    method: 'POST',
    url: '/v1/chatbots/:chatbotId/logo',
    access: ['user', 'admin'],
    schema: {
      tags: ['Chatbots'],
      summary: 'Upload a chatbot logo image',
      consumes: ['multipart/form-data'],
    },
    handler: async (request) => {
      const file = await collectSingleMultipartFile(request);
      return services.chatbotService.uploadLogo(
        request.appSession,
        request.params.chatbotId,
        file,
      );
    },
  },
  {
    method: 'DELETE',
    url: '/v1/chatbots/:chatbotId/files/:fileId',
    access: ['user', 'admin'],
    schema: {
      tags: ['Files'],
      summary: 'Delete a chatbot knowledge file',
    },
    handler: async (request) =>
      services.knowledgeService.delete(
        request.appSession,
        request.params.chatbotId,
        request.params.fileId,
      ),
  },
  {
    method: 'GET',
    url: '/v1/chatbots/:chatbotId/conversations',
    access: ['user', 'admin'],
    schema: {
      tags: ['Conversations'],
      summary: 'List chatbot conversations',
    },
    handler: async (request) =>
      services.conversationService.listForActor(
        request.appSession,
        request.params.chatbotId,
      ),
  },
  {
    method: 'GET',
    url: '/v1/conversations',
    access: ['user', 'admin'],
    schema: {
      tags: ['Conversations'],
      summary: 'List all conversations for current user',
      querystring: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['active', 'pending', 'closed'],
          },
          chatbotId: { type: 'string' },
        },
      },
    },
    handler: async (request) =>
      services.conversationService.listAllForActor(
        request.appSession,
        request.query || {},
      ),
  },
  {
    method: 'GET',
    url: '/v1/conversations/:conversationId',
    access: ['user', 'admin'],
    schema: {
      tags: ['Conversations'],
      summary: 'Read a conversation',
    },
    handler: async (request) =>
      services.conversationService.getForActor(
        request.appSession,
        request.params.conversationId,
      ),
  },
  {
    method: 'POST',
    url: '/v1/conversations/:conversationId/messages',
    access: ['user', 'admin'],
    schema: {
      tags: ['Conversations'],
      summary: 'Send an owner reply',
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string' },
        },
      },
    },
    handler: async (request) =>
      services.conversationService.sendOwnerMessage(
        request.appSession,
        request.params.conversationId,
        request.body.content,
      ),
  },
  {
    method: 'POST',
    url: '/v1/conversations/:conversationId/close',
    access: ['user', 'admin'],
    schema: {
      tags: ['Conversations'],
      summary: 'Close a conversation',
    },
    handler: async (request) =>
      services.conversationService.closeForActor(
        request.appSession,
        request.params.conversationId,
      ),
  },
  {
    method: 'POST',
    url: '/v1/conversations/:conversationId/read',
    access: ['user', 'admin'],
    schema: {
      tags: ['Conversations'],
      summary: 'Mark a conversation as read',
    },
    handler: async (request) =>
      services.conversationService.markRead(
        request.appSession,
        request.params.conversationId,
      ),
  },
];
