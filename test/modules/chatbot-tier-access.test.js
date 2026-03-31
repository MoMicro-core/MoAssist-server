'use strict';

const billingConfig = require('../../config/billing');
const { createTierCatalog } = require('../../src/shared/application/premium');
const {
  ChatbotService,
} = require('../../src/modules/chatbots/application/chatbot-service');
const {
  createDefaultChatbotSettings,
} = require('../../src/modules/chatbots/domain/default-settings');

const clone = (value) => JSON.parse(JSON.stringify(value));

const createChatbotDocument = (chatbot) => {
  const state = {
    ...clone(chatbot),
    settings: clone(chatbot.settings),
  };

  const document = {
    id: state.id,
    ownerUid: state.ownerUid,
    premiumStatus: state.premiumStatus,
    premiumPlan: state.premiumPlan,
    premiumCurrentPeriodEnd: state.premiumCurrentPeriodEnd,
    save: jest.fn(async () => document),
    toObject: () => ({
      ...state,
      settings: clone(state.settings),
    }),
  };

  Object.defineProperty(document, 'settings', {
    enumerable: true,
    configurable: true,
    get() {
      return {
        toObject: () => clone(state.settings),
      };
    },
    set(value) {
      state.settings = clone(value);
    },
  });

  return document;
};

const createService = (overrides = {}) =>
  new ChatbotService({
    chatbotRepository: overrides.chatbotRepository || {
      findById: jest.fn(),
      findDocumentById: jest.fn(),
      create: jest.fn(),
      listByOwner: jest.fn(async () => []),
      listAll: jest.fn(async () => []),
    },
    conversationRepository: {
      countByChatbot: jest.fn(async () => 0),
      countUnreadByChatbot: jest.fn(async () => 0),
    },
    widgetSessionRepository: {},
    knowledgeFileRepository: {
      countByChatbot: jest.fn(async () => 0),
    },
    openai: overrides.openai || {
      createChatCompletion: jest.fn(),
    },
    countriesConfig: overrides.countriesConfig || {},
    tierCatalog: createTierCatalog(billingConfig),
  });

