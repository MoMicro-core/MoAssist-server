'use strict';

// The settings body used to be declared as `{ type: 'object' }`, which accepts
// any key and any value and fed them straight into a recursive deep-merge. These
// constraints are the boundary: colours must look like colours, strings have a
// ceiling, and unknown keys are rejected rather than merged.
const COLOR = {
  type: 'string',
  maxLength: 64,
  pattern:
    '^$|^(#[0-9a-fA-F]{3,8}|rgba?\\([^)]{1,60}\\)|hsla?\\([^)]{1,60}\\)|[a-zA-Z]{3,20})$',
};

const THEME_PROPERTIES = {
  accentColor: COLOR,
  backgroundColor: COLOR,
  surfaceColor: COLOR,
  launcherBackgroundColor: COLOR,
  inputBackgroundColor: COLOR,
  textColor: COLOR,
  accentTextColor: COLOR,
  borderColor: COLOR,
  suggestionBackgroundColor: COLOR,
  suggestionTextColor: COLOR,
  suggestionBorderColor: COLOR,
};

const themeSchema = {
  type: 'object',
  additionalProperties: false,
  properties: THEME_PROPERTIES,
};

const settingsSchema = {
  type: 'object',
  properties: {
    theme: {
      type: 'object',
      additionalProperties: false,
      properties: { light: themeSchema, dark: themeSchema },
    },
    brand: {
      type: 'object',
      additionalProperties: false,
      properties: {
        logoUrl: { type: 'string', maxLength: 2048 },
        bubbleIconUrl: { type: 'string', maxLength: 2048 },
        logoBackgroundColor: COLOR,
      },
    },
    title: { type: 'string', maxLength: 120 },
    botName: { type: 'string', maxLength: 80 },
    initialMessage: { type: 'string', maxLength: 1000 },
    inputPlaceholder: { type: 'string', maxLength: 200 },
    leadsFormTitle: { type: 'string', maxLength: 200 },
    leadsFormDescription: { type: 'string', maxLength: 600 },
    leadsFormSubmitLabel: { type: 'string', maxLength: 60 },
    leadsFormSkipLabel: { type: 'string', maxLength: 60 },
  },
};

const { getBaseUrl } = require('../../src/shared/application/url');
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

const collectSingleMultipartFile = async (
  request,
  { entityLabel = 'file' } = {},
) => {
  let selected = null;
  const parts = request.parts();

  for await (const part of parts) {
    if (part.type !== 'file') continue;
    if (selected) {
      throw new BadRequestError(`Only one ${entityLabel} file can be uploaded`);
    }
    selected = {
      fileName: part.filename,
      mimeType: part.mimetype,
      buffer: await part.toBuffer(),
    };
  }

  if (!selected) {
    throw new BadRequestError(`${entityLabel} file is required`);
  }

  return selected;
};

module.exports = ({ services, fastify }) => [
  {
    method: 'GET',
    url: '/v1/chatbots',
    access: ['user', 'admin'],
    schema: {
      tags: ['Chatbots'],
      summary: 'List chatbots',
      querystring: {
        type: 'object',
        properties: {
          ownerUid: { type: 'string' },
        },
      },
    },
    handler: async (request) =>
      services.chatbotService.list(request.appSession, request.query || {}),
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
          settings: settingsSchema,
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
          settings: settingsSchema,
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
    method: 'POST',
    url: '/v1/chatbots/:chatbotId/preview/widget',
    access: ['user', 'admin'],
    schema: {
      tags: ['Chatbots'],
      summary: 'Render a live chatbot widget preview from draft settings',
      body: {
        type: 'object',
        properties: {
          settings: settingsSchema,
          mode: {
            type: 'string',
            enum: ['light', 'dark'],
          },
          selectedPart: { type: 'string' },
        },
      },
    },
    handler: async (request) => {
      const chatbot = await services.chatbotService.getPreviewWidget(
        request.appSession,
        request.params.chatbotId,
        request.body?.settings || {},
      );
      const baseUrl = getBaseUrl(request, fastify.config.environment.appUrl);

      return {
        html: services.embedService.renderIframe({
          chatbot,
          baseUrl,
          preview: {
            enabled: true,
            mode: request.body?.mode || 'light',
            selectedPart: request.body?.selectedPart || 'launcher',
          },
        }),
      };
    },
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
      const file = await collectSingleMultipartFile(request, {
        entityLabel: 'logo',
      });
      return services.chatbotService.uploadLogo(
        request.appSession,
        request.params.chatbotId,
        file,
      );
    },
  },
  {
    method: 'POST',
    url: '/v1/chatbots/:chatbotId/bubble-icon',
    access: ['user', 'admin'],
    schema: {
      tags: ['Chatbots'],
      summary: 'Upload a chatbot launcher icon image',
      consumes: ['multipart/form-data'],
    },
    handler: async (request) => {
      const file = await collectSingleMultipartFile(request, {
        entityLabel: 'bubble icon',
      });
      return services.chatbotService.uploadBubbleIcon(
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
    access: ['user', 'admin', 'dashboard'],
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
          ownerUid: { type: 'string' },
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
    access: ['user', 'admin', 'dashboard'],
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
    access: ['user', 'admin', 'dashboard'],
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
    access: ['user', 'admin', 'dashboard'],
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
    access: ['user', 'admin', 'dashboard'],
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