describe('chatbot tier access', () => {
  test('free tier cannot enable authClient conversations', async () => {
    const chatbot = {
      id: 'cb-free',
      ownerUid: 'owner-1',
      premiumStatus: 'free',
      premiumPlan: 'free',
      premiumCurrentPeriodEnd: null,
      settings: createDefaultChatbotSettings(),
    };
    const document = createChatbotDocument(chatbot);
    const service = createService({
      chatbotRepository: {
        findDocumentById: jest.fn(async () => document),
      },
    });

    await expect(
      service.update({ uid: 'owner-1', role: 'user' }, chatbot.id, {
        settings: { auth: true },
      }),
    ).rejects.toThrow('Current tier does not allow authClient conversations');
  });

  test('auth tier allows authClient but still blocks AI', async () => {
    const chatbot = {
      id: 'cb-auth',
      ownerUid: 'owner-1',
      premiumStatus: 'active',
      premiumPlan: 'auth',
      premiumCurrentPeriodEnd: null,
      settings: createDefaultChatbotSettings(),
    };
    const document = createChatbotDocument(chatbot);
    const service = createService({
      chatbotRepository: {
        findDocumentById: jest.fn(async () => document),
      },
    });

    const updated = await service.update(
      { uid: 'owner-1', role: 'user' },
      chatbot.id,
      { settings: { auth: true } },
    );

    expect(updated.settings.auth).toBe(true);

    await expect(
      service.update({ uid: 'owner-1', role: 'user' }, chatbot.id, {
        settings: { ai: { enabled: true } },
      }),
    ).rejects.toThrow('Current tier does not allow AI responses');
  });

  test('public widget disables inaccessible AI features after downgrade', async () => {
    const settings = createDefaultChatbotSettings();
    settings.status = 'published';
    settings.auth = true;
    settings.ai.enabled = true;

    const service = createService({
      chatbotRepository: {
        findById: jest.fn(async () => ({
          id: 'cb-public',
          ownerUid: 'owner-1',
          premiumStatus: 'active',
          premiumPlan: 'auth',
          premiumCurrentPeriodEnd: null,
          settings,
        })),
      },
    });

    const widget = await service.getPublicWidget('cb-public');

    expect(widget.settings.auth).toBe(true);
    expect(widget.settings.ai.enabled).toBe(false);
  });

  test('downgraded chatbot can save other settings without resubmitting blocked AI access', async () => {
    const settings = createDefaultChatbotSettings();
    settings.auth = true;
    settings.ai.enabled = true;

    const chatbot = {
      id: 'cb-downgraded',
      ownerUid: 'owner-1',
      premiumStatus: 'active',
      premiumPlan: 'auth',
      premiumCurrentPeriodEnd: null,
      settings,
    };
    const document = createChatbotDocument(chatbot);
    const service = createService({
      chatbotRepository: {
        findDocumentById: jest.fn(async () => document),
      },
    });

    const updated = await service.update(
      { uid: 'owner-1', role: 'user' },
      chatbot.id,
      { settings: { title: 'Updated title' } },
    );

    expect(updated.settings.title).toBe('Updated title');
    expect(updated.settings.auth).toBe(true);
    expect(updated.settings.ai.enabled).toBe(false);
  });

  test('install payload hides admin dashboard embed on free tier', async () => {
    const settings = createDefaultChatbotSettings();
    const service = createService({
      chatbotRepository: {
        findById: jest.fn(async () => ({
          id: 'cb-free-install',
          ownerUid: 'owner-1',
          premiumStatus: 'free',
          premiumPlan: 'free',
          premiumCurrentPeriodEnd: null,
          settings,
        })),
      },
    });

    const install = await service.getInstallCode(
      { uid: 'owner-1', role: 'user' },
      'cb-free-install',
      'https://api.test',
    );

    expect(install.dashboardInstallEnabled).toBe(false);
    expect(install.dashboardScriptSnippet).toBe('');
    expect(install.dashboardIframeSnippet).toBe('');
  });

  test('install payload exposes admin dashboard embed on auth tier', async () => {
    const settings = createDefaultChatbotSettings();
    const service = createService({
      chatbotRepository: {
        findById: jest.fn(async () => ({
          id: 'cb-auth-install',
          ownerUid: 'owner-1',
          premiumStatus: 'active',
          premiumPlan: 'auth',
          premiumCurrentPeriodEnd: null,
          settings,
        })),
      },
    });

    const install = await service.getInstallCode(
      { uid: 'owner-1', role: 'user' },
      'cb-auth-install',
      'https://api.test',
    );

    expect(install.dashboardInstallEnabled).toBe(true);
    expect(install.dashboardScriptSnippet).toContain(
      '/chat/dashboard/script/cb-auth-install',
    );
    expect(install.dashboardIframeSnippet).toContain(
      '/chat/dashboard/iframe/cb-auth-install',
    );
  });

  test('chatbot creation keeps only selected languages', async () => {
    const service = createService({
      chatbotRepository: {
        create: jest.fn(async (payload) => payload),
        listByOwner: jest.fn(async () => []),
        listAll: jest.fn(async () => []),
      },
      countriesConfig: {
        localizationByCountry: {
          de: { language: 'german' },
        },
      },
      openai: {
        createChatCompletion: jest.fn(async () =>
          JSON.stringify({
            translations: {
              english: {
                title: 'Sales assistant',
                botName: 'Sales helper',
                initialMessage: 'Hello there',
                inputPlaceholder: 'Write a message',
                suggestedMessages: [],
                leadsFormTitle: 'Leave your contact information',
                leadsFormLabels: ['Name', 'Email'],
                aiTemplate: 'Support assistant',
                aiGuidelines:
                  'Answer clearly, politely and only using available context.',
              },
            },
          }),
        ),
      },
    });

    const created = await service.create(
      { uid: 'owner-1', role: 'user' },
      {
        settings: {
          title: 'Sales assistant',
          botName: 'Sales helper',
          defaultLanguage: 'german',
          enabledLanguages: ['english', 'german'],
        },
      },
    );

    expect(created.settings.defaultLanguage).toBe('german');
    expect(created.settings.enabledLanguages).toEqual(['german', 'english']);
    expect(Object.keys(created.settings.translations).sort()).toEqual([
      'english',
      'german',
    ]);
  });
});
